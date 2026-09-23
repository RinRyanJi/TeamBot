// Resident AgentHub assistant — INTEGRATED build (roadmap A–F wired in).
//   One persistent Codex thread in D:\AgentHub, driven from Teams over CDP. Integrates:
//   - task021 security posture (read-only default; unlock/lock/kill; sandboxPolicy)
//   - task026 continuity (persist threadId in AgentHub SQLite; thread/resume; boot recovery)
//   - task022 result reducer (turn fold -> final answer + change list; idempotent)
//   - task023 live status model + coalescer (status card; !tb status pull)
//   - task024 approval registry (code<->requestId; timeouts auto-decline; input answers)
//
// Run: node --experimental-strip-types --experimental-sqlite scripts/e2e-run.ts [--port 9360]
// Send:  !tb <task>  ·  !tb status  ·  !tb approve <code>  ·  !tb unlock <min>  ·  !tb kill
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import { parseWithImplicitRun, REPORT_PREFIX } from "../src/router/parser.ts";
import { ensureWorkspace, DEFAULT_WORKSPACE, DEFAULT_PROJECT_ID } from "../src/app/defaults.ts";
import { SecurityPolicy } from "../src/security/policy.ts";
import { redactString } from "../src/util/redact.ts";
import { Store } from "../src/storage/store.ts";
import { bootRecovery, saveResidentThread } from "../src/supervisor/session.ts";
import { ApprovalRegistry } from "../src/router/approval-registry.ts";
import { TurnStatus } from "../src/progress/status-model.ts";
import { reduceTurn, formatResult, type TurnEvent } from "../src/progress/result-reducer.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const hostCjs = join(here, "..", "launcher", "electron", "teams-host.cjs");
const electronPath = require("electron") as string;
const portArg = process.argv.indexOf("--port");
const PORT = portArg >= 0 ? process.argv[portArg + 1]! : "9360";
const log = (m: string) => console.log("[E2E] " + m);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function firstString(obj: unknown, key: string): string | undefined {
  if (obj == null || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  if (typeof rec[key] === "string") return rec[key] as string;
  for (const v of Object.values(rec)) {
    const found = firstString(v, key);
    if (found) return found;
  }
  return undefined;
}
function collectText(obj: unknown, out: string[]): void {
  if (obj == null) return;
  if (Array.isArray(obj)) return obj.forEach((v) => collectText(v, out));
  if (typeof obj === "object")
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === "text" && typeof v === "string" && v.trim()) out.push(v.trim());
      else collectText(v, out);
    }
}

