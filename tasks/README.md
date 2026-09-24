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
| task025 | 3 | local | [Event-driven Teams inbox via MutationObserver (roadmap E)](task025-event-driven-inbox/README.md) | DONE |
| task026 | 3 | local | [Continuity & recovery via thread/resume (roadmap F)](task026-resume-recovery/README.md) | DONE |
| task027 | post | local | [Optional multi-task via additional threads + git worktrees (roadmap G)](task027-multitask-worktrees/README.md) | DONE |
| task028 | G0 | live | [R0a: CDP editMessage feasibility spike](task028-r0a-editmessage-spike/README.md) | pending |
| task029 | G0 | live | [R0b: notification economics + GO/PIVOT decision](task029-r0b-notification-economics/README.md) | pending |
| task030 | G1 | local | [Governance: §4 reconciliation + traceability table](task030-governance-traceability/README.md) | pending |
| task031 | G1 | local | [R9: append-only audit schema](task031-r9-audit-schema/README.md) | DONE |
| task032 | G1 | local | [R7a: path wall attribution + sandbox bypass tests](task032-r7a-path-wall-attribution/README.md) | pending |
| task033 | G1 | local | [R7b: blacklist reframed as escalate-to-ask + adversarial tests](task033-r7b-blacklist-reframe/README.md) | pending |
| task034 | G1 | local | [R7c: read/write asymmetry + read-only reference allow-list (Q5)](task034-r7c-read-write-asymmetry/README.md) | pending |
| task035 | G1 | local | [R7d: per-project whitelist store + decision-order tests](task035-r7d-whitelist-store/README.md) | pending |
| task036 | G1 | local | [R7e: list commands (ok 永遠 / !tb 名單 / remove / TTL)](task036-r7e-list-commands/README.md) | pending |
| task037 | G1 | local | [R8a: emergency stop wiring (stop / kill)](task037-r8a-emergency-stop/README.md) | pending |
| task038 | G1 | local | [R8b: steer wiring + add-vs-new disambiguation](task038-r8b-steer-disambiguation/README.md) | pending |
| task039 | G1 | local | [R8c: queue visibility + cancel](task039-r8c-queue-cancel/README.md) | pending |
| task040 | G1 | local | [Disconnect recovery hardening](task040-disconnect-recovery-hardening/README.md) | pending |
| task041 | G2 | live | [H1: transport.editMessage() + CDP in-place edit](task041-h1-editmessage/README.md) | pending |
| task042 | G2 | local | [H2: in-place status card + Codex-event-driven heartbeat (3-state)](task042-h2-status-card-heartbeat/README.md) | pending |
| task043 | G2 | local | [H3: push budget (debounce/chunk/retry_after)](task043-h3-push-budget/README.md) | pending |
| task044 | G3 | local | [R1: bare ok bound to versioned pending queue](task044-r1-bare-ok-versioned/README.md) | pending |
| task045 | G3 | local | [R2: self-chat prefix + reversed escape](task045-r2-prefix-escape/README.md) | pending |
| task046 | G3 | local | [R5: !tb 交接 (handoff)](task046-r5-handoff/README.md) | pending |
| task047 | G3 | local | [R6: !tb login/logout + no-turn-when-unauthed](task047-r6-codex-login/README.md) | pending |
| task048 | G3 | live | [R3: voice STT spike + echo-confirm](task048-r3-voice-stt-spike/README.md) | pending |
| task049 | G3 | local | [R4: attachments in/out + artifact auto-return](task049-r4-attachments/README.md) | pending |
| task050 | G3 | local | [§9 metrics instrumentation + benchmark tasks](task050-metrics-instrumentation/README.md) | pending |
| task051 | G4 | live | [P2: group scenario](task051-p2-groups/README.md) | pending |
| task052 | G4 | local | [P2: I multi-session (use latest / sessions / new)](task052-p2-multisession/README.md) | pending |
| task053 | G4 | local | [P2: K history import](task053-p2-history-import/README.md) | pending |
| task054 | G4 | local | [P2: N ACL roles + audit_log](task054-p2-acl-roles/README.md) | pending |
| task055 | G4 | local | [P2: O config-driven settings](task055-p2-config-driven/README.md) | pending |

See [manifest.json](manifest.json) for the machine-readable source and [scaffold.mjs](scaffold.mjs) for the generator.
