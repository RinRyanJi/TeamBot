# task034 — R7c: read/write asymmetry + read-only reference allow-list (Q5)

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Writes limited to AgentHub; reads default to AgentHub plus a configurable read-only reference allow-list. Secret paths hard-denied even if registered (blacklist beats allow-list); realpath-resolved; desktop-set + restart only.

## Acceptance (evidence-based)

Tests: read allowed in listed dir; write to listed dir denied; secret path denied even when registered; symlink escape denied.

## Required evidence (stored under evidence/)

- `read-write-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
