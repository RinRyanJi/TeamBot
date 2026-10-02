// Job queue with a concurrency cap and per-project mutual exclusion (architecture §6).
// MVP: maxConcurrent = 1 (one job runs at a time; the rest are explicitly queued).
// Scaffold for later multi-job: raise maxConcurrent; a project lock still guarantees
// the same project never runs two jobs at once. Each item carries its source chatId
// so results are always routed back to the originating conversation.

export interface QueueItem {
  jobId: string;
  chatId: string;
  projectId: string;
  laneKey?: string;
  worktreePath?: string;
}

export interface QueueSnapshotItem extends QueueItem {
  state: "queued" | "active";
  position: number;
  reason: "capacity" | "project-busy" | "ready";
}

export class JobQueue {
  private waiting: QueueItem[] = [];
  private active = new Map<string, QueueItem>();
  private lockedProjects = new Set<string>();
  private maxConcurrent: number;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  private laneKey(item: QueueItem): string {
    return item.laneKey ?? item.projectId;
  }

  /** Enqueue an item; returns its 1-based position among waiting items. */
  enqueue(item: QueueItem): number {
    this.waiting.push(item);
    return this.waiting.length;
  }

  /** 1-based position among waiting items, or 0 if not waiting. */
  positionOf(jobId: string): number {
    const idx = this.waiting.findIndex((w) => w.jobId === jobId);
    return idx < 0 ? 0 : idx + 1;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }
  get activeCount(): number {
    return this.active.size;
  }

  get maxCapacity(): number {
    return this.maxConcurrent;
  }

  /** A user-facing snapshot explaining why each queued item is waiting. */
  snapshot(): QueueSnapshotItem[] {
    const active = [...this.active.values()].map((item) => ({
      ...item,
      state: "active" as const,
      position: 0,
      reason: "ready" as const,
    }));
    const queued = this.waiting.map((item, index) => ({
      ...item,
      state: "queued" as const,
      position: index + 1,
      reason: (this.active.size >= this.maxConcurrent
        ? "capacity"
        : this.lockedProjects.has(this.laneKey(item))
          ? "project-busy"
          : "ready") as QueueSnapshotItem["reason"],
    }));
    return [...active, ...queued];
  }
  isActive(jobId: string): boolean {
    return this.active.has(jobId);
  }

  /**
   * Activate the next eligible waiting item, if capacity allows and its project is
   * not locked. Returns the activated item, or null if nothing could start.
   */
  activateNext(): QueueItem | null {
    if (this.active.size >= this.maxConcurrent) return null;
    const idx = this.waiting.findIndex(
      (w) => !this.lockedProjects.has(this.laneKey(w)),
    );
    if (idx < 0) return null;
    const [item] = this.waiting.splice(idx, 1);
    if (!item) return null;
    this.active.set(item.jobId, item);
    this.lockedProjects.add(this.laneKey(item));
    return item;
  }

  /** Mark an active job finished, releasing its project lock. */
  complete(jobId: string): void {
    const item = this.active.get(jobId);
    if (!item) return;
    this.active.delete(jobId);
    this.lockedProjects.delete(this.laneKey(item));
  }

  /** Remove a still-waiting job (e.g. cancelled before it ran). */
  removeWaiting(jobId: string): boolean {
    const idx = this.waiting.findIndex((w) => w.jobId === jobId);
    if (idx < 0) return false;
    this.waiting.splice(idx, 1);
    return true;
  }
}
