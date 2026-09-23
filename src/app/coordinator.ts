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
import { JobIdGenerator } from "./ids.ts";

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
  private seq = 0;
  private lastItemText = "";

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
        await this.reply("sys", `專案：${this.projects.list().join(", ") || "(無)"}`);
        return { action: "projects" };
      case "run":
        return this.run(cmd.projectId, cmd.request, msg);
      case "status": {
        const job = this.store.getJob(cmd.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${cmd.jobId}`);
          return { action: "status:unknown" };
        }
        await this.reply(
          job.jobId,
          `狀態：${job.status}；最近事件時間：${job.lastEventAt ?? "-"}`,
        );
        return { action: "status", jobId: job.jobId };
      }
      case "result": {
        const job = this.store.getJob(cmd.jobId);
        if (!job) {
          await this.reply("sys", `找不到工作 ${cmd.jobId}`);
          return { action: "result:unknown" };
        }
        await this.reply(job.jobId, `結果：${job.lastResult ?? "(尚無)"}`);
        return { action: "result", jobId: job.jobId };
      }
      default:
        // continue/steer/stop/approve/deny/answer are Phase 2.
        await this.reply("sys", `Phase 1 尚未支援：${cmd.kind}`);
        return { action: `unsupported:${cmd.kind}` };
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
    await this.reply(jobId, `已接收，專案 ${projectId}，準備執行。`);

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

    await this.adapter.startTurn({ threadId: thread.threadId, input: request });
    await completed;

    this.store.appendEvent(jobId, 2, "turn/completed", null, this.now());
    this.store.updateJobStatus(jobId, "completed", this.lastItemText);
    await this.reply(jobId, `已完成；結果：${this.lastItemText || "(無輸出)"}`);
    return { action: "ran", jobId };
  }

  /** Enqueue a labelled reply to the source conversation and flush the outbox. */
  private async reply(jobId: string, body: string): Promise<void> {
    this.seq += 1;
    this.outbox.enqueueMessage(
      jobId,
      this.transport.chatId(),
      this.seq,
      body,
      this.now(),
    );
    for (const row of this.outbox.pending(this.transport.chatId())) {
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
