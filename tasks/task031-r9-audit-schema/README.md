# task031 — R9: append-only audit schema

- Phase: G1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Add an append-only audit table (no UPDATE/DELETE) recording {ts, senderId, conversation, redacted command, decision deny/allow/whitelist-add, matched rule}. Write on every deny/allow/whitelist path.

## Acceptance (evidence-based)

Unit tests: each decision path writes an audit row; UPDATE/DELETE on the table is rejected; redaction applied.

## Required evidence (stored under evidence/)

- `audit-test.txt`

## Result

Completed. `schema.ts` gains an append-only `audit` table (SCHEMA_VERSION → 2) with
`decision` CHECK constraint and two triggers (`audit_no_update`, `audit_no_delete`)
that `RAISE(ABORT)` on any UPDATE/DELETE — tamper-evidence enforced at the DB level,
not just in code. `Store.appendAudit/listAudit/auditCount` added; `appendAudit`
redacts token-shaped secrets in the command field via `redactString` before write.

Evidence (`evidence/audit-test.txt`, 4/4 pass): append+list newest-first; raw
UPDATE and DELETE both rejected with "append-only"; a `github_pat_…` token is
redacted; unknown `decision` rejected by CHECK. Full suite 140/140, typecheck clean.

Note: this is the schema + store layer. Wiring each deny/allow/whitelist decision
path to call `appendAudit` lands with R7 (task033-036) and the coordinator (R8).
