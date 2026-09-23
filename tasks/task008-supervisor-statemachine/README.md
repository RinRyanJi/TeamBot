# task008 — Supervisor: job state machine, single active turn, queue, project lock

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Job lifecycle (queued->starting->running->completed/failed, waiting_input/waiting_approval, stopping->cancelled, interrupted/unknown). One active turn per thread. Global single-job MVP with explicit queueing; project lock scaffold.

## Acceptance (evidence-based)

State-machine tests cover all transitions and illegal transitions; concurrent submissions from self-chat and group -> correct queue order, results routed to source.

## Required evidence (stored under evidence/)

- `supervisor-test.txt`

## Result

Completed.
- `src/supervisor/states.ts` — `JobStatus` + legal transition map + `canTransition`/`assertTransition`/`isTerminal`. Encodes queued→starting→running→completed/failed, waiting_input/waiting_approval, stopping (which may race a real completion), and interrupted/unknown resolving after reconcile.
- `src/supervisor/queue.ts` — `JobQueue(maxConcurrent=1)` with per-project mutual exclusion. MVP is global single-job; project locks are the scaffold for later multi-job (same project never runs twice concurrently). Items carry `chatId` so results route to source.

Real verification (`evidence/supervisor-test.txt`): 6/6 — legal transitions accepted; illegal (completed→running, queued→running, etc.) rejected; terminal states have no outgoing; MVP single-job self+group queue order with source routing; project lock skips a locked-project job to run a different project even under a higher cap; waiting-job removal (cancel before run). Full suite 47/47.

Commit: recorded on push (see git log).
