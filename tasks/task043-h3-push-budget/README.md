# task043 — H3: push budget (debounce/chunk/retry_after)

- Phase: G2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Land the push budget: debounce 900ms, chunk 3500, retry_after backoff. Every row of §5 has a corresponding acceptance method.

## Acceptance (evidence-based)

Tests: throttle interval respected; chunking; retry_after backoff.

## Required evidence (stored under evidence/)

- `push-budget-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
