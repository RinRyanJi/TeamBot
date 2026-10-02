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
import { formatOverview, formatProjects, formatTask } from "./overview.ts";
import { GitWorktreeRuntime, type WorktreeRuntime } from "../supervisor/worktree-runtime.ts";
import { MultiTaskScheduler } from "../supervisor/worktrees.ts";
import { ApprovalManager } from "../router/approvals.ts";
import { isDangerousScope, approvalTarget } from "../router/approval-routing.ts";
import { redactString } from "../util/redact.ts";

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
  private contexts = new ConversationContextStore();
  private seq = 0;
  private cancelled = new Set<string>();
  private pendingForks = new Map<string, { chatId: string; senderId: string; request: string }>();
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
    const eventSource = this.adapter as unknown as { on?: (event: string, listener: (payload: unknown) => void) => void };
    eventSource.on?.("serverRequest", (payload) => { void this.handleServerRequest(payload); });
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

    const v4 = parseV4Command(msg.text, this.projects.list());
    if (v4.ok) {
      this.store.markDispatched(msg.tenant, msg.chatId, msg.messageId);
      return this.handleV4(v4.command, msg);
    }

    const parsed = parseCommand(msg.text);
    if (!parsed.ok) {
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
        await this.reply("sys", "指令：overview/projects/focus/run/task/add/steer/fork/watch/mute/stop/cancel/approve/deny/handoff/help", msg.chatId);
        return { action: "help" };
      case "projects":
        await this.reply("sys", formatProjects(this.projects), msg.chatId);
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
        const role = this.pairing.roles?.[msg.senderId] ?? "operator";
        const canAnswer = !!job && (this.admins.includes(msg.senderId) || job.senderId === msg.senderId || (this.pairing.kind === "group" && (role === "owner" || role === "operator")));
        if (!job || !canAnswer) {
          await this.reply("sys", "只有工作發起人或群組 operator 可以回答這個問題。", msg.chatId);
          return { action: "answer:denied" };
        }
        this.adapter.respond(input.requestId, { text: cmd.text });
        this.pendingInputs.delete(cmd.questionId);
        this.store.updateJobStatus(input.jobId, "running");
        await this.reply(input.jobId, `已回答 ${cmd.questionId}，繼續執行。`, msg.chatId);
        return { action: "answered", jobId: input.jobId };
      }
      case "kill": {
        this.adapter.stop();
        const affected = this.store.listJobs().filter((job) => ["starting", "running", "waiting_input", "waiting_approval", "stopping"].includes(job.status));
        for (const job of affected) this.store.updateJobStatus(job.jobId, "unknown", "Codex process was killed; reconciliation required");
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
      : (this.pairing.roles?.[msg.senderId] ?? "operator");
    const mutating = ["run", "add", "fork", "cancel", "stop", "steer", "handoff"].includes(command.kind);
    if (mutating && role === "viewer") {
      await this.reply("sys", "群組檢視者只能查看摘要；請由 operator/owner 執行此操作。", msg.chatId);
      return { action: "denied:group-role" };
    }

    switch (command.kind) {
      case "overview":
        await this.reply("sys", formatOverview(this.store.listJobs(this.pairing.kind === "group" ? msg.chatId : undefined), this.projects), msg.chatId);
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
        if (!project || !this.pairing.projects.includes(project.projectId)) {
          await this.reply("sys", `找不到或未授權專案：${command.projectId}`, msg.chatId);
          return { action: "focus:denied" };
        }
        const focused = this.contexts.focus(msg.chatId, project.projectId, this.now());
        this.store.setConversationContext(msg.chatId, project.projectId, focused.updatedAt, focused.expiresAt);
        await this.reply("sys", `目前專案：${project.name} (${project.projectId})；只對此聊天有效，至 ${new Date(focused.expiresAt).toISOString()} 前有效。`, msg.chatId);
        return { action: "focus", jobId: undefined };
      }
      case "run": {
        const resolution = resolveProject(this.projects, this.contexts, msg.chatId, command.projectId);
        if (resolution.kind === "unknown") {
          // With an already focused, authorized project, `run <request>` is
          // allowed as a convenience. Without that focus an unknown explicit
          // project remains a hard authorization failure.
          const focused = resolveProject(this.projects, this.contexts, msg.chatId, undefined);
          if (command.projectId && focused.kind === "resolved" && focused.source === "focused" && this.pairing.projects.includes(focused.project.projectId)) {
            this.contexts.focus(msg.chatId, focused.project.projectId, this.now());
            this.store.setConversationContext(msg.chatId, focused.project.projectId, this.now());
            return this.run(focused.project.projectId, `${command.projectId} ${command.request}`.trim(), msg);
          }
          await this.reply("sys", `拒絕：專案未登記或未授權：${resolution.projectId}`, msg.chatId);
          return { action: command.projectId ? "denied:project-not-authorized" : "run:no-project" };
        }
        if (resolution.kind === "ambiguous") {
          const names = resolution.candidates.filter((p) => this.pairing.projects.includes(p.projectId)).map((p) => `${p.name} (${p.projectId})`);
          await this.reply("sys", `請先指定專案：${names.join(", ") || "(沒有可用專案)"}\n例如：!tb focus <project>`, msg.chatId);
          return { action: "run:ambiguous" };
        }
        if (!this.pairing.projects.includes(resolution.project.projectId)) {
          await this.reply("sys", `未授權專案：${resolution.project.projectId}`, msg.chatId);
          return { action: "run:denied" };
        }
        this.contexts.focus(msg.chatId, resolution.project.projectId, this.now());
        this.store.setConversationContext(msg.chatId, resolution.project.projectId, this.now());
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
        const details = command.details ? `\n事件：${this.store.listEvents(job.jobId).slice(-8).map((e) => `${e.seq}:${e.kind}`).join(", ") || "(無)"}` : "";
        await this.reply(job.jobId, formatTask(job, this.projects.get(job.projectId)?.name) + details, msg.chatId);
        return { action: "task", jobId: job.jobId };
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
          const completed = new Promise<void>((resolve) => {
            const onTurn = (): void => {
              this.adapter.off("item/completed", onItem);
              resolve();
            };
            const onItem = (p: unknown): void => {
              const text = (p as { text?: string })?.text;
              if (text) addedResult = text;
            };
            this.adapter.on("item/completed", onItem);
            this.adapter.once("turn/completed", onTurn);
          });
          this.store.updateJobStatus(base.jobId, "running");
          const turn = (await this.adapter.startTurn({ threadId: base.threadId, input: command.request })) as { turnId?: string };
          this.store.setJobThread(base.jobId, base.threadId, turn.turnId);
          await completed;
          this.store.updateJobStatus(base.jobId, this.cancelled.has(base.jobId) ? "cancelled" : "completed", addedResult);
          await this.reply(base.jobId, `已追加並完成；結果：${addedResult || "(無輸出)"}`, msg.chatId);
          return { action: "added", jobId: base.jobId };
        }
        const resolution = resolveProject(this.projects, this.contexts, msg.chatId, undefined);
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
        try {
          worktreePath = await this.worktrees.create(base.cwd, newJobId);
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
            `cwd：${job.worktreePath ?? job.cwd}`,
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
    const role = this.pairing.roles?.[msg.senderId] ?? "operator";
    return role === "owner" || role === "operator";
  }

  private allocateJobId(): string {
    let candidate = this.ids.next();
    while (this.store.getJob(candidate)) candidate = this.ids.next();
    return candidate;
  }

  private async handleServerRequest(payload: unknown): Promise<void> {
    const request = payload as { id?: number; method?: string; params?: Record<string, unknown> };
    if (typeof request.id !== "number") return;
    const threadId = typeof request.params?.threadId === "string" ? request.params.threadId : undefined;
    const job = this.store.listJobs().find((candidate) => candidate.threadId === threadId)
      ?? this.store.listJobs().find((candidate) => ["starting", "running"].includes(candidate.status));
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
    const body = dangerous && target !== job.chatId
      ? `工作 ${job.jobId} 等待發起人於私人聊天處理批准 ${code}。`
      : `工作 ${job.jobId} 需要批准 ${code}：${scope}`;
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
    this.store.createJob({
      jobId,
      chatId: msg.chatId,
      senderId: msg.senderId,
      projectId,
      cwd,
      title: request.slice(0, 120),
      executionMode: options.executionMode ?? "main",
      worktreePath: options.worktreePath ?? null,
      notificationPolicy: proj.notificationPolicy,
      status: "queued",
      createdAt: this.now(),
    });
    const laneKey = options.executionMode === "worktree" ? `${projectId}:${jobId}` : projectId;
    this.scheduler.submit({ jobId, chatId: msg.chatId, projectId, laneKey, worktreePath: cwd });
    const queued = this.scheduler.queueSnapshot().find((item) => item.jobId === jobId);
    this.store.updateJobMetadata(jobId, { queuePosition: queued?.state === "queued" ? queued.position : null });
    const result = new Promise<HandleResult>((resolve, reject) => {
      this.runRequests.set(jobId, { projectId, request, msg, options: { ...options, jobId, cwd }, resolve, reject });
    });
    await this.reply(jobId, queued?.state === "queued" ? `已接收，專案 ${projectId}，排隊第 ${queued.position}（同專案主 lane 或資源上限）。` : `已接收，專案 ${projectId}，準備執行。`, msg.chatId);
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
          this.store.updateJobStatus(started.item.jobId, "failed", detail);
          await this.reply(started.item.jobId, `執行失敗：${detail}`, req.msg.chatId);
          req.resolve({ action: "failed", jobId: started.item.jobId });
        })
        .finally(() => {
          this.runRequests.delete(started.item.jobId);
          this.scheduler.finish(started.item.jobId);
          for (const item of this.scheduler.queueSnapshot()) {
            if (item.state === "queued") this.store.updateJobMetadata(item.jobId, { queuePosition: item.position });
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
    const thread = (await this.adapter.startThread({ cwd })) as {
      threadId: string;
    };
    this.store.setJobThread(jobId, thread.threadId);
    this.store.updateJobStatus(jobId, "running");
    this.store.appendEvent(jobId, 1, "turn/started", null, this.now());

    let lastItemText = "";
    let expectedTurnId = "";
    const onItem = (p: unknown): void => {
      const params = p as { threadId?: string; turnId?: string; text?: string };
      if (params.threadId && params.threadId !== thread.threadId) return;
      if (params.turnId && expectedTurnId && params.turnId !== expectedTurnId) return;
      const text = params.text;
      if (text) lastItemText = text;
    };
    const completed = new Promise<void>((resolve) => {
      const onTurn = (p: unknown): void => {
        const params = p as { threadId?: string; turnId?: string };
        if (params.threadId && params.threadId !== thread.threadId) return;
        if (expectedTurnId && params.turnId && params.turnId !== expectedTurnId) return;
        this.adapter.off("item/completed", onItem);
        this.adapter.off("turn/completed", onTurn);
        resolve();
      };
      this.adapter.on("item/completed", onItem);
      this.adapter.on("turn/completed", onTurn);
    });

    const turn = (await this.adapter.startTurn({ threadId: thread.threadId, input: request })) as { turnId?: string };
    expectedTurnId = turn.turnId ?? "";
    if (turn.turnId) this.store.setJobThread(jobId, thread.threadId, turn.turnId);
    await completed;

    this.store.appendEvent(jobId, 2, "turn/completed", null, this.now());
    const wasCancelled = this.cancelled.delete(jobId);
    const job = this.store.getJob(jobId);
    const worktree = job?.executionMode === "worktree";
    const finalStatus = wasCancelled ? "cancelled" : worktree ? "merge-pending" : "completed";
    this.store.updateJobStatus(jobId, finalStatus, lastItemText);
    await this.reply(jobId, `${wasCancelled ? "已取消" : worktree ? "已完成，待合併" : "已完成"}；結果：${lastItemText || "(無輸出)"}`, msg.chatId);
    return { action: "ran", jobId };
  }

  /** Enqueue a labelled reply to the source conversation and flush the outbox. */
  private async reply(jobId: string, body: string, chatId = this.transport.chatId()): Promise<void> {
    this.seq += 1;
    this.outbox.enqueueMessage(
      jobId,
      chatId,
      this.seq,
      body,
      this.now(),
    );
    for (const row of this.outbox.pending(chatId)) {
      try {
        await this.transport.sendMessage(row.body);
        this.outbox.markSent(row.id, this.now());
      } catch {
        // Send outcome uncertain: retain for reconciliation, don't blindly resend.
        this.outbox.markUnknown(row.id);
      }
    }
  }
}
