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

## Recommended flow: log in once, then let the agent probe

Because the surface uses a **persistent** partition (`persist:teambot-teams`), you only
log in once; afterwards a headless `--probe` can run unattended against the authenticated
real Teams DOM. NOTE: logging into Teams in your normal Chrome/Edge does NOT help — the
harness is isolated and does not share system-browser cookies (by design, §5/§9). You must
log in **inside the harness window**.

### Step 1 — one-time interactive login (you)
```
npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs --login
```
A window opens to `https://teams.microsoft.com/`. Complete login (MFA / conditional access),
open the target **self-chat** and a **group** you control, then close the window. The
session is now saved in the partition.

### Step 2 — probe the authenticated DOM (you OR the agent)
```
npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs --probe
```
- Exit 4 + `authenticated:false` → not logged in; run Step 1 first.
- Exit 0 → writes `results/phase0-results.json` with `stableChatId / stableMessageIds /
  stableSenderIds` findings for the REAL Teams DOM. These are the Phase-0 data points.

### Step 3 — phone push (you, needs a phone)
From your **phone**, send a test message in the test conversation; note whether the harness
surface updates in the background and whether you get a phone push. Record in
`../results-template.md` and decide **go / no-go**.

### Verified now (no login): the flow works end-to-end
- `--selfcheck` extracts stable ids from the local fixture (exit 0).
- `--probe` without a session reaches real Teams and correctly reports
  `authenticated:false` at `teams.microsoft.com/error/eoa` (exit 4) — i.e. it knows when
  to ask you to log in. After Step 1, the same command probes the real authenticated DOM.

### Legacy: visible auto-re-probe
```
npx electron tasks/task018-phase0-live-teams/evidence/harness/phase0-live.cjs
```
Opens visible and re-probes every 5s (combines login + probe in one window).

## What to record
- Whether stable chat/message/sender IDs are obtainable (not just display names).
- Whether the hidden/background surface still receives new messages.
- Whether reply targeting is reliable; same-account phone push behavior.
- Tenant login / conditional-access outcome and any ToS/automation concerns (architecture §10).
