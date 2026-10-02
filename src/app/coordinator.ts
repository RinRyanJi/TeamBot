// Phase-1 coordinator: wires inbox -> router -> supervisor -> codex -> outbox ->
// Teams transport for one full round trip (architecture §4/§6/§7).
// Handles help, projects, run, status, result; a single running job at a time.
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
import { formatOverview, formatTask } from "./overview.ts";

export interface CoordinatorOptions {
  store: Store;
  transport: TeamsTransport;
  adapter: CodexAdapter;
  projects: ProjectRegistry;
  pairing: Pairing;
  admins?: string[];
  now?: () => number;
  ids?: JobIdGenerator;
}

export interface HandleResult {
  action: string;
  jobId?: string;
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
  private contexts = new ConversationContextStore();
  private seq = 0;
  private lastItemText = "";
  private cancelled = new Set<string>();

  constructor(opts: CoordinatorOptions) {
    this.store = opts.store;
    this.transport = opts.transport;
    this.adapter = opts.adapter;
    this.projects = opts.projects;
    this.pairing = opts.pairing;
    this.admins = opts.admins ?? [];
    this.now = opts.now ?? (() => 0);
    this.ids = opts.ids ?? new JobIdGenerator();
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
    if (v4.ok) return this.handleV4(v4.command, msg);

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
        await this.reply("sys", "指令：run/status/result/projects/help");
        return { action: "help" };
      case "projects":
        await this.reply("sys", `專案：${this.projects.all().map((p) => `${p.name} (${p.projectId})`).join(", ") || "(無)"}`, msg.chatId);
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
      default:
        // continue/steer/stop/approve/deny/answer are Phase 2.
        await this.reply("sys", `Phase 1 尚未支援：${cmd.kind}`);
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
    const mutating = ["run", "add", "fork", "cancel", "handoff"].includes(command.kind);
    if (mutating && role === "viewer") {
      await this.reply("sys", "群組檢視者只能查看摘要；請由 operator/owner 執行此操作。", msg.chatId);
      return { action: "denied:group-role" };
    }

    switch (command.kind) {
      case "overview":
        await this.reply("sys", formatOverview(this.store.listJobs(), this.projects), msg.chatId);
        return { action: "overview" };
      case "focus": {
        const project = this.projects.resolve(command.projectId);
        if (!project || !this.pairing.projects.includes(project.projectId)) {
          await this.reply("sys", `找不到或未授權專案：${command.projectId}`, msg.chatId);
          return { action: "focus:denied" };
        }
        this.contexts.focus(msg.chatId, project.projectId, this.now());
        this.store.setConversationContext(msg.chatId, project.projectId, this.now());
        await this.reply("sys", `已切換目前專案：${project.name} (${project.projectId})`, msg.chatId);
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
        await this.reply(job.jobId, formatTask(job, this.projects.get(job.projectId)?.name), msg.chatId);
        return { action: "task", jobId: job.jobId };
      }
      case "add": {
        if (command.jobId) {
          const base = this.store.getJob(command.jobId);
          if (!base) {
            await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
            return { action: "add:unknown" };
          }
          if (base.chatId !== msg.chatId && !this.admins.includes(msg.senderId)) {
            await this.reply("sys", "這個工作屬於另一個聊天，無法追加。", msg.chatId);
            return { action: "add:denied" };
          }
          if (!base.threadId) {
            await this.reply(base.jobId, "這個工作尚未建立 Codex thread，請稍後再追加。", msg.chatId);
            return { action: "add:not-ready", jobId: base.jobId };
          }
          const completed = new Promise<void>((resolve) => {
            const onTurn = (): void => {
              this.adapter.off("item/completed", onItem);
              resolve();
            };
            const onItem = (p: unknown): void => {
              const text = (p as { text?: string })?.text;
              if (text) this.lastItemText = text;
            };
            this.adapter.on("item/completed", onItem);
            this.adapter.once("turn/completed", onTurn);
          });
          this.lastItemText = "";
          this.store.updateJobStatus(base.jobId, "running");
          const turn = (await this.adapter.startTurn({ threadId: base.threadId, input: command.request })) as { turnId?: string };
          this.store.setJobThread(base.jobId, base.threadId, turn.turnId);
          await completed;
          this.store.updateJobStatus(base.jobId, this.cancelled.has(base.jobId) ? "cancelled" : "completed", this.lastItemText);
          await this.reply(base.jobId, `已追加並完成；結果：${this.lastItemText || "(無輸出)"}`, msg.chatId);
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
        if (base.projectId !== this.projects.resolve(base.projectId)?.projectId) {
          await this.reply("sys", "工作所屬專案已不存在。", msg.chatId);
          return { action: "fork:no-project" };
        }
        await this.reply("sys", `已建立 ${base.projectId} 的 fork 要求；執行會使用獨立 worktree。`, msg.chatId);
        return this.run(base.projectId, command.request, msg);
      }
      case "watch":
        await this.reply(command.jobId, command.mode === "watch" ? "已開啟此工作的重要進度通知。" : "已靜音此工作的非決策通知。", msg.chatId);
        return { action: command.mode, jobId: command.jobId };
      case "cancel": {
        const job = this.store.getJob(command.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${command.jobId}`, msg.chatId);
          return { action: "cancel:unknown" };
        }
        if (["running", "starting"].includes(job.status) && job.activeTurnId) {
          this.cancelled.add(command.jobId);
          this.store.updateJobStatus(command.jobId, "stopping");
          await this.adapter.interrupt({ turnId: job.activeTurnId });
          await this.reply(command.jobId, "已要求停止；待 Codex 確認 turn 結束後回報 cancelled。", msg.chatId);
          return { action: "stopping", jobId: command.jobId };
        }
        this.store.updateJobStatus(command.jobId, "cancelled");
        await this.reply(command.jobId, "已取消排隊中的工作。", msg.chatId);
        return { action: "cancelled", jobId: command.jobId };
      }
      case "handoff":
        await this.reply(command.jobId, "已標記為 handoff；請在桌面端接續此 Codex thread。", msg.chatId);
        return { action: "handoff", jobId: command.jobId };
    }
  }

  private async run(
    projectId: string,
    request: string,
    msg: InboxMessage,
  ): Promise<HandleResult> {
    const proj = this.projects.get(projectId);
    if (!proj) {
      await this.reply("sys", `專案未登記：${projectId}`);
      return { action: "run:no-project" };
    }
    const jobId = this.ids.next();
    this.store.createJob({
      jobId,
      chatId: msg.chatId,
      senderId: msg.senderId,
      projectId,
      cwd: proj.cwd,
      status: "queued",
      createdAt: this.now(),
    });
    await this.reply(jobId, `已接收，專案 ${projectId}，準備執行。`, msg.chatId);

    // Drive the Codex turn to completion.
    this.store.updateJobStatus(jobId, "starting");
    const thread = (await this.adapter.startThread({ cwd: proj.cwd })) as {
      threadId: string;
    };
    this.store.setJobThread(jobId, thread.threadId);
    this.store.updateJobStatus(jobId, "running");
    this.store.appendEvent(jobId, 1, "turn/started", null, this.now());

    this.lastItemText = "";
    const onItem = (p: unknown): void => {
      const text = (p as { text?: string })?.text;
      if (text) this.lastItemText = text;
    };
    const completed = new Promise<void>((resolve) => {
      const onTurn = (): void => {
        this.adapter.off("item/completed", onItem);
        resolve();
      };
      this.adapter.on("item/completed", onItem);
      this.adapter.once("turn/completed", onTurn);
    });

    const turn = (await this.adapter.startTurn({ threadId: thread.threadId, input: request })) as { turnId?: string };
    if (turn.turnId) this.store.setJobThread(jobId, thread.threadId, turn.turnId);
    await completed;

    this.store.appendEvent(jobId, 2, "turn/completed", null, this.now());
    const wasCancelled = this.cancelled.delete(jobId);
    this.store.updateJobStatus(jobId, wasCancelled ? "cancelled" : "completed", this.lastItemText);
    await this.reply(jobId, `${wasCancelled ? "已取消" : "已完成"}；結果：${this.lastItemText || "(無輸出)"}`, msg.chatId);
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
