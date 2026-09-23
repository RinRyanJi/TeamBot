// End-to-end real run WITH a human-in-the-loop approval gate (architecture §5/§8).
//   real Teams (CDP, app-owned surface) -> read your !tb run -> real Codex in D:\AgentHub
//   (approvalPolicy=on-request, sandbox=workspace-write) -> Codex asks approval for
//   side-effecting actions -> forwarded to Teams -> you reply !tb approve/deny <code>
//   -> result reported back. Nothing side-effecting runs without your approval.
//
// Run: node --experimental-strip-types --experimental-sqlite scripts/e2e-run.ts [--port 9350]
// Then in the OPEN Teams conversation: !tb run AgentHub <request>
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import { parseCommand } from "../src/router/parser.ts";
import { ensureWorkspace, DEFAULT_WORKSPACE, DEFAULT_PROJECT_ID } from "../src/app/defaults.ts";
import { REPORT_PREFIX } from "../src/router/parser.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const hostCjs = join(here, "..", "launcher", "electron", "teams-host.cjs");
const electronPath = require("electron") as string;

const portArg = process.argv.indexOf("--port");
const PORT = portArg >= 0 ? process.argv[portArg + 1]! : "9350";
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

// Never auto-approve: accept only when the human said so; anything else declines.
function decisionFor(method: string, approve: boolean): { decision: string } {
  return { decision: approve ? "accept" : "decline" };
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
    log("teams-host failed to start");
    cp.kill();
    process.exit(1);
  }
  log("teams-host ready (loopback CDP :" + PORT + ")");

  const teams = new PlaywrightTeamsAdapter({ url: "", profile: "teams" });
  await teams.connectCDP("http://127.0.0.1:" + PORT);
  log("attached over CDP to chat: " + teams.chatId());

  const baseline = new Set((await teams.readMessages()).map((m) => m.messageId));
  log(`baseline ${baseline.size} msgs. NOW send:  !tb run ${DEFAULT_PROJECT_ID} <request>`);

  let phase: "await-run" | "running" = "await-run";
  let codex: CodexAdapter | null = null;
  let jobId = "";
  let approvalSeq = 0;
  let turnSettled = false;
  const pending = new Map<string, { reqId: number; method: string }>();
  const texts: string[] = [];

  const deadline = Date.now() + 420_000; // 7 min window
  let polls = 0;
  while (Date.now() < deadline) {
    const msgs = await teams.readMessages();
    if (polls++ % 4 === 0) log("poll: " + msgs.length + " msgs visible");
    for (const m of msgs) {
      if (baseline.has(m.messageId)) continue;
      baseline.add(m.messageId);
      // Log EVERY new message so we can see exactly what arrives from Teams.
      log("msg[" + m.messageId.slice(-6) + "]: " + JSON.stringify(m.text.slice(0, 120)));
      // Skip TeamBot's own report/instruction lines (they contain "[TB ..." and may
      // include example "!tb approve" text we must NOT parse as a real command).
      if (m.text.includes(REPORT_PREFIX)) continue;
      // Normalize full-width punctuation (mobile keyboards) and find the command
      // substring (real Teams text has author/timestamp around the body).
      const norm = m.text.replace(/！/g, "!").replace(/　/g, " ");
      const idx = norm.toLowerCase().indexOf("!tb");
      if (idx < 0) continue;
      const parsed = parseCommand(norm.slice(idx));
      if (!parsed.ok) {
        log("  not a command: " + parsed.reason);
        continue;
      }

      if (phase === "await-run" && parsed.command.kind === "run") {
        phase = "running";
        jobId = "T" + String(Date.now()).slice(-3);
        const cwd = DEFAULT_WORKSPACE.cwd;
        log(`run: ${parsed.command.request}`);
        await teams.sendMessage(`[TB ${jobId}] 已接收,於 ${cwd} 執行(需批准才會動作):${parsed.command.request}`);

        codex = new CodexAdapter();
        await codex.start();
        codex.on("item/completed", (p: unknown) => collectText(p, texts));
        codex.once("turn/completed", () => (turnSettled = true));
        codex.on("serverRequest", (req: unknown) => {
          const r = req as { id: number; method: string; params?: unknown };
          if (!r.method.includes("requestApproval")) return;
          const code = "A" + ++approvalSeq;
          pending.set(code, { reqId: r.id, method: r.method });
          void teams.sendMessage(
            `[TB ${jobId}] 需要批准 ${code}:${describeApproval(r.method, r.params)}\n回 "!tb approve ${code}" 或 "!tb deny ${code}"`,
          );
        });

        let threadId = "";
        codex.on("thread/started", (p: unknown) => {
          const id = (p as { threadId?: string })?.threadId;
          if (id) threadId = id;
        });
        const ts = (await codex.startThread({
          cwd,
          approvalPolicy: "on-request",
          sandbox: "workspace-write",
        })) as { threadId?: string; thread?: { id?: string } };
        threadId = ts.threadId ?? ts.thread?.id ?? threadId;
        if (!threadId) await sleep(1500);
        await codex.startTurn({
          threadId,
          input: [{ type: "text", text: parsed.command.request, text_elements: [] }],
        });
        log("codex turn started (thread " + (threadId || "via-event") + ")");
      } else if (
        phase === "running" &&
        codex &&
        (parsed.command.kind === "approve" || parsed.command.kind === "deny")
      ) {
        const code = parsed.command.code;
        const p = pending.get(code);
        if (p) {
          const approve = parsed.command.kind === "approve";
          codex.respond(p.reqId, decisionFor(p.method, approve));
          pending.delete(code);
          await teams.sendMessage(`[TB ${jobId}] ${code} 已${approve ? "批准" : "拒絕"}。`);
          log(`${code} ${approve ? "approved" : "denied"}`);
        }
      }
    }

    if (turnSettled) {
      const summary = texts.length ? texts[texts.length - 1]!.slice(0, 1200) : "(無輸出文字)";
      await teams.sendMessage(`[TB ${jobId}] 已完成。結果摘要:\n${summary}`);
      log("result sent; done.");
      break;
    }
    await sleep(2500);
  }

  if (codex) codex.stop();
  await teams.close().catch(() => undefined);
  cp.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error("[E2E] fatal", e);
  process.exit(1);
});
