// Live turn control (architecture §3/§6): mid-run steer, stop, and input answers,
// with a clear distinction between "stopping" (requested) and "cancelled" (actually
// ended). One active turn per thread (MVP single job).
import type { Store } from "../storage/store.ts";
import type { CodexAdapter } from "../codex/adapter.ts";

interface ActiveTurn {
  jobId: string;
  threadId: string;
  turnId: string;
  stopping: boolean;
  lastText: string;
  resolveSettled: (outcome: "completed" | "cancelled" | "failed") => void;
}

export class TurnControl {
  private store: Store;
  private adapter: CodexAdapter;
  private now: () => number;
  private active: ActiveTurn | null = null;
  settled: Promise<"completed" | "cancelled" | "failed"> | null = null;

  constructor(store: Store, adapter: CodexAdapter, now: () => number = () => 0) {
    this.store = store;
    this.adapter = adapter;
    this.now = now;
    this.adapter.on("turn/started", (p: unknown) => {
      const turnId = (p as { turnId?: string })?.turnId;
      if (this.active && turnId) this.active.turnId = turnId;
    });
    this.adapter.on("item/completed", (p: unknown) => {
      const text = (p as { text?: string })?.text;
      if (this.active && text) this.active.lastText = text;
    });
    this.adapter.on("turn/completed", () => this.finalize());
  }

  /** Start a turn on an existing thread and track it. Returns the turnId. */
  async begin(jobId: string, threadId: string, input: string): Promise<string> {
    const settled = new Promise<"completed" | "cancelled" | "failed">(
      (resolve) => {
        this.active = {
          jobId,
          threadId,
          turnId: "",
          stopping: false,
          lastText: "",
          resolveSettled: resolve,
        };
      },
    );
    this.settled = settled;
    const r = (await this.adapter.startTurn({ threadId, input })) as {
      turnId: string;
    };
    if (this.active) this.active.turnId = r.turnId;
    this.store.updateJobStatus(jobId, "running");
    return r.turnId;
  }

  /** Append a request to the running turn. */
  async steer(input: string): Promise<void> {
    if (!this.active) throw new Error("no active turn to steer");
    await this.adapter.steer({
      turnId: this.active.turnId,
      expectedTurnId: this.active.turnId,
      input,
    });
  }

  /** Request a stop. Sets 'stopping' immediately; 'cancelled' only after the turn actually ends. */
  stop(): Promise<"completed" | "cancelled" | "failed"> {
    if (!this.active) throw new Error("no active turn to stop");
    this.active.stopping = true;
    this.store.updateJobStatus(this.active.jobId, "stopping");
    // fire-and-forget; actual termination is observed via turn/completed
    void this.adapter.interrupt({ turnId: this.active.turnId });
    return this.settled ?? Promise.resolve("cancelled");
  }

  /** Answer a Codex input request (server->client request id). */
  answer(requestId: number, text: string): void {
    this.adapter.respond(requestId, { text });
  }

  private finalize(): void {
    if (!this.active) return;
    const outcome = this.active.stopping ? "cancelled" : "completed";
    this.store.updateJobStatus(this.active.jobId, outcome, this.active.lastText);
    const resolve = this.active.resolveSettled;
    this.active = null;
    resolve(outcome);
  }
}
