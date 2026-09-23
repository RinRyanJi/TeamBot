# task023 — Live status model + coalescer wiring (roadmap C)

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Build a per-turn live status model fed by item/plan/delta (todo), item/started (current step), commandExecution/outputDelta (tail), tokenUsage (footer); coalesce to <=1 update/interval and only when dirty; heartbeat for idle detection; a status snapshot readable without the model.

## Acceptance (evidence-based)

Unit tests: bursty deltas coalesce to one dirty-gated update; plan/step/tail/token reflected in snapshot; heartbeat flags idle; status snapshot readable synchronously.

## Required evidence (stored under evidence/)

- `status-live-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
