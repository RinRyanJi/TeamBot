# task012 — Phase 1 end-to-end: help/projects/run/status/result with fixtures

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Wire inbox+router+adapter+store+outbox with mock Teams fixture and mock/real Codex. Implement help, projects, run, status, result. Single running job.

## Acceptance (evidence-based)

Integration test: one fixture phone message creates exactly one job; Codex runs in the registered project; status queryable; completion/failure returned to the source conversation.

## Required evidence (stored under evidence/)

- `phase1-e2e-test.txt`

## Result

Completed. `src/app/coordinator.ts` wires the full Phase-1 pipeline:
inbox.intake (dedup/baseline) → parseCommand → authorize → for `run`: create job,
ack, drive Codex thread/turn via the adapter, capture the result on turn/completed,
persist, and reply — all through the transactional outbox to the source conversation.
Supported: help, projects, run, status, result. Plus `src/app/ids.ts` (T-id generator)
and `src/app/projects.ts` (alias→cwd registry; phone can't submit arbitrary cwd).
Depends only on the `TeamsTransport` interface and injectable `CodexAdapter`.

Real verification (`evidence/phase1-e2e-test.txt`): 4/4 with a fake transport + fake
Codex — (1) one run message creates exactly one job (T001), runs in the registered
project (cwd bound), binds threadId, stores the result, and sends both the `已接收`
ack and `已完成` result to the source chat; (2) status/result answered from stored
state without a model run; (3) duplicate run message → `ignored:duplicate`, no second
job; (4) unregistered project → `denied:project-not-authorized`, no Codex start.
Full suite 58/58, 0 skipped.

Commit: recorded on push (see git log).
