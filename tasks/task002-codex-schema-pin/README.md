# task002 — Pin & generate Codex app-server protocol schema; verify method/event names

- Phase: 0
- Env: local (fully verifiable here)
- Status: pending

## Spec

Using codex-cli 0.156.1, generate the app-server JSON/TS schema. Commit the generated artifact. Add a test asserting the method names the architecture depends on (initialize, thread/start, thread/resume, turn/start, turn/steer, turn/interrupt) and key event names exist in the generated schema.

## Acceptance (evidence-based)

Generated schema file committed; test asserts each required method/event name is present (or documents the real name if different, updating docs).

## Required evidence (stored under evidence/)

- `codex-version.txt`
- `schema-generate.txt`
- `schema-names-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
