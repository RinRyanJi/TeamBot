// Job lifecycle state machine (architecture §6).
//
//   queued -> starting -> running -> completed / failed
//                            <->  waiting_input / waiting_approval
//   running / waiting_* -> stopping -> cancelled
//   process loss -> interrupted / unknown -> (reconcile) -> ...
//
// Status is authoritative in the store; this module defines legal transitions so
// illegal ones (e.g. "completed -> running") are rejected instead of silently applied.

export type JobStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "unknown"
  | "execution_unknown"
  | "needs_reconciliation"
  | "merge-pending";

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["starting", "cancelled"],
  starting: ["running", "failed", "stopping", "execution_unknown", "needs_reconciliation"],
  running: [
    "completed",
    "failed",
    "waiting_input",
    "waiting_approval",
    "stopping",
    "interrupted",
    "unknown",
    "execution_unknown",
    "needs_reconciliation",
    "merge-pending",
  ],
  waiting_input: ["running", "stopping", "failed", "interrupted", "unknown", "execution_unknown", "needs_reconciliation"],
  waiting_approval: ["running", "stopping", "failed", "interrupted", "unknown", "execution_unknown", "needs_reconciliation"],
  // Stop may race with a real completion/failure that was already in flight.
  stopping: ["cancelled", "completed", "failed", "execution_unknown", "needs_reconciliation"],
  // After reconciliation an interrupted/unknown job resolves to a definite state.
  interrupted: ["running", "completed", "failed", "cancelled", "unknown", "execution_unknown", "needs_reconciliation"],
  unknown: ["running", "completed", "failed", "cancelled", "interrupted", "execution_unknown", "needs_reconciliation"],
  execution_unknown: ["needs_reconciliation", "running", "completed", "failed", "cancelled"],
  needs_reconciliation: ["running", "completed", "failed", "cancelled", "execution_unknown"],
  "merge-pending": ["completed", "cancelled"],
  // Terminal.
  completed: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL_STATES: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export const isTerminal = (s: JobStatus): boolean => TERMINAL_STATES.has(s);

export const canTransition = (from: JobStatus, to: JobStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal job transition: ${from} -> ${to}`);
  }
}
