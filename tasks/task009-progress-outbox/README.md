# task009 — Progress coalescing and transactional outbox

- Phase: 2
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Coalesce progress events (<=1 per 30s guidance), segment long messages with jobId/seq/part, transactional outbox with 'send status unknown' retention; no exactly-once claim.

## Acceptance (evidence-based)

Tests: bursty events coalesced; long message segmented; send-uncertain kept in outbox for reconciliation.

## Required evidence (stored under evidence/)

- `progress-outbox-test.txt`

## Result

Completed.
- `src/progress/progress.ts` — `ProgressCoalescer(intervalMs=30000)`: important events (start/complete/fail/waiting_*) always report and reset the routine window; routine progress reports at most once per interval. `segmentMessage` splits long bodies into `[TB <jobId>] (k/n)`-labelled parts under a size cap.
- `src/progress/outbox.ts` — `Outbox` enqueues all segments of a message atomically (single transaction), tracks `sent` vs `unknown`; uncertain sends are retained as `unknown` for reconciliation, never blindly resent (no exactly-once claim). Added `Store.listOutboxByStatus`.

Real verification (`evidence/progress-outbox-test.txt`): 6/6 — important-always-emit, routine coalesced to once/interval, important resets window, short=1 part, long message segmented with correct part/total + size cap + lossless reassembly, atomic enqueue + sent/unknown retention. Full suite 53/53.

Commit: recorded on push (see git log).
