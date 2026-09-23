# task019 — Connect Playwright to the app-owned Teams surface over CDP

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Production wiring (architecture §9): the Electron host owns the isolated Teams WebContentsView and exposes a loopback-only remote-debugging endpoint; PlaywrightTeamsAdapter attaches via chromium.connectOverCDP to that existing surface instead of launching its own browser, then drives it with the teams selector profile.

## Acceptance (evidence-based)

Integration test: an Electron host loads the teams-v2 fixture in an isolated WebContentsView with a loopback debugging port; the adapter connectOverCDP attaches, reads chatId + messages, sends+reconciles. Skips if electron/browser unavailable.

## Required evidence (stored under evidence/)

- `cdp-integration-test.txt`

## Result

Completed — the production connection model (architecture §9) is wired and verified.
- `launcher/electron/teams-host.cjs` — Electron host owns the isolated Teams `WebContentsView`
  (persistent partition, desktop UA) and exposes a **loopback-only** remote-debugging endpoint
  (`--remote-debugging-address 127.0.0.1`, `--remote-debugging-port`).
- `PlaywrightTeamsAdapter.connectCDP(url)` — attaches via `chromium.connectOverCDP` to the
  app-owned surface (never launches its own browser, never touches the system browser),
  finds the page carrying the Teams surface, and drives it with the `teams` profile.
  `close()` in CDP mode only disconnects (does not close the Electron app).

Real verification (`evidence/cdp-integration-test.txt`): a **real Electron host** loaded the
teams-v2 fixture in the isolated WebContentsView with a loopback CDP port; the adapter
`connectOverCDP` attached, read the chatId (`19:testthread@thread.v2`) + both messages
(stable sender ids), and **sent + reconciled** a message over CDP. Ran live, `skipped 0`;
full suite 101/101.

Next: point `teams-host.cjs --url https://teams.microsoft.com/` at the persisted-login
partition (task018) so the adapter drives the real authenticated Teams over CDP end-to-end.

Commit: recorded on push (see git log).
