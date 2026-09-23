# task002 — Pin & generate Codex app-server protocol schema; verify method/event names

- Phase: 0
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Using codex-cli 0.156.1, generate the app-server JSON/TS schema. Commit the generated artifact. Add a test asserting the method names the architecture depends on (initialize, thread/start, thread/resume, turn/start, turn/steer, turn/interrupt) and key event names exist in the generated schema.

## Acceptance (evidence-based)

Generated schema file committed; test asserts each required method/event name is present (or documents the real name if different, updating docs).

## Required evidence (stored under evidence/)

- `codex-version.txt`
- `schema-generate.txt`
- `schema-names-test.txt`

## Result

Completed. Generated the app-server protocol schema from the real **codex-cli 0.156.1**
(`codex app-server generate-ts` / `generate-json-schema`). The TS bindings are committed
under `src/codex/schema/ts/` (96 files) as the pinned contract; the bulky JSON schema is
gitignored and reproducible via `npm run gen:codex-schema`.

Verified: all method/event names the architecture depends on **exist in the real schema** —
`initialize`, `initialized`, `thread/start`, `thread/resume`, `turn/start`, `turn/steer`,
`turn/interrupt`, events `thread/started`/`turn/started`/`turn/completed`/`item/started`/
`item/completed`, and requests `item/{commandExecution,fileChange,permissions}/requestApproval`
+ `item/tool/requestUserInput`. Names centralized in `src/codex/protocol-names.ts`, enforced
by `tests/codex-protocol-names.test.ts`. Architecture §3 updated with the verified names.

Real verification (see `evidence/`):
- `codex-version.txt` — `codex-cli 0.156.1`.
- `schema-generate.txt` — generation commands, file counts (ts=96, json=39), and grep proof of all 16 names in the generated bindings.
- `schema-names-test.txt` — protocol-name test passes (2/2); non-vacuous check shows `turn/steer present: true`, `turn/BOGUS present: false`.

Commit: recorded on push (see git log).
