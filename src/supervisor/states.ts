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
  | "unknown";

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["starting", "cancelled"],
  starting: ["running", "failed", "stopping"],
  running: [
    "completed",
    "failed",
    "waiting_input",
    "waiting_approval",
    "stopping",
    "interrupted",
    "unknown",
  ],
  waiting_input: ["running", "stopping", "failed", "interrupted", "unknown"],
  waiting_approval: ["running", "stopping", "failed", "interrupted", "unknown"],
  // Stop may race with a real completion/failure that was already in flight.
  stopping: ["cancelled", "completed", "failed"],
  // After reconciliation an interrupted/unknown job resolves to a definite state.
  interrupted: ["running", "completed", "failed", "cancelled", "unknown"],
  unknown: ["running", "completed", "failed", "cancelled", "interrupted"],
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
