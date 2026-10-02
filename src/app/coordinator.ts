// Project-first coordinator: wires inbox -> router -> supervisor -> codex -> outbox
// -> Teams transport for self-chat and selected group conversations. The queue
// preserves a single main lane per project while allowing configured cross-project
// concurrency and explicit worktree forks.
import type { Store, InboxMessage } from "../storage/store.ts";
import type { TeamsTransport } from "../transports/teams/transport.ts";
import type { CodexAdapter } from "../codex/adapter.ts";
import type { ProjectRegistry } from "./projects.ts";
import type { Pairing } from "../storage/store.ts";
import { Inbox } from "../router/inbox.ts";
import { Outbox } from "../progress/outbox.ts";
import { authorize } from "../router/router.ts";
import { parseCommand } from "../router/parser.ts";
import { parseV4Command } from "../router/v4-parser.ts";
import { JobIdGenerator } from "./ids.ts";
import { ConversationContextStore, resolveProject } from "./context.ts";
import { formatOverview, formatProjects, formatTask, formatTaskDetails } from "./overview.ts";
import { GitWorktreeRuntime, type WorktreeRuntime } from "../supervisor/worktree-runtime.ts";
import { MultiTaskScheduler } from "../supervisor/worktrees.ts";
import { ApprovalManager } from "../router/approvals.ts";
import { isDangerousScope, approvalTarget } from "../router/approval-routing.ts";
import { redactString } from "../util/redact.ts";
import { reduceTurn, formatResult, type TurnEvent, type FileChange } from "../progress/result-reducer.ts";

