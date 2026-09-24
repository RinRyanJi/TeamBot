# task037 — R8a: emergency stop wiring (stop / kill)

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Wire stop (graceful, turn/interrupt) and kill (hard) into the command layer (coordinator, currently Phase 2). After stop/kill the status card no longer shows ⏳. Stop bypasses push throttle.

## Acceptance (evidence-based)

Tests: stop drains current step, kill interrupts immediately, status card cleared; live smoke.

## Required evidence (stored under evidence/)

- `stop-kill-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
