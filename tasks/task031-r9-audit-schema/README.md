# task031 — R9: append-only audit schema

- Phase: G1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Add an append-only audit table (no UPDATE/DELETE) recording {ts, senderId, conversation, redacted command, decision deny/allow/whitelist-add, matched rule}. Write on every deny/allow/whitelist path.

## Acceptance (evidence-based)

Unit tests: each decision path writes an audit row; UPDATE/DELETE on the table is rejected; redaction applied.

## Required evidence (stored under evidence/)

- `audit-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
