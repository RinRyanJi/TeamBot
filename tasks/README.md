# TeamBot task list

Decomposition of [../docs/implementation-plan.md](../docs/implementation-plan.md). Each task is completed with real evidence stored under its `evidence/` folder, then committed/pushed individually.

- **env=local**: fully verifiable on this machine (build/test/real codex-cli).
- **env=live**: requires the user's real Teams tenant/phone; the agent provides the harness, the user runs it (real Teams sends are restricted per AGENTS.md).

| ID | Phase | Env | Task | Status |
|---|---|---|---|---|
| task001 | 1 | local | [Node + TypeScript project scaffold with build/typecheck/test harness](task001-project-scaffold/README.md) | DONE |
| task002 | 0 | local | [Pin & generate Codex app-server protocol schema; verify method/event names](task002-codex-schema-pin/README.md) | DONE |
| task003 | 1 | local | [SQLite storage layer (inbox, outbox, jobs, approvals) with migrations](task003-storage-layer/README.md) | DONE |
| task004 | 1 | local | [Inbox dedup and pairing baseline](task004-inbox-dedup/README.md) | DONE |
| task005 | 1 | local | [!tb command parser and ID naming (T/A/Q)](task005-command-parser/README.md) | DONE |
| task006 | 1 | local | [Router: identity check, allowlist, per-conversation binding, permission table](task006-router-authz/README.md) | DONE |
| task007 | 0/1 | local | [Codex app-server stdio adapter (initialize/thread/turn/steer/interrupt)](task007-codex-adapter/README.md) | DONE |
| task008 | 2 | local | [Supervisor: job state machine, single active turn, queue, project lock](task008-supervisor-statemachine/README.md) | DONE |
| task009 | 2 | local | [Progress coalescing and transactional outbox](task009-progress-outbox/README.md) | DONE |
| task010 | 0/1 | local | [Playwright Teams adapter against a local fixture page](task010-teams-adapter-fixture/README.md) | DONE |
| task011 | 1 | local | [Electron Browser Host (isolated Teams WebContentsView)](task011-electron-browser-host/README.md) | DONE |
| task012 | 1 | local | [Phase 1 end-to-end: help/projects/run/status/result with fixtures](task012-phase1-roundtrip/README.md) | DONE |
| task013 | 2 | local | [Phase 2 interactive control: continue/steer/stop/approve/deny/answer](task013-phase2-interactive/README.md) | DONE |
| task014 | 3 | local | [Phase 3 restart/reconnect/checkpoint recovery](task014-phase3-resilience/README.md) | DONE |
| task015 | 3 | local | [Data retention/deletion and secret hygiene (arch §8)](task015-retention-privacy/README.md) | DONE |
| task016 | 3 | local | [Desktop console: project registration, pairing, status page, tray, explicit quit](task016-desktop-console/README.md) | DONE |
| task017 | 3 | local | [Windows install package, settings docs, redacted diagnostics export](task017-windows-installer/README.md) | DONE |
| task018 | 0 | live | [Phase 0 LIVE: real tenant login, stable IDs, dual-surface, phone push (user-run)](task018-phase0-live-teams/README.md) | LIVE-VERIFIED (stable IDs GO; dual-surface/push pending) — see evidence/phase0-findings.md |
| task019 | 1 | local | [Connect Playwright to the app-owned Teams surface over CDP](task019-cdp-integration/README.md) | DONE |
| task020 | 1 | local | [Default AgentHub workspace for !tb (D:\AgentHub)](task020-agenthub-default-workspace/README.md) | DONE |
| task021 | 2 | local | [Security defaults: switchable read-only posture, path allow-list, always-approve, redaction](task021-security-defaults/README.md) | DONE |
| task022 | 2 | local | [Result reducer: turn fold -> final answer + change list (roadmap B)](task022-result-reducer/README.md) | DONE |
| task023 | 2 | local | [Live status model + coalescer wiring (roadmap C)](task023-status-coalescer-live/README.md) | DONE |
| task024 | 2 | local | [Approval registry: code<->requestId, timeouts, steer (roadmap D)](task024-approval-registry/README.md) | DONE |
| task025 | 3 | local | [Event-driven Teams inbox via MutationObserver (roadmap E)](task025-event-driven-inbox/README.md) | pending |
| task026 | 3 | local | [Continuity & recovery via thread/resume (roadmap F)](task026-resume-recovery/README.md) | DONE |
| task027 | post | local | [Optional multi-task via additional threads + git worktrees (roadmap G)](task027-multitask-worktrees/README.md) | pending |

See [manifest.json](manifest.json) for the machine-readable source and [scaffold.mjs](scaffold.mjs) for the generator.
