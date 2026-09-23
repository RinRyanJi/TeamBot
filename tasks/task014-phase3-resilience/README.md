# task014 — Phase 3 restart/reconnect/checkpoint recovery

- Phase: 3
- Env: local (fully verifiable here)
- Status: pending

## Spec

Teams re-login, browser reload, checkpoint recovery; outbox reconciliation, send-status-unknown, process-loss, approval-wait recovery; offline recovery notice (arch §7).

## Acceptance (evidence-based)

Tests: restart does not re-run history nor misroute results; unrecoverable jobs clearly marked; Teams offline but job done -> result held in outbox, reconciled on recovery.

## Required evidence (stored under evidence/)

- `phase3-resilience-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
