# task019 — Connect Playwright to the app-owned Teams surface over CDP

- Phase: 1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Production wiring (architecture §9): the Electron host owns the isolated Teams WebContentsView and exposes a loopback-only remote-debugging endpoint; PlaywrightTeamsAdapter attaches via chromium.connectOverCDP to that existing surface instead of launching its own browser, then drives it with the teams selector profile.

## Acceptance (evidence-based)

Integration test: an Electron host loads the teams-v2 fixture in an isolated WebContentsView with a loopback debugging port; the adapter connectOverCDP attaches, reads chatId + messages, sends+reconciles. Skips if electron/browser unavailable.

## Required evidence (stored under evidence/)

- `cdp-integration-test.txt`

## Result

_Fill in when complete: commit hash, what was verified, and how._
