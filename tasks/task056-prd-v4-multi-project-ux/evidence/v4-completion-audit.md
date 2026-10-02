# PRD v4 completion audit

Local verification command:

```text
npm test
npm run test:v4
npm run typecheck
npm run build
npm run harness:teams:v4
node --experimental-strip-types --check scripts/e2e-v4-run.ts
```

Observed evidence:

- 179 tests passed, including all 12 User Cases v4 fixtures, coordinator result folding, task detail summaries, and `completed_with_followup` for failed commands.
- Project-first routing refuses ambiguous self-chat requests and accepts focused natural language.
- Project profiles reject alias/name collisions, enforce conversation bindings, and expose safe display data.
- Task records persist title, execution mode, branch/worktree, queue reason, decision state, changed files, artifact rows (path/kind/hash/delivery state), result summary and update time; `artifact` lists those stored rows.
- Different projects can run concurrently; the same main project lane remains serialized.
- Fork confirmation creates a named `teambot/<taskId>` branch and reports `merge-pending`.
- Dangerous group approvals route through a multi-chat transport to the owner self-chat and resolve once there.
- `npm run run:v4` now wires the Electron-owned Teams surface, scoped self/group transports, project registry, Codex app-server and one central approval/input event router; startup refuses missing sender/project configuration.
- Runtime recovery now attempts persisted `thread/resume`, reconciles the per-chat outbox, reports interrupted jobs without rerunning them, and requires an explicit self-chat ID whenever groups are enabled.
- The v4 runtime promotes process-loss jobs to `needs_reconciliation` and emits an offline-gap notice from a persisted Teams heartbeat; it never automatically reruns an uncertain turn.
- Outbox delivery state is persisted as `delivery_degraded` while Teams is unavailable and returns to `online` only after reconciliation succeeds.
- Codex process loss is persisted separately as `execution_unknown`; the runner promotes the task to `needs_reconciliation` and never reruns it automatically.
- Codex item, command, file-change, diff and plan events are folded into stored task events, changed-file metadata and a final-answer-first result summary.
- Group members without an explicit configured role default to viewer; unknown Codex thread requests are rejected rather than guessed across concurrent projects.
- `rename`, `diff`, `files`, `artifact`, `stop`, `kill`, `ok` and `no` have explicit parsers and authorization paths.
- The live harness is non-sending by design. Real Teams tenant, phone and group evidence remains in task060 and requires a user-run disposable-chat session.
