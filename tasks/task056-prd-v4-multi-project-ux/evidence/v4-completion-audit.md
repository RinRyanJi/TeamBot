# PRD v4 completion audit

Local verification command:

```text
npm test
npm run typecheck
npm run build
npm run harness:teams:v4
```

Observed evidence:

- 174 tests passed, including all 12 User Cases v4 fixtures.
- Project-first routing refuses ambiguous self-chat requests and accepts focused natural language.
- Project profiles reject alias/name collisions, enforce conversation bindings, and expose safe display data.
- Task records persist title, execution mode, branch/worktree, queue reason, decision state, files, artifacts, result summary and update time.
- Different projects can run concurrently; the same main project lane remains serialized.
- Fork confirmation creates a named `teambot/<taskId>` branch and reports `merge-pending`.
- Dangerous group approvals route through a multi-chat transport to the owner self-chat and resolve once there.
- `rename`, `diff`, `files`, `artifact`, `stop`, `kill`, `ok` and `no` have explicit parsers and authorization paths.
- The live harness is non-sending by design. Real Teams tenant, phone and group evidence remains in task060 and requires a user-run disposable-chat session.
