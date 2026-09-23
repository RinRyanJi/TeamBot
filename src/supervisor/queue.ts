// Job queue with a concurrency cap and per-project mutual exclusion (architecture §6).
// MVP: maxConcurrent = 1 (one job runs at a time; the rest are explicitly queued).
// Scaffold for later multi-job: raise maxConcurrent; a project lock still guarantees
// the same project never runs two jobs at once. Each item carries its source chatId
// so results are always routed back to the originating conversation.

export interface QueueItem {
  jobId: string;
  chatId: string;
  projectId: string;
}

export class JobQueue {
  private waiting: QueueItem[] = [];
  private active = new Map<string, QueueItem>();
  private lockedProjects = new Set<string>();
  private maxConcurrent: number;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
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
      (w) => !this.lockedProjects.has(w.projectId),
    );
    if (idx < 0) return null;
    const [item] = this.waiting.splice(idx, 1);
    if (!item) return null;
    this.active.set(item.jobId, item);
    this.lockedProjects.add(item.projectId);
    return item;
  }

  /** Mark an active job finished, releasing its project lock. */
  complete(jobId: string): void {
    const item = this.active.get(jobId);
    if (!item) return;
    this.active.delete(jobId);
    this.lockedProjects.delete(item.projectId);
  }

  /** Remove a still-waiting job (e.g. cancelled before it ran). */
  removeWaiting(jobId: string): boolean {
    const idx = this.waiting.findIndex((w) => w.jobId === jobId);
    if (idx < 0) return false;
    this.waiting.splice(idx, 1);
    return true;
  }
}
