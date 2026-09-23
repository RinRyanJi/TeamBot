# Phase 0 LIVE harness — run against your real Teams tenant

This harness is **user-run**: it needs your real Microsoft Teams login and a phone.
The agent cannot self-verify tenant login, stable IDs on the real Teams DOM, or phone
push (AGENTS.md forbids sending real Teams messages as incidental verification).

## Self-check (no login — verifies the harness itself works)
From the repo root:

```
npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs --selfcheck
```
Expect `PHASE0_PROBE {..."stableChatId":true,"stableMessageIds":true,"stableSenderIds":true...}`
and exit 0 (it probes the local fixture). This proves the extraction logic runs in the
isolated Electron surface.

## Live run (your tenant)
```
npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs
```
1. A window opens to `https://teams.microsoft.com/`. Log in (MFA / conditional access as required).
2. Open the target **self-chat**, then a **group** you control for testing.
3. The harness re-probes every 5s and writes `results/phase0-results.json`, logging
   `stableChatId / stableMessageIds / stableSenderIds`.
4. From your **phone**, send a test message in the test conversation; confirm whether it
   appears in the harness surface (background update) and whether you get a phone push.
5. Fill in `../results-template.md` and decide **go / no-go** per the plan's Phase 0 fallbacks.

## What to record
- Whether stable chat/message/sender IDs are obtainable (not just display names).
- Whether the hidden/background surface still receives new messages.
- Whether reply targeting is reliable; same-account phone push behavior.
- Tenant login / conditional-access outcome and any ToS/automation concerns (architecture §10).
