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

The current run is recorded in [local-verification-2026-10-03.txt](local-verification-2026-10-03.txt).

Observed evidence:

- 188 tests passed, including the 51-test v4 suite with all 12 User Cases v4 fixtures, coordinator result folding, task detail summaries, group source binding, recovery visibility, and `completed_with_followup` for failed commands.
- Project-first routing refuses ambiguous self-chat requests and accepts focused natural language.
- Project profiles reject alias/name collisions, enforce conversation bindings, and expose safe display data.
- Desktop onboarding now provides a local registration/edit/remove form with absolute-path validation and an atomic user-data `projects.json`; the runtime can load that file without putting paths in shell history.
- Ambiguous self-chat requests now store a short-lived numbered choice; replying `1`/`2`/`3` starts exactly one task in the selected project.
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
- Group overview/task/diff responses stay summary-only; private result text and thread identifiers are withheld from group viewers.
- Recovery statuses include `execution_unknown` and `needs_reconciliation` in the lifecycle transition model.
- `rename`, `diff`, `files`, `artifact`, `stop`, `kill`, `ok` and `no` have explicit parsers and authorization paths.
- A group viewer cannot invoke the legacy `!tb kill` control; an authorized hard stop records `execution_unknown` plus `needs_reconciliation` instead of presenting an ordinary failure.
- Coordinator entrypoints reject messages whose tenant or chat ID does not match the configured pairing, and group overview keeps recovery task/project identity visible.
- Teams message extraction rejects generic accessibility/announcement identifiers as sender IDs; the Playwright read path, MutationObserver path, and Phase 0 harness use the same bounded sender lookup.
- The Teams adapter also falls back to `data-person-mri` on newer DOMs and filters senderless system rows before they reach the command inbox.
- A fresh-database runtime smoke reached `RUNTIME_READY` against the authenticated app-owned Teams surface without sending a message; task060 interaction gates remain separate.
- The live harness is non-sending by design. Real Teams tenant, phone and group evidence remains in task060 and requires a user-run disposable-chat session.