function recordOf(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringField(value: unknown, ...keys: string[]): string | undefined {
  const rec = recordOf(value);
  for (const key of keys) if (typeof rec[key] === "string" && rec[key].trim()) return rec[key] as string;
  return undefined;
}

function pathTail(value: string): string {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || value;
}

function nestedItem(payload: unknown): Record<string, unknown> {
  const rec = recordOf(payload);
  return recordOf(rec.item ?? payload);
}

function eventBelongs(payload: unknown, threadId: string, turnId: string): boolean {
  const rec = recordOf(payload);
  const eventThread = stringField(rec, "threadId") ?? stringField(rec.thread, "id");
  const eventTurn = stringField(rec, "turnId") ?? stringField(rec.turn, "id");
  if (eventThread && eventThread !== threadId) return false;
  if (eventTurn && turnId && eventTurn !== turnId) return false;
  return true;
}

function changeFiles(item: Record<string, unknown>): FileChange[] {
  const paths: FileChange[] = [];
  const add = (value: unknown): void => {
    const rec = recordOf(value);
    const path = stringField(rec, "path", "filePath", "relativePath");
    if (!path) return;
    paths.push({
      path,
      added: typeof rec.added === "number" ? rec.added : typeof rec.addedLines === "number" ? rec.addedLines : 0,
      removed: typeof rec.removed === "number" ? rec.removed : typeof rec.removedLines === "number" ? rec.removedLines : 0,
    });
  };
  add(item);
  const changes = item.changes;
  if (Array.isArray(changes)) for (const change of changes) add(change);
  return paths;
}

function artifactRecords(value: Record<string, unknown>): Array<{ path: string; kind: string; hash: string | null }> {
  const records: Array<{ path: string; kind: string; hash: string | null }> = [];
  const add = (candidate: unknown): void => {
    const rec = recordOf(candidate);
    // Keep artifact references local and display-safe; never persist a remote URI
    // that could contain a signed URL or other credential-bearing query string.
    const path = stringField(rec, "path", "filePath", "relativePath", "name");
    if (!path) return;
    const kind = stringField(rec, "kind", "type") ?? "file";
    const hash = stringField(rec, "hash", "sha256", "checksum") ?? null;
    records.push({ path, kind, hash });
  };
  add(value.artifact);
  add(value.attachment);
  const artifacts = value.artifacts;
  if (Array.isArray(artifacts)) for (const artifact of artifacts) add(artifact);
  return records;
}

export interface CoordinatorOptions {
  store: Store;
  transport: TeamsTransport;
  adapter: CodexAdapter;
  projects: ProjectRegistry;
  pairing: Pairing;
  admins?: string[];
  now?: () => number;
  ids?: JobIdGenerator;
  worktrees?: WorktreeRuntime;
  maxConcurrent?: number;
  worktreeRoot?: string;
  privateApprovalChatId?: string;
  /** Self-chat may accept a plain natural-language request when its project context is unique. */
  acceptNaturalLanguage?: boolean;
  /** A shared adapter may install one central server-request router instead. */
  listenServerRequests?: boolean;
}

export interface HandleResult {
  action: string;
  jobId?: string;
}

interface RunOptions {
  jobId?: string;
  cwd?: string;
  executionMode?: "main" | "worktree";
  worktreePath?: string;
  branchName?: string;
}

export class Coordinator {
  private store: Store;
  private transport: TeamsTransport;
  private adapter: CodexAdapter;
  private projects: ProjectRegistry;
  private inbox: Inbox;
  private outbox: Outbox;
  private pairing: Pairing;
  private admins: string[];
  private now: () => number;
  private ids: JobIdGenerator;
  private worktrees: WorktreeRuntime;
  private scheduler: MultiTaskScheduler;
  private approvals: ApprovalManager;
  private privateApprovalChatId?: string;
  private acceptNaturalLanguage: boolean;
  private contexts = new ConversationContextStore();
  private seq = 0;
  private cancelled = new Set<string>();
  private pendingForks = new Map<string, { chatId: string; senderId: string; request: string }>();
  private pendingProjectChoices = new Map<string, { senderId: string; request: string; projectIds: string[]; expiresAt: number }>();
  private pendingInputs = new Map<string, { requestId: number; jobId: string; chatId: string; expiresAt: number }>();
  private inputSeq = 0;
  private runRequests = new Map<string, { projectId: string; request: string; msg: InboxMessage; options: RunOptions; resolve: (r: HandleResult) => void; reject: (e: unknown) => void }>();

  constructor(opts: CoordinatorOptions) {
    this.store = opts.store;
    this.transport = opts.transport;
    this.adapter = opts.adapter;
    this.projects = opts.projects;
    this.pairing = opts.pairing;
    this.admins = opts.admins ?? [];
    this.now = opts.now ?? (() => 0);
    this.ids = opts.ids ?? new JobIdGenerator();
    this.worktrees = opts.worktrees ?? new GitWorktreeRuntime();
    this.scheduler = new MultiTaskScheduler(opts.worktreeRoot ?? "D:\\TeamBot\\.worktrees", opts.maxConcurrent ?? 1);
    this.approvals = new ApprovalManager(this.store);
    this.privateApprovalChatId = opts.privateApprovalChatId;
    this.acceptNaturalLanguage = opts.acceptNaturalLanguage ?? true;
    const eventSource = this.adapter as unknown as { on?: (event: string, listener: (payload: unknown) => void) => void };
    if (opts.listenServerRequests !== false) eventSource.on?.("serverRequest", (payload) => { void this.handleServerRequest(payload); });
    this.inbox = new Inbox(this.store);
    this.outbox = new Outbox(this.store);
  }

  async handle(msg: InboxMessage): Promise<HandleResult> {
    const decision = this.inbox.intake(msg, this.pairing);
    if (!decision.accepted) return { action: `ignored:${decision.reason}` };

    // Restore focus from disk after an Electron restart. Context is still
    // conversation scoped; no cwd or hidden project is accepted from Teams.
    const persistedContext = this.store.getConversationContext(msg.chatId);
    if (persistedContext.activeProjectId && (persistedContext.expiresAt === 0 || this.now() <= persistedContext.expiresAt) && !this.contexts.get(msg.chatId, this.now()).activeProjectId) {
      this.contexts.focus(msg.chatId, persistedContext.activeProjectId, persistedContext.updatedAt);
    }

    const selectedProject = await this.tryResolveProjectChoice(msg);
    if (selectedProject) return selectedProject;

    const v4 = parseV4Command(msg.text, this.projects.list());
    if (v4.ok) {
      this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
      return this.handleV4(v4.command, msg);
    }

    const parsed = parseCommand(msg.text);
    if (!parsed.ok) {
      if (this.acceptNaturalLanguage && this.pairing.kind === "self" && !msg.text.trimStart().startsWith("[TB")) {
        const resolution = resolveProject(this.projects, this.contexts, msg.chatId, undefined, this.availableProjectIds(msg.chatId));
        if (resolution.kind === "resolved") {
          this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
          return this.run(resolution.project.projectId, msg.text.trim(), msg);
        }
        if (resolution.kind === "ambiguous") {
          await this.askProjectChoice(msg, msg.text.trim(), resolution.candidates);
          this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
          return { action: "project:clarification-required" };
        }
      }
      // Recorded but not a command (e.g. ordinary chat, or a [TB] report line).
      return { action: `not-command:${parsed.reason}` };
    }

    const auth = authorize(parsed.command, {
      pairing: this.pairing,
      senderId: msg.senderId,
      admins: this.admins,
      getJob: (id) => this.store.getJob(id),
    });
    if (!auth.allow) {
      await this.reply("sys", `拒絕：${auth.reason}`);
      return { action: `denied:${auth.reason}` };
    }

    this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
    const cmd = parsed.command;

    switch (cmd.kind) {
      case "help":
        await this.reply("sys", "指令：overview/projects/focus/run/task/details/rename/diff/files/artifact/add/steer/fork/watch/mute/stop/kill/cancel/approve/deny/handoff/help", msg.chatId);
        return { action: "help" };
      case "projects":
        await this.reply("sys", formatProjects(this.projects, this.availableProjectIds(msg.chatId)), msg.chatId);
        return { action: "projects" };
      case "run":
        return this.run(cmd.projectId, cmd.request, msg);
      case "status": {
        const job = this.store.getJob(cmd.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${cmd.jobId}`, msg.chatId);
          return { action: "status:unknown" };
        }
        await this.reply(
          job.jobId,
          `狀態：${job.status}；最近事件時間：${job.lastEventAt ?? "-"}`,
          msg.chatId,
        );
        return { action: "status", jobId: job.jobId };
      }
      case "result": {
        const job = this.store.getJob(cmd.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${cmd.jobId}`, msg.chatId);
          return { action: "result:unknown" };
        }
        await this.reply(job.jobId, `結果：${job.lastResult ?? "(尚無)"}`, msg.chatId);
        return { action: "result", jobId: job.jobId };
      }
      case "approve":
      case "deny": {
        const resolved = this.approvals.resolve(cmd.code, cmd.kind, {
          senderId: msg.senderId,
          chatId: msg.chatId,
          now: this.now(),
          admins: this.admins,
          getJob: (id) => this.store.getJob(id),
        });
        if (!resolved.ok) {
          await this.reply("sys", `無法${cmd.kind === "approve" ? "批准" : "拒絕"} ${cmd.code}：${resolved.reason}`, msg.chatId);
          return { action: `${cmd.kind}:denied` };
        }
        const requestId = Number(resolved.approval.requestId);
        if (Number.isFinite(requestId)) this.adapter.respond(requestId, { accept: cmd.kind === "approve" });
        this.store.updateJobStatus(resolved.approval.jobId, cmd.kind === "approve" ? "running" : "waiting_approval");
        this.store.updateJobMetadata(resolved.approval.jobId, { pendingDecision: null });
        await this.reply(resolved.approval.jobId, `${cmd.kind === "approve" ? "已批准" : "已拒絕"} ${cmd.code}。`, msg.chatId);
        return { action: cmd.kind, jobId: resolved.approval.jobId };
      }
      case "answer": {
        const input = this.pendingInputs.get(cmd.questionId);
        if (!input || input.chatId !== msg.chatId || this.now() > input.expiresAt) {
          if (input && this.now() > input.expiresAt) this.pendingInputs.delete(cmd.questionId);
          await this.reply("sys", `找不到或已逾時的問題 ${cmd.questionId}`, msg.chatId);
          return { action: "answer:denied" };
        }
        const job = this.store.getJob(input.jobId);
        const role = this.pairing.roles?.[msg.senderId] ?? "viewer";
        const canAnswer = !!job && (this.admins.includes(msg.senderId) || job.senderId === msg.senderId || (this.pairing.kind === "group" && (role === "owner" || role === "operator")));
        if (!job || !canAnswer) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以回答這個問題。", msg.chatId);
          return { action: "answer:denied" };
        }
        this.adapter.respond(input.requestId, { text: cmd.text });
        this.pendingInputs.delete(cmd.questionId);
        this.store.updateJobStatus(input.jobId, "running");
        this.store.updateJobMetadata(input.jobId, { pendingDecision: null });
        await this.reply(input.jobId, `已回答 ${cmd.questionId}，繼續執行。`, msg.chatId);
        return { action: "answered", jobId: input.jobId };
      }
      case "kill": {
        if (cmd.jobId) {
          const target = this.store.getJob(cmd.jobId);
          if (!target) {
            await this.reply("sys", `找不到工作 ${cmd.jobId}`, msg.chatId);
            return { action: "kill:unknown" };
          }
          if (!this.canControlJob(target, msg)) {
            await this.reply("sys", "只有工作發起人或群組 operator 可以硬停止這個工作。", msg.chatId);
            return { action: "kill:denied", jobId: cmd.jobId };
          }
        }
        this.adapter.stop();
        const affected = this.store.listJobs().filter((job) => ["starting", "running", "waiting_input", "waiting_approval", "stopping"].includes(job.status) && (!cmd.jobId || job.jobId === cmd.jobId));
        for (const job of affected) {
          this.store.updateJobMetadata(job.jobId, { executionStatus: "execution_unknown" });
          this.store.updateJobStatus(job.jobId, "needs_reconciliation", "Codex process was killed; reconciliation required");
        }
        await this.reply("sys", affected.length ? `已硬停止 Codex；${affected.map((job) => job.jobId).join(", ")} 需要重新核對。` : "目前沒有執行中的 Codex 工作。", msg.chatId);
        return { action: "killed" };
      }
      default:
        // continue/answer remain wired through their dedicated registries.
        await this.reply("sys", `尚未支援：${cmd.kind}`, msg.chatId);
        return { action: `unsupported:${cmd.kind}` };
    }
  }

  private async handleV4(
    command: import("../router/v4-parser.ts").V4Command,
    msg: InboxMessage,
  ): Promise<HandleResult> {
    const role = this.pairing.kind === "self"
      ? "owner"
      : (this.pairing.roles?.[msg.senderId] ?? "viewer");
    const mutating = ["run", "add", "fork", "cancel", "stop", "steer", "handoff", "rename"].includes(command.kind);
    if (mutating && role === "viewer") {
      await this.reply("sys", "群組檢視者只能查看摘要；請由 operator/owner 執行此操作。", msg.chatId);
      return { action: "denied:group-role" };
    }

    switch (command.kind) {
      case "overview":
        await this.reply("sys", formatOverview(
          this.store.listJobs(this.pairing.kind === "group" ? msg.chatId : undefined),
          this.projects,
          8,
          this.availableProjectIds(msg.chatId),
          { summaryOnly: this.pairing.kind === "group" },
        ), msg.chatId);
        return { action: "overview" };
      case "status": {
        const job = this.store.getJob(command.jobId);
        if (!job || (job.chatId !== msg.chatId && !this.admins.includes(msg.senderId))) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "status:unknown" };
        }
        await this.reply(job.jobId, `狀態：${job.status}；專案：${this.projects.get(job.projectId)?.name ?? job.projectId}；最近事件時間：${job.lastEventAt ?? "-"}`, msg.chatId);
        return { action: "status", jobId: job.jobId };
      }
      case "focus": {
        const project = this.projects.resolve(command.projectId);
        if (!project || !this.projectAllowed(project.projectId, msg.chatId)) {
          await this.reply("sys", `找不到或未授權專案：${command.projectId}`, msg.chatId);
          return { action: "focus:denied" };
        }
        const focused = this.contexts.focus(msg.chatId, project.projectId, this.now());
        this.projects.markUsed(project.projectId, focused.updatedAt);
        this.store.setConversationContext(msg.chatId, project.projectId, focused.updatedAt, focused.expiresAt);
        await this.reply("sys", `目前專案：${project.name} (${project.projectId})；只對此聊天有效，至 ${new Date(focused.expiresAt).toISOString()} 前有效。`, msg.chatId);
        return { action: "focus", jobId: undefined };
      }
      case "run": {
        const resolution = resolveProject(this.projects, this.contexts, msg.chatId, command.projectId, this.availableProjectIds(msg.chatId));
        if (resolution.kind === "unknown") {
          await this.reply("sys", `拒絕：專案未登記或未授權：${resolution.projectId}`, msg.chatId);
          return { action: command.projectId ? "denied:project-not-authorized" : "run:no-project" };
        }
        if (resolution.kind === "ambiguous") {
          await this.askProjectChoice(msg, command.request, resolution.candidates);
          return { action: "run:ambiguous" };
        }
        if (!this.projectAllowed(resolution.project.projectId, msg.chatId)) {
          await this.reply("sys", `未授權專案：${resolution.project.projectId}`, msg.chatId);
          return { action: "run:denied" };
        }
        const focused = this.contexts.focus(msg.chatId, resolution.project.projectId, this.now());
        this.projects.markUsed(resolution.project.projectId, focused.updatedAt);
        this.store.setConversationContext(msg.chatId, resolution.project.projectId, focused.updatedAt, focused.expiresAt);
        return this.run(resolution.project.projectId, command.request, msg);
      }
      case "task": {
        const job = this.store.getJob(command.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "task:unknown" };
        }
        if (job.chatId !== msg.chatId && !this.admins.includes(msg.senderId)) {
          await this.reply("sys", "這個工作屬於另一個聊天，無法查看。", msg.chatId);
          return { action: "task:denied" };
        }
        const groupSummary = this.pairing.kind === "group";
        const details = command.details && !groupSummary ? formatTaskDetails(this.store.listEvents(job.jobId)) : "";
        const artifacts = groupSummary ? [] : this.store.listArtifacts(job.jobId).map((artifact) => ({ path: artifact.path, kind: artifact.kind }));
        await this.reply(job.jobId, formatTask(job, this.projects.get(job.projectId)?.name, { summaryOnly: groupSummary, artifacts }) + details, msg.chatId);
        return { action: "task", jobId: job.jobId };
      }
      case "rename": {
        const job = this.store.getJob(command.jobId);
        if (!job || !this.canControlJob(job, msg)) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以重新命名這個工作。", msg.chatId);
          return { action: "rename:denied" };
        }
        this.store.updateJobMetadata(job.jobId, { title: command.title });
        await this.reply(job.jobId, `已重新命名：${command.title}`, msg.chatId);
        return { action: "renamed", jobId: job.jobId };
      }
      case "diff":
      case "files":
      case "artifact": {
        const job = this.store.getJob(command.jobId);
        if (!job || (job.chatId !== msg.chatId && !this.admins.includes(msg.senderId))) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: `${command.kind}:unknown` };
        }
        const artifacts = command.kind === "artifact" ? this.store.listArtifacts(job.jobId) : [];
        const body = command.kind === "files"
          ? `檔案（${job.changedFiles?.length ?? 0}）：${job.changedFiles?.join(", ") || "(尚無)"}`
          : command.kind === "artifact"
            ? `產物（${artifacts.length}）：${artifacts.map((artifact) => `${artifact.path} · ${artifact.kind}`).join(", ") || (job.resultSummary ?? job.lastResult ?? "(尚無)")}`
            : this.pairing.kind === "group"
              ? `Diff 摘要：${job.changedFiles?.length ?? 0} 檔變更；完整內容請由發起人在自己聊天查看。`
              : `Diff 摘要：${job.resultSummary ?? job.lastResult ?? "(尚無)"}`;
        await this.reply(job.jobId, body, msg.chatId);
        return { action: command.kind, jobId: job.jobId };
      }
      case "add": {
        if (command.jobId) {
          const base = this.store.getJob(command.jobId);
          if (!base) {
            await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
            return { action: "add:unknown" };
          }
          if (!this.canControlJob(base, msg)) {
            await this.reply("sys", "這個工作屬於另一個聊天，無法追加。", msg.chatId);
            return { action: "add:denied" };
          }
          if (!base.threadId) {
            await this.reply(base.jobId, "這個工作尚未建立 Codex thread，請稍後再追加。", msg.chatId);
            return { action: "add:not-ready", jobId: base.jobId };
          }
          let addedResult = "";
          let expectedTurnId = "";
          let onItem = (_p: unknown): void => undefined;
          let onTurn = (_p: unknown): void => undefined;
          const cleanup = (): void => {
            this.adapter.off("item/completed", onItem);
            this.adapter.off("turn/completed", onTurn);
          };
          const completed = new Promise<void>((resolve) => {
            onItem = (p: unknown): void => {
              if (!eventBelongs(p, base.threadId!, expectedTurnId)) return;
              const item = nestedItem(p);
              const text = stringField(item, "text") ?? stringField(p, "text");
              if (text) addedResult = text;
            };
            onTurn = (p: unknown): void => {
              if (!eventBelongs(p, base.threadId!, expectedTurnId)) return;
              cleanup();
              resolve();
            };
            this.adapter.on("item/completed", onItem);
            this.adapter.on("turn/completed", onTurn);
          });
          this.store.updateJobStatus(base.jobId, "running");
          try {
            const turn = (await this.adapter.startTurn({ threadId: base.threadId, input: command.request })) as { turnId?: string };
            expectedTurnId = turn.turnId ?? "";
            this.store.setJobThread(base.jobId, base.threadId, turn.turnId);
            await completed;
          } catch (error) {
            cleanup();
            const detail = error instanceof Error ? error.message : "追加執行失敗";
            const unknown = /process|exit|disconnect|transport/i.test(detail);
            this.store.updateJobMetadata(base.jobId, { executionStatus: unknown ? "execution_unknown" : "known" });
            this.store.updateJobStatus(base.jobId, unknown ? "needs_reconciliation" : "failed", detail);
            await this.reply(base.jobId, `追加執行失敗：${detail}`, msg.chatId);
            return { action: "add:failed", jobId: base.jobId };
          }
          this.store.updateJobStatus(base.jobId, this.cancelled.has(base.jobId) ? "cancelled" : "completed", addedResult);
          await this.reply(base.jobId, `已追加並完成；結果：${addedResult || "(無輸出)"}`, msg.chatId);
          return { action: "added", jobId: base.jobId };
        }
        const resolution = resolveProject(this.projects, this.contexts, msg.chatId, undefined, this.availableProjectIds(msg.chatId));
        if (resolution.kind !== "resolved") {
          await this.reply("sys", "請先用 !tb focus <project>，再把工作加入該專案。", msg.chatId);
          return { action: "add:ambiguous" };
        }
        return this.run(resolution.project.projectId, command.request, msg);
      }
      case "fork": {
        const base = this.store.getJob(command.jobId);
        if (!base) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "fork:unknown" };
        }
        if (!this.canControlJob(base, msg)) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以 fork 這個工作。", msg.chatId);
          return { action: "fork:denied" };
        }
        if (base.projectId !== this.projects.resolve(base.projectId)?.projectId) {
          await this.reply("sys", "工作所屬專案已不存在。", msg.chatId);
          return { action: "fork:no-project" };
        }
        const forkKey = `${msg.chatId}:${base.jobId}`;
        if (!command.confirmed) {
          this.pendingForks.set(forkKey, { chatId: msg.chatId, senderId: msg.senderId, request: command.request });
          await this.reply("sys", `將從 ${base.projectId} 建立隔離 worktree。這會建立新的 Git worktree 和 task；確認請回：!tb fork ${base.jobId} confirm ${command.request}`, msg.chatId);
          return { action: "fork:confirmation-required", jobId: base.jobId };
        }
        const pendingFork = this.pendingForks.get(forkKey);
        if (!pendingFork || pendingFork.senderId !== msg.senderId || pendingFork.request !== command.request) {
          await this.reply("sys", "找不到相符的 fork 確認要求，請重新送出原始 fork 指令。", msg.chatId);
          return { action: "fork:confirmation-mismatch" };
        }
        this.pendingForks.delete(forkKey);
        const newJobId = this.allocateJobId();
        let worktreePath: string;
        let branchName: string | undefined;
        try {
          const created = await this.worktrees.create(base.cwd, newJobId);
          if (typeof created === "string") worktreePath = created;
          else {
            worktreePath = created.path;
            branchName = created.branchName;
          }
        } catch (err) {
          await this.reply("sys", `建立 worktree 失敗：${err instanceof Error ? err.message : "未知錯誤"}`, msg.chatId);
          return { action: "fork:worktree-failed" };
        }
        await this.reply("sys", `已建立隔離 worktree：${worktreePath}，開始新 task ${newJobId}。`, msg.chatId);
        return this.run(base.projectId, command.request, msg, {
          jobId: newJobId,
          cwd: worktreePath,
          executionMode: "worktree",
          worktreePath,
          branchName,
        });
      }
      case "watch":
        {
          const job = this.store.getJob(command.jobId);
          if (!job || !this.canControlJob(job, msg)) {
            await this.reply("sys", "無法修改這個工作的通知設定。", msg.chatId);
            return { action: "watch:denied" };
          }
          this.store.updateJobMetadata(command.jobId, { notificationPolicy: command.mode === "watch" ? "all-decisions" : "quiet" });
        }
        await this.reply(command.jobId, command.mode === "watch" ? "已開啟此工作的重要進度通知。" : "已靜音此工作的非決策通知。", msg.chatId);
        return { action: command.mode, jobId: command.jobId };
      case "steer": {
        const job = this.store.getJob(command.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "steer:unknown" };
        }
        if (!this.canControlJob(job, msg)) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以 steer 這個工作。", msg.chatId);
          return { action: "steer:denied" };
        }
        if (!job.activeTurnId) {
          await this.reply(job.jobId, "這個工作目前沒有可 steer 的 active turn。", msg.chatId);
          return { action: "steer:not-running", jobId: job.jobId };
        }
        await this.adapter.steer({ turnId: job.activeTurnId, expectedTurnId: job.activeTurnId, input: command.request });
        await this.reply(job.jobId, `已送出 steer：${command.request}`, msg.chatId);
        return { action: "steered", jobId: job.jobId };
      }
      case "stop": {
        const job = this.store.getJob(command.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "stop:unknown" };
        }
        if (!this.canControlJob(job, msg)) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以停止這個工作。", msg.chatId);
          return { action: "stop:denied" };
        }
        if (!job.activeTurnId) {
          this.scheduler.cancelWaiting(job.jobId);
          this.store.updateJobStatus(job.jobId, "cancelled");
          const pending = this.runRequests.get(job.jobId);
          if (pending) {
            this.runRequests.delete(job.jobId);
            pending.resolve({ action: "cancelled", jobId: job.jobId });
          }
          await this.reply(job.jobId, "工作尚未開始，已取消排隊。", msg.chatId);
          this.pumpRuns();
          return { action: "cancelled", jobId: job.jobId };
        }
        this.cancelled.add(job.jobId);
        this.store.updateJobStatus(job.jobId, "stopping");
        await this.adapter.interrupt({ turnId: job.activeTurnId });
        await this.reply(job.jobId, "已要求優雅停止，等待 Codex turn 結束後確認狀態。", msg.chatId);
        return { action: "stopping", jobId: job.jobId };
      }
      case "cancel": {
        const job = this.store.getJob(command.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "cancel:unknown" };
        }
        if (!this.canControlJob(job, msg)) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以取消這個工作。", msg.chatId);
          return { action: "cancel:denied" };
        }
        if (["running", "starting"].includes(job.status) && job.activeTurnId) {
          await this.reply(command.jobId, "這個工作已開始執行，請使用 !tb stop 進行優雅停止。", msg.chatId);
          return { action: "cancel:already-running", jobId: command.jobId };
        }
        this.scheduler.cancelWaiting(command.jobId);
        this.store.updateJobStatus(command.jobId, "cancelled");
        const pending = this.runRequests.get(command.jobId);
        if (pending) {
          this.runRequests.delete(command.jobId);
          pending.resolve({ action: "cancelled", jobId: command.jobId });
        }
        await this.reply(command.jobId, "已取消排隊中的工作。", msg.chatId);
        this.pumpRuns();
        return { action: "cancelled", jobId: command.jobId };
      }
      case "handoff":
        {
          const job = this.store.getJob(command.jobId);
          if (!job) {
            await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
            return { action: "handoff:unknown" };
          }
          if (!this.canControlJob(job, msg)) {
            await this.reply("sys", "只有工作發起人或群組 operator 可以交接這個工作。", msg.chatId);
            return { action: "handoff:denied" };
          }
          await this.reply(command.jobId, [
            `交接：${this.projects.get(job.projectId)?.name ?? job.projectId} / ${job.jobId}`,
            `thread：${job.threadId ?? "尚未建立"}`,
            `turn：${job.activeTurnId ?? "尚未建立"}`,
            `工作區：${job.worktreePath ? pathTail(job.worktreePath) : "主工作區（依 Project 設定）"}`,
            `變更檔案：${job.changedFiles?.join(", ") || "(尚無)"}`,
            `結果摘要：${job.resultSummary ?? job.lastResult ?? "(尚無)"}`,
            `桌面接手：codex resume ${job.threadId ?? "<threadId>"}`,
            `桌面端請接續此 thread；worktree 完成後仍需明確合併。`,
          ].join("\n"), msg.chatId);
          return { action: "handoff", jobId: command.jobId };
        }
    }
  }

  private canControlJob(job: import("../storage/store.ts").Job, msg: InboxMessage): boolean {
    if (job.chatId !== msg.chatId) return false;
    if (this.admins.includes(msg.senderId)) return true;
    if (this.pairing.kind === "self") return job.senderId === msg.senderId;
    // Group members without an explicit role are read-only by default. This
    // must also apply to the legacy command path, not only the v4 parser.
    const role = this.pairing.kind === "group"
      ? (this.pairing.roles?.[msg.senderId] ?? "viewer")
      : "owner";
    return role === "owner" || role === "operator";
  }

  private projectAllowed(projectId: string, chatId: string): boolean {
    if (!this.pairing.projects.includes(projectId)) return false;
    const project = this.projects.get(projectId);
    return !project?.conversationBindings?.length || project.conversationBindings.includes(chatId);
  }

  private async askProjectChoice(
    msg: InboxMessage,
    request: string,
    candidates: readonly import("./projects.ts").ProjectDef[],
  ): Promise<void> {
    const available = candidates.filter((project) => this.projectAllowed(project.projectId, msg.chatId)).slice(0, 3);
    this.pendingProjectChoices.set(msg.chatId, {
      senderId: msg.senderId,
      request,
      projectIds: available.map((project) => project.projectId),
      expiresAt: this.now() + 5 * 60_000,
    });
    const choices = available.map((project, index) => `${index + 1}. ${project.name ?? project.projectId} (${project.projectId})`).join("\n");
    await this.reply("sys", `請先選擇專案（目前要求有多個候選，避免送錯 repo）：\n${choices || "(沒有可用專案)"}\n請回覆 1-${available.length}。`, msg.chatId);
  }

  private async tryResolveProjectChoice(msg: InboxMessage): Promise<HandleResult | undefined> {
    const pending = this.pendingProjectChoices.get(msg.chatId);
    if (!pending) return undefined;
    if (this.now() > pending.expiresAt) {
      this.pendingProjectChoices.delete(msg.chatId);
      return undefined;
    }
    if (pending.senderId !== msg.senderId || !/^\d+$/.test(msg.text.trim())) return undefined;
    this.pendingProjectChoices.delete(msg.chatId);
    this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
    const index = Number(msg.text.trim()) - 1;
    const projectId = pending.projectIds[index];
    if (!projectId) {
      await this.reply("sys", `選項無效，請回覆 1-${pending.projectIds.length}；原要求尚未執行。`, msg.chatId);
      return { action: "project:choice-invalid" };
    }
    return this.run(projectId, pending.request, msg);
  }

  private availableProjectIds(chatId: string): ReadonlySet<string> {
    return new Set(this.pairing.projects.filter((projectId) => this.projectAllowed(projectId, chatId)));
  }

  private allocateJobId(): string {
    let candidate = this.ids.next();
    while (this.store.getJob(candidate)) candidate = this.ids.next();
    return candidate;
  }

  async handleServerRequest(payload: unknown): Promise<void> {
    const request = payload as { id?: number; method?: string; params?: Record<string, unknown> };
    if (typeof request.id !== "number") return;
    const threadId = typeof request.params?.threadId === "string" ? request.params.threadId : undefined;
    // A request without a known thread must be rejected. Falling back to an
    // arbitrary active job would let concurrent projects receive each other's
    // approval or input request.
    const job = threadId
      ? this.store.listJobs().find((candidate) => candidate.threadId === threadId)
      : undefined;
    if (!job) {
      this.adapter.respond(request.id, { accept: false });
      return;
    }
    const scope = redactString(JSON.stringify(request.params ?? {}).slice(0, 800));
    const dangerous = isDangerousScope(scope);
    const target = this.pairing.kind === "group" && dangerous
      ? approvalTarget(scope, this.pairing, this.privateApprovalChatId ?? job.chatId).chatId
      : job.chatId;
    if (request.method?.toLowerCase().includes("requestuserinput")) {
      const code = `Q${String(++this.inputSeq).padStart(3, "0")}`;
      this.pendingInputs.set(code, { requestId: request.id, jobId: job.jobId, chatId: target, expiresAt: this.now() + 120_000 });
      this.store.updateJobStatus(job.jobId, "waiting_input");
      this.store.updateJobMetadata(job.jobId, { pendingDecision: code });
      await this.reply(job.jobId, `工作 ${job.jobId} 需要你的回答 ${code}：${scope}`, target);
      return;
    }
    const code = this.approvals.create({
      jobId: job.jobId,
      requestId: String(request.id),
      threadId: job.threadId,
      turnId: job.activeTurnId,
      scope,
      userId: job.senderId,
      chatId: target,
      now: this.now(),
    });
    this.store.updateJobStatus(job.jobId, "waiting_approval");
    this.store.updateJobMetadata(job.jobId, { pendingDecision: code });
    const project = this.projects.get(job.projectId);
    const details = [
      `Project：${project?.name ?? job.projectId}`,
      `Task：${job.jobId}`,
      `Turn：${job.activeTurnId ?? "尚未建立"}`,
      `cwd：${job.worktreePath ?? job.cwd}`,
      `動作：${request.method ?? "request"}`,
      `影響範圍：${scope || "(未提供)"}`,
      `失效時間：${new Date(this.store.getApproval(code)?.expiresAt ?? this.now()).toISOString()}`,
    ].join("\n");
    const body = dangerous && target !== job.chatId
      ? `工作 ${job.jobId} 等待發起人於私人聊天處理批准 ${code}。`
      : `工作 ${job.jobId} 需要批准 ${code}：\n${details}`;
    await this.reply(job.jobId, body, target);
  }

  private async run(
    projectId: string,
    request: string,
    msg: InboxMessage,
    options: RunOptions = {},
  ): Promise<HandleResult> {
    const proj = this.projects.get(projectId);
    if (!proj) {
      await this.reply("sys", `專案未登記：${projectId}`, msg.chatId);
      return { action: "run:no-project" };
    }
    const jobId = options.jobId ?? this.allocateJobId();
    const cwd = options.cwd ?? proj.cwd;
    this.projects.markUsed(projectId, this.now());
    this.store.createJob({
      jobId,
      chatId: msg.chatId,
      senderId: msg.senderId,
      projectId,
      cwd,
      title: request.slice(0, 120),
      executionMode: options.executionMode ?? "main",
      branchName: options.branchName ?? null,
      worktreePath: options.worktreePath ?? null,
      notificationPolicy: proj.notificationPolicy,
      status: "queued",
      createdAt: this.now(),
    });
    const laneKey = options.executionMode === "worktree" ? `${projectId}:${jobId}` : projectId;
    this.scheduler.submit({ jobId, chatId: msg.chatId, projectId, laneKey, worktreePath: cwd });
    const queued = this.scheduler.queueSnapshot().find((item) => item.jobId === jobId);
    this.store.updateJobMetadata(jobId, {
      queuePosition: queued?.state === "queued" ? queued.position : null,
      queueReason: queued?.state === "queued" ? queued.reason : null,
    });
    const result = new Promise<HandleResult>((resolve, reject) => {
      this.runRequests.set(jobId, { projectId, request, msg, options: { ...options, jobId, cwd }, resolve, reject });
    });
    const queueReason = queued?.reason === "capacity" ? "全域並行上限" : queued?.reason === "project-busy" ? "同專案主 lane 忙碌" : "目前可執行";
    const mode = options.executionMode ?? "main";
    const permission = proj.executionPolicy ?? "read-only";
    const ack = queued?.state === "queued"
      ? `已接收：${projectId} · Task ${jobId} · ${request.slice(0, 80)}\n模式：${mode} · 權限：${permission}\n排隊第 ${queued.position}（${queueReason}）。`
      : `已接收：${projectId} · Task ${jobId} · ${request.slice(0, 80)}\n模式：${mode} · 權限：${permission}\n準備執行。`;
    await this.reply(jobId, ack, msg.chatId);
    this.pumpRuns();
    return result;
  }

  private pumpRuns(): void {
    while (true) {
      const started = this.scheduler.startNext();
      if (!started) return;
      const req = this.runRequests.get(started.item.jobId);
      if (!req) {
        this.scheduler.finish(started.item.jobId);
        continue;
      }
      this.store.updateJobMetadata(started.item.jobId, { queuePosition: null });
      void this.executeRun(started.item.jobId, req.projectId, req.request, req.msg, req.options)
        .then(req.resolve)
        .catch(async (error: unknown) => {
          const detail = error instanceof Error ? error.message : "未知執行錯誤";
          const executionUnknown = /process|exit|disconnect|transport/i.test(detail);
          if (executionUnknown) this.store.updateJobMetadata(started.item.jobId, { executionStatus: "execution_unknown" });
          this.store.updateJobStatus(started.item.jobId, executionUnknown ? "needs_reconciliation" : "failed", detail);
          await this.reply(started.item.jobId, `執行失敗：${detail}`, req.msg.chatId);
          req.resolve({ action: "failed", jobId: started.item.jobId });
        })
        .finally(() => {
          this.runRequests.delete(started.item.jobId);
          this.scheduler.finish(started.item.jobId);
          for (const item of this.scheduler.queueSnapshot()) {
            if (item.state === "queued") this.store.updateJobMetadata(item.jobId, { queuePosition: item.position, queueReason: item.reason });
          }
          this.pumpRuns();
        });
    }
  }

  private async executeRun(
    jobId: string,
    projectId: string,
    request: string,
    msg: InboxMessage,
    options: RunOptions,
  ): Promise<HandleResult> {
    const cwd = options.cwd ?? this.projects.get(projectId)?.cwd;
    if (!cwd) throw new Error(`project disappeared: ${projectId}`);
    // Drive the Codex turn to completion.
    this.store.updateJobStatus(jobId, "starting");
    this.store.updateJobMetadata(jobId, { currentStep: "starting thread", executionStatus: "known" });
    const thread = (await this.adapter.startThread({ cwd })) as {
      threadId: string;
    };
    this.store.setJobThread(jobId, thread.threadId);
    this.store.updateJobStatus(jobId, "running");
    this.store.updateJobMetadata(jobId, { currentStep: "running turn" });
    this.store.appendEvent(jobId, 1, "turn/started", null, this.now());

    let lastItemText = "";
    let expectedTurnId = "";
    // The initial turn/started record above uses sequence 1.
    let eventSeq = 2;
    let turnStartedRecorded = true;
    const turnEvents: TurnEvent[] = [];
    let onTurn = (_p: unknown): void => undefined;
    let onAttachment = (_p: unknown): void => undefined;
    const appendEvent = (kind: string, payload: unknown): void => {
      this.store.appendEvent(jobId, eventSeq++, kind, payload, this.now());
    };
    const cleanup = (): void => {
      this.adapter.off("turn/started", onTurnStarted);
      this.adapter.off("item/started", onItemStarted);
      this.adapter.off("item/completed", onItem);
      this.adapter.off("item/commandExecution/outputDelta", onCommandOutput);
      this.adapter.off("turn/plan/updated", onPlan);
      this.adapter.off("turn/diff/updated", onDiff);
      this.adapter.off("thread/tokenUsage/updated", onTokens);
      this.adapter.off("thread/attachment/updated", onAttachment);
      this.adapter.off("turn/completed", onTurn);
    };
    const onTurnStarted = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const turn = stringField(recordOf(p).turn, "id") ?? stringField(p, "turnId");
      if (turn && !expectedTurnId) expectedTurnId = turn;
      this.store.updateJobMetadata(jobId, { currentStep: "執行中" });
      if (!turnStartedRecorded) {
        appendEvent("turn/started", p);
        turnStartedRecorded = true;
      }
    };
    const onItemStarted = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const item = nestedItem(p);
      const step = stringField(item, "type", "title", "name");
      if (step) this.store.updateJobMetadata(jobId, { currentStep: step });
      appendEvent("item/started", p);
    };
    const onItem = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const item = nestedItem(p);
      const text = stringField(item, "text") ?? stringField(p, "text");
      if (text) lastItemText = text;
      const type = stringField(item, "type")?.toLowerCase();
      if (type === "agentmessage" || text) {
        const phase = (stringField(item, "phase") ?? "").toLowerCase();
        turnEvents.push({ kind: "agentMessage", phase: phase.includes("final") ? "final_answer" : "commentary", text: text ?? "" });
      }
      if (type === "commandexecution") {
        turnEvents.push({ kind: "command", command: stringField(item, "command") ?? "(command)", exitCode: typeof item.exitCode === "number" ? item.exitCode : null });
      }
      const files = changeFiles(item);
      if (type === "filechange" || files.length) {
        for (const file of files) turnEvents.push({ kind: "fileChange", ...file });
        if (files.length) this.store.updateJobMetadata(jobId, { changedFiles: files.map((file) => file.path) });
      }
      for (const artifact of artifactRecords(item)) {
        this.store.addArtifact({ jobId, ...artifact, createdAt: this.now() });
      }
      appendEvent("item/completed", p);
    };
    const onCommandOutput = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const line = stringField(p, "delta", "chunk", "text");
      if (line) {
        this.store.updateJobMetadata(jobId, { currentStep: `執行命令：${redactString(line).slice(0, 120)}` });
        appendEvent("command/output", { text: redactString(line).slice(0, 400) });
      }
    };
    const onPlan = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const plan = recordOf(p).plan;
      if (Array.isArray(plan)) {
        const firstOpen = plan.find((item) => !recordOf(item).completed && !recordOf(item).done);
        const step = firstOpen ? stringField(firstOpen, "step", "text", "title") : undefined;
        if (step) this.store.updateJobMetadata(jobId, { currentStep: step });
      }
      appendEvent("turn/plan/updated", p);
    };
    const onDiff = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      const diff = stringField(p, "diff");
      if (diff) {
        const files = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => ({ path: match[1]!, added: 0, removed: 0 }));
        if (files.length) turnEvents.push({ kind: "diff", files });
        if (files.length) this.store.updateJobMetadata(jobId, { changedFiles: files.map((file) => file.path) });
      }
      appendEvent("turn/diff/updated", p);
    };
    const onTokens = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      appendEvent("thread/tokenUsage/updated", p);
    };
    onAttachment = (p: unknown): void => {
      if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
      for (const artifact of artifactRecords(recordOf(p))) {
        this.store.addArtifact({ jobId, ...artifact, createdAt: this.now() });
      }
      appendEvent("thread/attachment/updated", p);
    };
    const completed = new Promise<void>((resolve) => {
      onTurn = (p: unknown): void => {
        if (!eventBelongs(p, thread.threadId, expectedTurnId)) return;
        cleanup();
        resolve();
      };
      this.adapter.on("turn/started", onTurnStarted);
      this.adapter.on("item/started", onItemStarted);
      this.adapter.on("item/completed", onItem);
      this.adapter.on("item/commandExecution/outputDelta", onCommandOutput);
      this.adapter.on("turn/plan/updated", onPlan);
      this.adapter.on("turn/diff/updated", onDiff);
      this.adapter.on("thread/tokenUsage/updated", onTokens);
      this.adapter.on("thread/attachment/updated", onAttachment);
      this.adapter.on("turn/completed", onTurn);
    });

    let turn: { turnId?: string };
    try {
      turn = await this.adapter.startTurn({ threadId: thread.threadId, input: request }) as { turnId?: string };
    } catch (error) {
      cleanup();
      throw error;
    }
    expectedTurnId = turn.turnId ?? expectedTurnId;
    if (turn.turnId) this.store.setJobThread(jobId, thread.threadId, turn.turnId);
    await completed;

    appendEvent("turn/completed", null);
    const result = reduceTurn(turn.turnId ?? jobId, turnEvents);
    const finalText = result.finalText || lastItemText;
    const summary = formatResult(result);
    const safeFinalText = redactString(finalText);
    const safeSummary = redactString(summary);
    const wasCancelled = this.cancelled.delete(jobId);
    const job = this.store.getJob(jobId);
    const worktree = job?.executionMode === "worktree";
    const hasFailedCommand = result.commands.some((command) => command.exitCode !== null && command.exitCode !== 0);
    const finalStatus = wasCancelled
      ? "cancelled"
      : worktree
        ? "merge-pending"
        : hasFailedCommand
          ? "completed_with_followup"
          : "completed";
    this.store.updateJobStatus(jobId, finalStatus, safeFinalText || undefined);
    this.store.updateJobMetadata(jobId, {
      resultSummary: safeSummary || safeFinalText || null,
      changedFiles: result.files.map((file) => file.path),
      pendingDecision: null,
      executionStatus: "known",
    });
    const projectName = this.projects.get(projectId)?.name ?? projectId;
    const stateLabel = wasCancelled
      ? "已取消"
      : worktree
        ? "已完成，待合併"
        : hasFailedCommand
          ? "已完成但需後續"
          : "已完成";
    await this.reply(jobId, `Project：${projectName} · Task：${jobId} · ${stateLabel}\n${safeSummary || `結果：${safeFinalText || "(無輸出)"}`}`, msg.chatId);
    return { action: "ran", jobId };
  }

  /** Enqueue a labelled reply to the source conversation and flush the outbox. */
  private async reply(jobId: string, body: string, chatId = this.transport.chatId()): Promise<void> {
    this.seq += 1;
    const safeBody = redactString(body);
    this.outbox.enqueueMessage(
      jobId,
      chatId,
      this.seq,
      safeBody,
      this.now(),
    );
    for (const row of this.outbox.pending(chatId)) {
      try {
        const routed = this.transport as TeamsTransport & { sendMessageTo?: (targetChatId: string, text: string) => Promise<string> };
        if (chatId !== this.transport.chatId() && !routed.sendMessageTo) throw new Error(`transport cannot route chat ${chatId}`);
        if (chatId !== this.transport.chatId()) await routed.sendMessageTo!(chatId, row.body);
        else await this.transport.sendMessage(row.body);
        this.outbox.markSent(row.id, this.now());
        if (jobId !== "sys" && this.store.getJob(jobId)) this.store.updateJobMetadata(jobId, { deliveryStatus: "online" });
      } catch {
        // Send outcome uncertain: retain for reconciliation, don't blindly resend.
        this.outbox.markUnknown(row.id);
        if (jobId !== "sys" && this.store.getJob(jobId)) this.store.updateJobMetadata(jobId, { deliveryStatus: "delivery_degraded" });
      }
    }
  }
}
