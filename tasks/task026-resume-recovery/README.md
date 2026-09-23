# task026 — Continuity & recovery via thread/resume (roadmap F)

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Persist the resident threadId; on boot call thread/resume to restore context; replay unresolved approvals/outbox; mark in-flight jobs interrupted and re-post status.

## Acceptance (evidence-based)

Unit/integration tests: threadId persisted+reloaded; resume path invoked; unresolved outbox/approvals replayed; in-flight jobs marked interrupted (not re-run).

## Required evidence (stored under evidence/)

- `resume-recovery-test.txt`

## Result

Completed. `src/supervisor/session.ts`: `saveResidentThread`/`loadResidentThread` persist
the resident threadId in a new `session` table; `planResume(store)` → `{mode:"resume",
threadId}` if persisted else `{mode:"start"}`; `markInFlightInterrupted` sets in-flight
jobs to `interrupted` (never re-run); `bootRecovery(store)` aggregates the resume plan +
interrupted jobs + pending outbox + pending approvals for replay. Added `Store.setSession/
getSession` and `listPendingApprovals`.

Real verification (`evidence/resume-recovery-test.txt`, file-backed DB reopened to simulate
restart): 4/4 — threadId persists → resume; fresh → start; in-flight→interrupted (terminal
untouched); bootRecovery returns resume plan + interrupted jobs + pending outbox/approvals,
and the in-flight job is only marked (not re-run). Full suite green.

Wiring note: the resident runner calls `bootRecovery` on start and uses `thread/resume`
when `mode==="resume"` (adapter already exposes `resumeThread`).

Commit: recorded on push (see git log).
