// TeamBot v4 runtime: Electron-owned Teams surface -> scoped chat transports ->
// project-first Coordinator -> Codex app-server. This runner deliberately polls
// only the configured chats so a self-chat and selected groups share one local
// supervisor without attaching to the user's regular browser.
//
// Start intentionally from a disposable pairing:
//   $env:TEAMBOT_SELF_SENDER_ID = "<stable Teams sender id>"
//   $env:TEAMBOT_PROJECTS_JSON = '[{"projectId":"TeamBot","cwd":"D:\\\\workspace\\\\GitBank\\\\GitRin\\\\TeamBot","aliases":["tb"]}]'
//   node --experimental-strip-types --experimental-sqlite scripts/e2e-v4-run.ts
//
// Optional: TEAMBOT_GROUP_CHAT_IDS, TEAMBOT_ALLOWED_SENDERS,
// TEAMBOT_MAX_CONCURRENT, TEAMBOT_DB,
// TEAMBOT_TEAMS_URL, TEAMBOT_TEAMS_PORT, TEAMBOT_SELF_CHAT_ID (required with groups).
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";
import { ScopedTeamsTransport } from "../src/transports/teams/transport.ts";
import { CodexAdapter } from "../src/codex/adapter.ts";
import { Store, type Pairing } from "../src/storage/store.ts";
import { Coordinator } from "../src/app/coordinator.ts";
import { ProjectRegistry, type ProjectDef } from "../src/app/projects.ts";
import { bootRecovery, saveResidentThread } from "../src/supervisor/session.ts";
import { reconcileOutbox } from "../src/supervisor/recovery.ts";
import { createBaseline } from "../src/app/desktop-logic.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const hostCjs = join(here, "..", "launcher", "electron", "teams-host.cjs");
const electronPath = require("electron") as string;

const arg = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const log = (message: string): void => console.log(`[TeamBot v4] ${message}`);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function envList(name: string): string[] {
  return (process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function parseProjects(): ProjectDef[] {
  const raw = process.env.TEAMBOT_PROJECTS_JSON;
  if (!raw) throw new Error("TEAMBOT_PROJECTS_JSON is required; phone messages may never submit a cwd");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("TEAMBOT_PROJECTS_JSON must be a non-empty array");
  return parsed.map((value) => {
    if (value == null || typeof value !== "object") throw new Error("invalid project profile");
    const project = value as ProjectDef;
    if (!project.projectId || !project.cwd || !isAbsolute(project.cwd)) throw new Error(`project ${project.projectId ?? "?"} needs an absolute cwd`);
    return { ...project, cwd: normalize(project.cwd) };
  });
}

function rolesFor(groupId: string): Record<string, "owner" | "operator" | "viewer"> {
  const raw = process.env.TEAMBOT_GROUP_ROLES_JSON;
  if (!raw) return {};
  const all = JSON.parse(raw) as Record<string, Record<string, "owner" | "operator" | "viewer">>;
  return all[groupId] ?? {};
}

async function waitForHost(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", (data) => {
      output += data.toString();
      if (output.includes("TEAMS_HOST_READY")) resolve();
      if (output.includes("TEAMS_HOST_ERROR")) reject(new Error(output.trim()));
    });
    child.once("error", reject);
    setTimeout(() => reject(new Error("timed out waiting for Teams host")), 60_000).unref();
  });
}