async function main(): Promise<void> {
  ensureWorkspace();
  const stateDir = join(DEFAULT_WORKSPACE.cwd, ".teambot");
  mkdirSync(stateDir, { recursive: true });
  const store = new Store(join(stateDir, "state.sqlite"));
  const policy = new SecurityPolicy("read-only");
  const registry = new ApprovalRegistry(30 * 60_000);
  log("workspace: " + DEFAULT_WORKSPACE.cwd);

  // Boot recovery: resume the persisted thread; mark in-flight interrupted.
  const recovery = bootRecovery(store);
  if (recovery.interruptedJobs.length)
    log("recovered interrupted jobs: " + recovery.interruptedJobs.join(","));

  const codex = new CodexAdapter();
  await codex.start();

  // Per-turn integrated state.
  let activeJobId = "";
  let turnId = "";
  let turnSettled = false;
  let status = new TurnStatus(15_000);
  let turnEvents: TurnEvent[] = [];
  let teams: PlaywrightTeamsAdapter | null = null;

  codex.on("thread/started", (p: unknown) => {
    const id = firstString(p, "threadId");
    if (id) turnId ||= "";
  });
  codex.on("turn/started", (p: unknown) => {
    const t = firstString(p, "turnId");
    if (t) turnId = t;
    status.setStep("執行中", now());
  });
  codex.on("item/started", (p: unknown) => {
    const t = firstString(p, "type") ?? firstString(p, "title");
    if (t) status.setStep(t, now());
  });
  codex.on("item/completed", (p: unknown) => {
    const texts: string[] = [];
    collectText(p, texts);
    if (texts.length) turnEvents.push({ kind: "agentMessage", phase: "commentary", text: texts[texts.length - 1]! });
  });
  codex.on("item/commandExecution/outputDelta", (p: unknown) => {
    const line = firstString(p, "chunk") ?? firstString(p, "text") ?? firstString(p, "delta");
    if (line) status.pushOutput(redactString(line).slice(0, 120), now());
  });
  codex.on("thread/tokenUsage/updated", (p: unknown) => {
    const t = (p as { total?: number; totalTokens?: number })?.total ?? (p as { totalTokens?: number })?.totalTokens;
    if (typeof t === "number") status.setTokens(t, now());
  });
  codex.on("turn/diff/updated", (p: unknown) => {
    try {
      const files = (p as { files?: Array<{ path: string; added?: number; removed?: number }> })?.files;
      if (Array.isArray(files))
        turnEvents.push({ kind: "diff", files: files.map((f) => ({ path: f.path, added: f.added ?? 0, removed: f.removed ?? 0 })) });
    } catch { /* best-effort */ }
  });
  codex.on("turn/completed", () => (turnSettled = true));
  codex.on("serverRequest", (req: unknown) => {
    const r = req as { id: number; method: string; params?: unknown };
    if (!r.method.includes("requestApproval") && !r.method.includes("requestUserInput")) return;
    const { code, kind } = registry.register(r.id, r.method, now());
    const desc = firstString(r.params, "command") ?? firstString(r.params, "path") ?? kind;
    if (teams)
      void teams.sendMessage(
        `[TB ${activeJobId}] 需要${kind === "input" ? "回答" : "批准"} ${code}(${kind}):${redactString(String(desc)).slice(0, 120)}\n回 "!tb ${kind === "input" ? "answer " + code + " <答案>" : "approve " + code + " / !tb deny " + code}"`,
      );
  });

  // Persistent thread: resume if we have one, else start.
  const sandboxPolicyFor = () =>
    policy.effectiveSandbox(now()) === "workspace-write"
      ? { type: "workspaceWrite", writableRoots: [DEFAULT_WORKSPACE.cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false }
      : { type: "readOnly", networkAccess: false };
  let threadId = "";
  codex.on("thread/started", (p: unknown) => {
    const id = firstString(p, "threadId");
    if (id) threadId = id;
  });
  try {
    if (recovery.resume.mode === "resume" && recovery.resume.threadId) {
      const rr = (await codex.resumeThread({ threadId: recovery.resume.threadId })) as { threadId?: string };
      threadId = rr?.threadId ?? recovery.resume.threadId;
      log("RESUMED thread " + threadId);
    } else {
      throw new Error("no thread to resume");
    }
  } catch {
    const ts = (await codex.startThread({ cwd: DEFAULT_WORKSPACE.cwd, approvalPolicy: "on-request", sandbox: "read-only" })) as { threadId?: string };
    threadId = ts.threadId ?? threadId;
    if (!threadId) await sleep(1500);
    log("STARTED thread " + (threadId || "(via event)"));
  }
  if (threadId) saveResidentThread(store, threadId, now());

  // Teams host + CDP + event-driven inbox.
  const cp = spawn(electronPath, [hostCjs, "--show", "--port", PORT, "--url", "https://teams.microsoft.com/"], { stdio: ["ignore", "pipe", "pipe"] });
  const ready = await new Promise<boolean>((resolve) => {
    let out = "";
    cp.stdout.on("data", (d) => { out += d.toString(); if (out.includes("TEAMS_HOST_READY")) resolve(true); if (out.includes("TEAMS_HOST_ERROR")) resolve(false); });
    cp.on("error", () => resolve(false));
    setTimeout(() => resolve(false), 60_000).unref();
  });
  if (!ready) { log("teams-host failed"); codex.stop(); cp.kill(); process.exit(1); }
  teams = new PlaywrightTeamsAdapter({ url: "", profile: "teams" });
  await teams.connectCDP("http://127.0.0.1:" + PORT);
  log("attached over CDP: " + teams.chatId());

  // Replay any unsent outbox from before the restart.
  for (const row of recovery.pendingOutbox) {
    try { await teams.sendMessage(row.body); store.setOutboxStatus(row.id, "sent", now()); } catch { /* keep pending */ }
  }

  const baseline = new Set((await teams.readMessages()).map((m) => m.messageId));
  const seen = new Set(baseline);
  log(`RESIDENT (integrated). Send: !tb <task> | !tb status | !tb approve <code> | !tb unlock <min> | !tb kill`);

  const finishTurn = async () => {
    const result = reduceTurn(turnId || activeJobId, turnEvents);
    if (!store.resultAlreadySent(turnId || activeJobId)) {
      store.markResultSent(turnId || activeJobId, teams!.chatId(), now());
      await teams!.sendMessage(`[TB ${activeJobId}] ` + redactString(formatResult(result)));
    }
    log("result sent for " + activeJobId);
    activeJobId = ""; turnId = ""; turnSettled = false; turnEvents = []; status = new TurnStatus(15_000);
  };

  for (;;) {
    let msgs;
    try { msgs = await teams.readMessages(); } catch (e) { log("read error: " + (e as Error).message); break; }
    for (const m of msgs) {
      if (seen.has(m.messageId)) continue;
      seen.add(m.messageId);
      if (m.text.includes(REPORT_PREFIX)) continue;
      const norm = m.text.replace(/！/g, "!").replace(/＠/g, "@").replace(/　/g, " ");
      const mt = norm.toLowerCase().match(/[!@]tb/);
      if (!mt || mt.index === undefined) continue;
      const cmdText = norm.slice(mt.index);
      log("msg: " + JSON.stringify(cmdText.slice(0, 100)));

      // `!tb status` (with or without id) -> pull snapshot.
      if (/^[!@]tb\s+status\b/i.test(cmdText)) {
        const s = status.snapshot(now());
        await teams.sendMessage(`[TB ${activeJobId || "-"}] 狀態:${activeJobId ? "執行中" : "閒置"} · 步驟 ${s.step || "-"} · tokens ${s.tokens} · 閒置 ${Math.round(s.idleMs / 1000)}s`);
        continue;
      }

      const parsed = parseWithImplicitRun(cmdText, DEFAULT_PROJECT_ID);
      if (!parsed.ok) continue;
      const c = parsed.command;

      if (c.kind === "kill") {
        policy.kill(); codex.stop();
        await teams.sendMessage(`[TB] 已停止(kill)。`);
        await teams.close().catch(() => undefined); cp.kill(); process.exit(0);
      } else if (c.kind === "lock") {
        policy.lock(); await teams.sendMessage(`[TB] 已鎖回 read-only。`);
      } else if (c.kind === "unlock") {
        policy.unlock(c.minutes * 60_000, now());
        await teams.sendMessage(`[TB] 已解鎖 workspace-write ${c.minutes} 分鐘(限 AgentHub、拒網路)。`);
      } else if (c.kind === "run") {
        if (policy.isKilled()) continue;
        if (activeJobId) { await teams.sendMessage(`[TB ${activeJobId}] 忙碌中,請稍後。`); continue; }
        activeJobId = "T" + String(Date.now()).slice(-4);
        turnSettled = false; turnEvents = []; status = new TurnStatus(15_000); status.setStep("啟動", now());
        const mode = policy.effectiveSandbox(now());
        await teams.sendMessage(`[TB ${activeJobId}] 收到(AgentHub · ${mode}):${c.request}`);
        await codex.startTurn({ threadId, input: [{ type: "text", text: c.request, text_elements: [] }], sandboxPolicy: sandboxPolicyFor() });
        log(`turn (${mode}): ${c.request}`);
      } else if (c.kind === "approve" || c.kind === "deny") {
        const res = registry.resolveApproval(c.code, c.kind === "approve", now());
        if (res.ok) {
          const decision = res.accept ? "accept" : "decline";
          codex.respond(res.requestId, { decision });
          await teams.sendMessage(`[TB ${activeJobId}] ${c.code} 已${res.accept ? "批准" : "拒絕"}。`);
        } else {
          await teams.sendMessage(`[TB ${activeJobId}] ${c.code} 無法處理:${res.reason}。`);
        }
      } else if (c.kind === "answer") {
        const res = registry.answerInput(c.questionId, c.text, now());
        if (res.ok) { codex.respond(res.requestId, { text: c.text }); await teams.sendMessage(`[TB ${activeJobId}] ${c.questionId} 已回答。`); }
        else await teams.sendMessage(`[TB ${activeJobId}] ${c.questionId} 無法處理:${res.reason}。`);
      }
    }

    // Coalesced status card while a turn runs.
    if (activeJobId && status.shouldFlush(now())) {
      const s = status.snapshot(now());
      status.markFlushed(now());
      await teams.sendMessage(`[TB ${activeJobId}] ⏳ ${s.step || "執行中"}${s.tokens ? " · tokens " + s.tokens : ""}${s.outputTail.length ? "\n" + s.outputTail.join("\n") : ""}`);
    }
    // Auto-decline expired approvals (never auto-approve).
    for (const ex of registry.sweepExpired(now())) {
      codex.respond(ex.requestId, { decision: "decline" });
      await teams.sendMessage(`[TB ${activeJobId}] ${ex.code} 逾時,已自動拒絕。`);
    }
    if (turnSettled && activeJobId) await finishTurn();
    await sleep(2500);
  }

  codex.stop(); await teams.close().catch(() => undefined); cp.kill(); process.exit(0);
}

main().catch((e) => { console.error("[E2E] fatal", e); process.exit(1); });
