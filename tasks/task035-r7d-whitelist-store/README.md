# task035 — R7d: per-project whitelist store + decision-order tests

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Per-project (keyed by projectId, even if single-valued) whitelist schema + store CRUD. Decision-order unit tests: path-out-of-bounds is denied even if the command is whitelisted (①② before ③).

## Acceptance (evidence-based)

CRUD tests + order tests (hardwall beats whitelist) pass.

## Required evidence (stored under evidence/)

- `whitelist-store-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
