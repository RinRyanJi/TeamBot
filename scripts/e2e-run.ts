// Resident AgentHub assistant (architecture full loop, persistent session).
//   ONE long-lived Codex session (thread) runs in D:\AgentHub. It stays resident and is
//   reused for every message (conversation continuity). Each !tb message is a new TURN on
//   that same thread. Side-effecting actions need approval: Codex asks -> forwarded to
//   Teams -> you reply !tb approve/deny <code>. `!tb <free text>` defaults to AgentHub.
//
// Run: node --experimental-strip-types --experimental-sqlite scripts/e2e-run.ts [--port 9355]
// Send in the open conversation:  !tb <your question or task>
// Stop: kill the process (Ctrl-C / Stop-Process electron).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import { parseWithImplicitRun, REPORT_PREFIX } from "../src/router/parser.ts";
import { ensureWorkspace, DEFAULT_WORKSPACE, DEFAULT_PROJECT_ID } from "../src/app/defaults.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const hostCjs = join(here, "..", "launcher", "electron", "teams-host.cjs");
const electronPath = require("electron") as string;

const portArg = process.argv.indexOf("--port");
const PORT = portArg >= 0 ? process.argv[portArg + 1]! : "9355";
const log = (m: string) => console.log("[E2E] " + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function collectText(obj: unknown, out: string[]): void {
  if (obj == null) return;
  if (Array.isArray(obj)) return obj.forEach((v) => collectText(v, out));
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "text" && typeof v === "string" && v.trim()) out.push(v.trim());
      else collectText(v, out);
    }
  }
}
function describeApproval(method: string, params: unknown): string {
  const p = (params ?? {}) as Record<string, unknown>;
  if (Array.isArray(p.command)) return "command: " + (p.command as string[]).join(" ");
  const item = p.item as Record<string, unknown> | undefined;
  if (item && typeof item.type === "string") return "item: " + item.type;
  return method;
}

async function main(): Promise<void> {
  ensureWorkspace();
  log("workspace: " + DEFAULT_WORKSPACE.cwd);

  // --- ONE persistent Codex session in AgentHub ---
  const codex = new CodexAdapter();
  await codex.start();
  let threadId = "";
  codex.on("thread/started", (p: unknown) => {
    const id = (p as { threadId?: string })?.threadId;
    if (id) threadId = id;
  });

  // Per-turn state (single active turn at a time on the resident thread).
  let activeJobId = "";
  let turnSettled = false;
  let texts: string[] = [];
  let approvalSeq = 0;
  const pending = new Map<string, { reqId: number; method: string }>();
  let teams: PlaywrightTeamsAdapter | null = null;

  codex.on("item/completed", (p: unknown) => collectText(p, texts));
  codex.on("turn/completed", () => (turnSettled = true));
  codex.on("serverRequest", (req: unknown) => {
    const r = req as { id: number; method: string; params?: unknown };
    if (!r.method.includes("requestApproval")) return;
    const code = "A" + ++approvalSeq;
    pending.set(code, { reqId: r.id, method: r.method });
    if (teams)
      void teams.sendMessage(
        `[TB ${activeJobId}] 需要批准 ${code}:${describeApproval(r.method, r.params)}\n回 "!tb approve ${code}" 或 "!tb deny ${code}"`,
      );
  });

  const ts = (await codex.startThread({
    cwd: DEFAULT_WORKSPACE.cwd,
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
  })) as { threadId?: string; thread?: { id?: string } };
  threadId = ts.threadId ?? ts.thread?.id ?? threadId;
  if (!threadId) await sleep(1500);
  log("RESIDENT codex thread in AgentHub: " + (threadId || "(via event)"));

  // --- Teams host (app-owned surface) + CDP attach ---
  const cp = spawn(
    electronPath,
    [hostCjs, "--show", "--port", PORT, "--url", "https://teams.microsoft.com/"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const ready = await new Promise<boolean>((resolve) => {
    let out = "";
    cp.stdout.on("data", (d) => {
      out += d.toString();
      if (out.includes("TEAMS_HOST_READY")) resolve(true);
      if (out.includes("TEAMS_HOST_ERROR")) resolve(false);
    });
    cp.on("error", () => resolve(false));
    setTimeout(() => resolve(false), 60_000).unref();
  });
  if (!ready) {
    log("teams-host failed");
    codex.stop();
    cp.kill();
    process.exit(1);
  }
  teams = new PlaywrightTeamsAdapter({ url: "", profile: "teams" });
  await teams.connectCDP("http://127.0.0.1:" + PORT);
  log("attached over CDP to chat: " + teams.chatId());

  const baseline = new Set((await teams.readMessages()).map((m) => m.messageId));
  log(`RESIDENT. baseline ${baseline.size} msgs. Send:  !tb <your question or task>`);

  // --- resident loop: never exits on its own ---
  let polls = 0;
  for (;;) {
    let msgs;
    try {
      msgs = await teams.readMessages();
    } catch (e) {
      log("read error (host closed?): " + (e as Error).message);
      break;
    }
    if (polls++ % 6 === 0) log(`poll: ${msgs.length} msgs; active=${activeJobId || "-"}`);

    for (const m of msgs) {
      if (baseline.has(m.messageId)) continue;
      baseline.add(m.messageId);
      if (m.text.includes(REPORT_PREFIX)) continue; // our own reports
      const norm = m.text.replace(/！/g, "!").replace(/＠/g, "@").replace(/　/g, " ");
      const match = norm.toLowerCase().match(/[!@]tb/);
      const idx = match?.index ?? -1;
      if (idx < 0) continue;
      log("msg: " + JSON.stringify(norm.slice(idx, idx + 100)));
      const parsed = parseWithImplicitRun(norm.slice(idx), DEFAULT_PROJECT_ID);
      if (!parsed.ok) {
        continue;
      }
      const c = parsed.command;

      if (c.kind === "run") {
        if (activeJobId) {
          await teams.sendMessage(`[TB ${activeJobId}] 忙碌中,前一項還在執行,請稍後再送。`);
          continue;
        }
        activeJobId = "T" + String(Date.now()).slice(-4);
        turnSettled = false;
        texts = [];
        log(`turn: ${c.request}`);
        await teams.sendMessage(`[TB ${activeJobId}] 收到(AgentHub):${c.request}`);
        await codex.startTurn({
          threadId,
          input: [{ type: "text", text: c.request, text_elements: [] }],
        });
      } else if (c.kind === "approve" || c.kind === "deny") {
        const p = pending.get(c.code);
        if (p) {
          const approve = c.kind === "approve";
          codex.respond(p.reqId, { decision: approve ? "accept" : "decline" });
          pending.delete(c.code);
          await teams.sendMessage(`[TB ${activeJobId}] ${c.code} 已${approve ? "批准" : "拒絕"}。`);
          log(`${c.code} ${approve ? "approved" : "denied"}`);
        }
      } else if (c.kind === "help") {
        await teams.sendMessage(`[TB] 直接輸入需求即可(預設在 AgentHub);批准用 !tb approve <碼>。`);
      }
    }

    if (turnSettled && activeJobId) {
      const summary = texts.length ? texts[texts.length - 1]!.slice(0, 1400) : "(無文字輸出)";
      await teams.sendMessage(`[TB ${activeJobId}] 已完成:\n${summary}`);
      log("result sent for " + activeJobId);
      activeJobId = ""; // ready for the next message; session stays resident
      turnSettled = false;
    }
    await sleep(2500);
  }

  codex.stop();
  await teams.close().catch(() => undefined);
  cp.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error("[E2E] fatal", e);
  process.exit(1);
});
