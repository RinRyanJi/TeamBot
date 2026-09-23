# task023 — Live status model + coalescer wiring (roadmap C)

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Build a per-turn live status model fed by item/plan/delta (todo), item/started (current step), commandExecution/outputDelta (tail), tokenUsage (footer); coalesce to <=1 update/interval and only when dirty; heartbeat for idle detection; a status snapshot readable without the model.

## Acceptance (evidence-based)

Unit tests: bursty deltas coalesce to one dirty-gated update; plan/step/tail/token reflected in snapshot; heartbeat flags idle; status snapshot readable synchronously.

## Required evidence (stored under evidence/)

- `status-live-test.txt`

## Result

Completed. `src/progress/status-model.ts` `TurnStatus`: fed by setStep/setPlan/pushOutput/
setTokens; `shouldFlush(now)` gates updates to ≤1 per interval AND only when dirty
(`markFlushed` resets); `snapshot(now)` is a synchronous **copy** for the pull `status`
path; `isIdle(now, threshold)` is the heartbeat. Output tail bounded to N lines.

Real verification (`evidence/status-live-test.txt`): 5/5 — coalesce gating (dirty +
interval), tail bounded to last N, snapshot reflects step/plan/tokens/idle, heartbeat idle
threshold, and snapshot immutability (pull path can't mutate internal state). Full suite green.

Wiring note: this is the model + policy; the resident runner's status-card edit-in-place +
`status` command consume `shouldFlush`/`snapshot` (adapter integration, no new logic).

Commit: recorded on push (see git log).
