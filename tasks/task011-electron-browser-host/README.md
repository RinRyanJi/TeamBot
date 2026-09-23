# task011 — Electron Browser Host (isolated Teams WebContentsView)

- Phase: 1
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Port the isolated WebContentsView + persistent partition + login popup + view ownership design from ../codex-chatgpt-web (preserve MIT notices). No preload/Node integration for the remote page. Loopback-only control endpoint.

## Acceptance (evidence-based)

Launcher builds; a smoke test starts the shell, loads the fixture/login URL in the isolated view, and confirms no Node integration is exposed to the page.

## Required evidence (stored under evidence/)

- `launcher-build.txt`
- `browser-host-smoke.txt`
- `PORTING.md`

## Result

Completed.
- `src/browser/browser-host-config.ts` — pure, testable security config: `remoteWebPreferences` (nodeIntegration:false, contextIsolation:true, sandbox:true, no preload, persistent partition), `assertRemoteIsIsolated` guard, `isLoopbackHost` (control endpoint loopback-only), `partitionForChat`.
- `launcher/electron/browser-host.cjs` — Electron main that attaches an isolated `WebContentsView` with those locked prefs (design ported from ../codex-chatgpt-web; see `evidence/PORTING.md`, MIT provenance recorded).
- `scripts/browser-host-smoke.cjs` — launches the host, loads the Teams fixture, probes the guest.

Real verification:
- `launcher-build.txt` — 4/4 config unit tests (locked prefs, unsafe-config rejection, persistent partitions, loopback-only host).
- `browser-host-smoke.txt` — **REAL Electron v44.4.5** launched the Browser Host and the
  isolated WebContentsView reported `typeof require/module/process === "undefined"` in the
  remote page (no Node integration) with the correct chatId; smoke exit 0; the wrapped
  test ran live (`skipped 0`).
- `PORTING.md` — provenance + MIT note.

Full suite (incl. this real Electron launch) green.

Commit: recorded on push (see git log).