async function main(): Promise<void> {
  const port = arg("--port", process.env.TEAMBOT_TEAMS_PORT ?? "9360");
  const teamsUrl = process.env.TEAMBOT_TEAMS_URL ?? "https://teams.microsoft.com/";
  const dbPath = process.env.TEAMBOT_DB ?? join(process.env.LOCALAPPDATA ?? process.cwd(), "TeamBot", "state.sqlite");
  const selfSender = process.env.TEAMBOT_SELF_SENDER_ID?.trim();
  if (!selfSender) throw new Error("TEAMBOT_SELF_SENDER_ID is required for allowlisted self-chat control");
  const allowedSenders = [...new Set([selfSender, ...envList("TEAMBOT_ALLOWED_SENDERS")])];
  const groupIds = envList("TEAMBOT_GROUP_CHAT_IDS");
  const configuredSelfChatId = process.env.TEAMBOT_SELF_CHAT_ID?.trim();
  if (groupIds.length > 0 && !configuredSelfChatId) {
    throw new Error("TEAMBOT_SELF_CHAT_ID is required when group chats are configured; never infer the private approval chat");
  }
  const maxConcurrent = Math.max(1, Number(process.env.TEAMBOT_MAX_CONCURRENT ?? "1"));

  const projects = new ProjectRegistry();
  for (const project of parseProjects()) projects.register(project);
  const stateDir = dirname(dbPath);
  mkdirSync(stateDir, { recursive: true });
  const store = new Store(dbPath);
  const recovery = bootRecovery(store);
  if (recovery.interruptedJobs.length) log(`marked interrupted jobs: ${recovery.interruptedJobs.join(", ")}`);

  const codex = new CodexAdapter();
  await codex.start();
  if (recovery.resume.mode === "resume" && recovery.resume.threadId) {
    try {
      const resumed = await codex.resumeThread({ threadId: recovery.resume.threadId }) as { thread?: { id?: string }; threadId?: string };
      const resumedId = resumed.thread?.id ?? resumed.threadId ?? recovery.resume.threadId;
      saveResidentThread(store, resumedId, Date.now());
      log(`resumed Codex thread ${resumedId}`);
    } catch (error) {
      log(`resident thread resume unavailable; no automatic rerun: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const host = spawn(electronPath, [hostCjs, "--show", "--port", port, "--url", teamsUrl], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForHost(host);
  const adapter = new PlaywrightTeamsAdapter({ url: "", profile: "teams", headless: false });
  await adapter.connectCDP(`http://127.0.0.1:${port}`);
  if (configuredSelfChatId) await adapter.selectChat(configuredSelfChatId);
  const selfChatId = configuredSelfChatId ?? adapter.chatId();
  if (!selfChatId) throw new Error("Teams surface did not expose a stable self-chat id");
  const configuredChatIds = [selfChatId, ...groupIds.filter((id) => id !== selfChatId)];
  const transports = new Map(configuredChatIds.map((chatId) => [chatId, new ScopedTeamsTransport(adapter, chatId)]));
  const pairings = new Map<string, Pairing>();
  const projectIds = projects.all().map((project) => project.projectId);
  const now = Date.now();
  for (const chatId of configuredChatIds) {
    const isSelf = chatId === selfChatId;
    const visible = await transports.get(chatId)!.readMessages();
    const baseline = createBaseline(visible, now);
    const pairing: Pairing = {
      id: `runtime-${chatId}`,
      tenant: process.env.TEAMBOT_TENANT ?? "teams",
      account: process.env.TEAMBOT_ACCOUNT ?? selfSender,
      chatId,
      kind: isSelf ? "self" : "group",
      allowlist: allowedSenders,
      roles: isSelf ? { [selfSender]: "owner" } : rolesFor(chatId),
      projects: projectIds,
      baselineMessageId: baseline.baselineMessageId,
      baselineAt: baseline.baselineAt,
      createdAt: now,
    };
    pairings.set(chatId, pairing);
    store.upsertPairing(pairing);
  }
  for (const [chatId, transport] of transports) {
    const reconciled = await reconcileOutbox(store, transport, () => Date.now());
    if (reconciled.sent || reconciled.uncertain) {
      log(`outbox ${chatId}: sent ${reconciled.sent}, uncertain ${reconciled.uncertain}`);
    }
  }
  for (const jobId of recovery.interruptedJobs) {
    const job = store.getJob(jobId);
    const transport = job ? transports.get(job.chatId) : undefined;
    if (!job || !transport) continue;
    await transport.sendMessage(`[TB ${job.jobId}] 工作在 runtime 重啟後中斷；狀態需要重新核對，不會自動重跑。`)
      .catch(() => undefined);
  }
  for (const approval of recovery.pendingApprovals) {
    const job = store.getJob(approval.jobId);
    const transport = transports.get(approval.chatId);
    if (!job || !transport || approval.expiresAt <= Date.now()) continue;
    await transport.sendMessage([
      `[TB ${job.jobId}] 尚有待處理批准 ${approval.code}`,
      `Project：${job.projectId} · Turn：${approval.turnId ?? "尚未建立"}`,
      `範圍：${approval.scope ?? "(未提供)"}`,
      `失效時間：${new Date(approval.expiresAt).toISOString()}`,
      `回覆：ok ${approval.code} 或 no ${approval.code}`,
    ].join("\n")).catch(() => undefined);
  }
  const coordinators = new Map<string, Coordinator>();
  for (const [chatId, pairing] of pairings) {
    coordinators.set(chatId, new Coordinator({
      store,
      transport: transports.get(chatId)!,
      adapter,
      projects,
      pairing,
      maxConcurrent,
      privateApprovalChatId: selfChatId,
      now: () => Date.now(),
      listenServerRequests: false,
    }));
  }

  // A shared Codex process emits one server-request stream. Route each request
  // to the coordinator owning the task's source chat; installing one listener
  // per coordinator would duplicate approval/input records.
  codex.on("serverRequest", (payload: unknown) => {
    const request = payload as { params?: { threadId?: string } };
    const threadId = request.params?.threadId;
    const job = store.listJobs().find((candidate) => candidate.threadId === threadId);
    const coordinator = job ? coordinators.get(job.chatId) : undefined;
    if (coordinator) void coordinator.handleServerRequest(payload);
  });

  const seen = new Map<string, Set<string>>();
  for (const [chatId, transport] of transports) seen.set(chatId, new Set((await transport.readMessages()).map((message) => message.messageId)));
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    codex.stop();
    await adapter.close().catch(() => undefined);
    host.kill();
    store.close();
  };
  process.once("SIGINT", () => { void stop().finally(() => process.exit(0)); });
  process.once("SIGTERM", () => { void stop().finally(() => process.exit(0)); });

  log(`ready; self chat ${selfChatId}; projects ${projectIds.join(", ")}; maxConcurrent ${maxConcurrent}`);
  while (!stopping) {
    for (const [chatId, transport] of transports) {
      let messages;
      try { messages = await transport.readMessages(); } catch (error) { log(`read ${chatId} failed: ${error instanceof Error ? error.message : String(error)}`); continue; }
      const chatSeen = seen.get(chatId)!;
      const coordinator = coordinators.get(chatId)!;
      for (const message of messages) {
        if (chatSeen.has(message.messageId)) continue;
        chatSeen.add(message.messageId);
        void coordinator.handle({ ...message, tenant: process.env.TEAMBOT_TENANT ?? "teams", receivedAt: Date.now() }).catch((error: unknown) => log(`dispatch failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
    await sleep(1500);
  }
}

main().catch((error: unknown) => {
  console.error(`[TeamBot v4] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
