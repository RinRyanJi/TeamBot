// Optional multi-task scheduling (product-brainstorm roadmap G).
// Default remains a single resident thread (maxConcurrent=1). When opted in, additional
// jobs run in parallel bound to ISOLATED git worktrees, while a per-project lock still
// guarantees the same project never runs two jobs at once. This module owns worktree
// path allocation; actually creating/removing the git worktree at the path is a runtime
// concern (git worktree add/remove) performed by the caller.
import { normalize } from "node:path";
import { JobQueue, type QueueItem } from "./queue.ts";

export class WorktreeAllocator {
  private root: string;
  private inUse = new Map<string, string>(); // jobId -> path

  constructor(root: string) {
    this.root = root;
  }

  /** Assign a unique isolated worktree path for a job. */
  allocate(jobId: string): string {
    const path = normalize(`${this.root}\\.worktrees\\${jobId}`);
    this.inUse.set(jobId, path);
    return path;
  }

  release(jobId: string): void {
    this.inUse.delete(jobId);
  }

  pathFor(jobId: string): string | undefined {
    return this.inUse.get(jobId);
  }

  activePaths(): string[] {
    return [...this.inUse.values()];
  }
}

export interface StartedTask {
  item: QueueItem;
  worktree: string;
}

/**
 * Combines the JobQueue (concurrency cap + per-project lock) with worktree allocation.
 * maxConcurrent=1 (default) reproduces the single resident-thread behavior.
 */
export class MultiTaskScheduler {
  private queue: JobQueue;
  private allocator: WorktreeAllocator;

  constructor(worktreeRoot: string, maxConcurrent = 1) {
    this.queue = new JobQueue(maxConcurrent);
    this.allocator = new WorktreeAllocator(worktreeRoot);
  }

  submit(item: QueueItem): number {
    return this.queue.enqueue(item);
  }

  /** Start the next eligible task (respecting cap + project lock); allocate its worktree. */
  startNext(): StartedTask | null {
    const item = this.queue.activateNext();
    if (!item) return null;
    const worktree = this.allocator.allocate(item.jobId);
    return { item, worktree };
  }

  /** Finish a task: release its worktree and project lock. */
  finish(jobId: string): void {
    this.allocator.release(jobId);
    this.queue.complete(jobId);
  }

  get activeCount(): number {
    return this.queue.activeCount;
  }
  worktreeFor(jobId: string): string | undefined {
    return this.allocator.pathFor(jobId);
  }
}
