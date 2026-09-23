// Live per-turn status model (product-brainstorm roadmap C).
// Fed by item/plan/delta (todo), item/started (current step), commandExecution/outputDelta
// (tail), tokenUsage (footer). Coalesces to at most one flush per interval and only when
// dirty; exposes a synchronous snapshot for the pull `status` path and a heartbeat for
// idle/hung detection.

export interface PlanItem {
  text: string;
  done: boolean;
}

export interface StatusSnapshot {
  step: string;
  plan: PlanItem[];
  outputTail: string[];
  tokens: number;
  idleMs: number;
}

export class TurnStatus {
  private intervalMs: number;
  private tailMax: number;
  private dirty = false;
  private lastFlushAt = -Infinity;
  private lastEventAt = 0;
  private step = "";
  private plan: PlanItem[] = [];
  private outputTail: string[] = [];
  private tokens = 0;

  constructor(intervalMs = 15_000, tailMax = 3) {
    this.intervalMs = intervalMs;
    this.tailMax = tailMax;
  }

  private touch(now: number): void {
    this.dirty = true;
    this.lastEventAt = now;
  }

  setStep(name: string, now: number): void {
    this.step = name;
    this.touch(now);
  }
  setPlan(items: PlanItem[], now: number): void {
    this.plan = items.map((i) => ({ ...i }));
    this.touch(now);
  }
  pushOutput(line: string, now: number): void {
    this.outputTail.push(line);
    if (this.outputTail.length > this.tailMax) {
      this.outputTail = this.outputTail.slice(-this.tailMax);
    }
    this.touch(now);
  }
  setTokens(n: number, now: number): void {
    this.tokens = n;
    this.touch(now);
  }

  /** True when there is new content AND the coalesce interval has elapsed. */
  shouldFlush(now: number): boolean {
    return this.dirty && now - this.lastFlushAt >= this.intervalMs;
  }
  markFlushed(now: number): void {
    this.dirty = false;
    this.lastFlushAt = now;
  }

  /** Synchronous read for the pull `status` path (never blocks on the model). */
  snapshot(now: number): StatusSnapshot {
    return {
      step: this.step,
      plan: this.plan.map((i) => ({ ...i })),
      outputTail: [...this.outputTail],
      tokens: this.tokens,
      idleMs: this.lastEventAt === 0 ? 0 : now - this.lastEventAt,
    };
  }

  /** Heartbeat: no events for >= thresholdMs while a turn is active. */
  isIdle(now: number, thresholdMs: number): boolean {
    return this.lastEventAt !== 0 && now - this.lastEventAt >= thresholdMs;
  }
}
