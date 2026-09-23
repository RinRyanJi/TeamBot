# task008 — Supervisor: job state machine, single active turn, queue, project lock

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Job lifecycle (queued->starting->running->completed/failed, waiting_input/waiting_approval, stopping->cancelled, interrupted/unknown). One active turn per thread. Global single-job MVP with explicit queueing; project lock scaffold.

## Acceptance (evidence-based)

State-machine tests cover all transitions and illegal transitions; concurrent submissions from self-chat and group -> correct queue order, results routed to source.

## Required evidence (stored under evidence/)

- `supervisor-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
