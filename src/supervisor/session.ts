// Resident session continuity (product-brainstorm roadmap F).
// The resident Codex threadId is persisted so a restart can `thread/resume` the same
// conversation instead of starting fresh. Boot recovery marks in-flight jobs interrupted
// (never re-run) and surfaces unresolved outbox/approvals for replay.
import type { Store, OutboxRow, Approval, Job } from "../storage/store.ts";

export const RESIDENT_THREAD_KEY = "residentThreadId";

export function saveResidentThread(store: Store, threadId: string, at: number): void {
  store.setSession(RESIDENT_THREAD_KEY, threadId, at);
}

export function loadResidentThread(store: Store): string | undefined {
  return store.getSession(RESIDENT_THREAD_KEY);
}

export interface ResumePlan {
  mode: "resume" | "start";
  threadId: string | null;
}

/** Decide whether to resume a persisted thread or start a new one. */
export function planResume(store: Store): ResumePlan {
  const id = loadResidentThread(store);
  return id ? { mode: "resume", threadId: id } : { mode: "start", threadId: null };
}

const IN_FLIGHT = new Set([
  "starting",
  "running",
  "waiting_input",
  "waiting_approval",
  "stopping",
]);

/** Mark jobs that were in flight at crash time as `interrupted` (not re-run). */
export function markInFlightInterrupted(store: Store): string[] {
  const out: string[] = [];
  for (const jobId of store.listJobIds()) {
    const job = store.getJob(jobId);
    if (job && IN_FLIGHT.has(job.status)) {
      store.updateJobStatus(jobId, "interrupted");
      out.push(jobId);
    }
  }
  return out;
}

export interface BootRecovery {
  resume: ResumePlan;
  interruptedJobs: string[];
  pendingOutbox: OutboxRow[];
  pendingApprovals: Approval[];
}

/** Full boot-time recovery snapshot for the resident runner. */
export function bootRecovery(store: Store): BootRecovery {
  return {
    resume: planResume(store),
    interruptedJobs: markInFlightInterrupted(store),
    pendingOutbox: store.listPendingOutbox(),
    pendingApprovals: store.listPendingApprovals(),
  };
}

// re-export for callers that want the Job type
export type { Job };
