# task003 — SQLite storage layer (inbox, outbox, jobs, approvals) with migrations

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Implement a storage module over SQLite with schema/migrations for inbox, outbox, jobs, approvals, events, pairings. Transactional writes.

## Acceptance (evidence-based)

Unit tests cover create/read/update for each table and a transactional multi-write; tests pass.

## Required evidence (stored under evidence/)

- `storage-test.txt`

## Result

Completed. Storage layer over the **built-in `node:sqlite`** (no native dependency;
runs with `--experimental-sqlite`).
- `src/storage/schema.ts` — DDL for pairings, jobs, events, approvals, inbox, outbox + indexes; versioned via `PRAGMA user_version`.
- `src/storage/store.ts` — typed `Store` with reentrant transactions (nested calls use SAVEPOINTs so helpers that open their own transaction compose inside an outer one), dedup insert (`INSERT OR IGNORE` → returns whether new), and CRUD for every table.

Real verification (`evidence/storage-test.txt`): 8/8 storage tests pass — schema version, pairing JSON round-trip + upsert-in-place, inbox dedup (same key inserts once), job create/update + thread binding, event append updates `lastEventAt` and lists in order, approval lifecycle, outbox enqueue/list/mark, and atomic rollback of a multi-write transaction (0 events remain; store still usable after). Full suite 13/13.

Commit: recorded on push (see git log).
