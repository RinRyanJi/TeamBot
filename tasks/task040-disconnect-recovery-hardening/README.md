# task040 — Disconnect recovery hardening

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

On disconnect fall back to read-only + stop accepting jobs; ?/status returns 'remote-control link broken' when the runner is offline (recovery.ts already has in-flight→unknown, outbox replay, offline-gap notice).

## Acceptance (evidence-based)

Tests: offline downgrade to read-only; offline status pull returns link-broken.

## Required evidence (stored under evidence/)

- `disconnect-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
