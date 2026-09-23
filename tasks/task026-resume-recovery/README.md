# task026 — Continuity & recovery via thread/resume (roadmap F)

- Phase: 3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Persist the resident threadId; on boot call thread/resume to restore context; replay unresolved approvals/outbox; mark in-flight jobs interrupted and re-post status.

## Acceptance (evidence-based)

Unit/integration tests: threadId persisted+reloaded; resume path invoked; unresolved outbox/approvals replayed; in-flight jobs marked interrupted (not re-run).

## Required evidence (stored under evidence/)

- `resume-recovery-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
