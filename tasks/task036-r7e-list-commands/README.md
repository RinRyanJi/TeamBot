# task036 — R7e: list commands (ok 永遠 / !tb 名單 / remove / TTL)

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

ok 永遠 writes a precise pattern (no wildcard npm run) with echo of the pattern added; per-entry TTL that actively asks before expiring; !tb 名單 to read, !tb 名單 移除 <n> to remove.

## Acceptance (evidence-based)

Loop test: add → match runs directly → remove → back to asking. Echo + TTL behavior tested.

## Required evidence (stored under evidence/)

- `list-commands-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
