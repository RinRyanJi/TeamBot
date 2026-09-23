# task009 — Progress coalescing and transactional outbox

- Phase: 2
- Env: local (fully verifiable here)
- Status: pending

## Spec

Coalesce progress events (<=1 per 30s guidance), segment long messages with jobId/seq/part, transactional outbox with 'send status unknown' retention; no exactly-once claim.

## Acceptance (evidence-based)

Tests: bursty events coalesced; long message segmented; send-uncertain kept in outbox for reconciliation.

## Required evidence (stored under evidence/)

- `progress-outbox-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
