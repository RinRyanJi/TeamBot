# Phase 0 LIVE results (fill in from your run)

Date: ____   Tenant: ____   Codex CLI: 0.156.1

## Capability matrix

| Capability | Verified? | Notes |
|---|---|---|
| Tenant login succeeds (MFA / conditional access) | ☐ yes ☐ no | |
| Stable chatId obtainable (not display name) | ☐ yes ☐ no | |
| Stable messageId obtainable | ☐ yes ☐ no | |
| Stable senderId obtainable | ☐ yes ☐ no | |
| Self-chat + one group bound simultaneously | ☐ yes ☐ no | |
| Hidden/background surface still receives new messages | ☐ yes ☐ no | |
| Reply targeting reliable (right conversation) | ☐ yes ☐ no | |
| Same-account phone push received | ☐ yes ☐ no | (push not guaranteed) |
| ToS / automation risk acceptable (§10) | ☐ yes ☐ no | |

## Decision (go / no-go)

- [ ] **GO** — proceed with browser-automation transport.
- [ ] **NO-GO → fallback A**: self-chat only.
- [ ] **NO-GO → fallback B**: official Teams transport (Graph API / Bot Framework).
- [ ] **NO-GO → fallback C**: stop.

Rationale: ____
