# task011 — Electron Browser Host (isolated Teams WebContentsView)

- Phase: 1
- Env: local (fully verifiable here)
- Status: pending

## Spec

Port the isolated WebContentsView + persistent partition + login popup + view ownership design from ../codex-chatgpt-web (preserve MIT notices). No preload/Node integration for the remote page. Loopback-only control endpoint.

## Acceptance (evidence-based)

Launcher builds; a smoke test starts the shell, loads the fixture/login URL in the isolated view, and confirms no Node integration is exposed to the page.

## Required evidence (stored under evidence/)

- `launcher-build.txt`
- `browser-host-smoke.txt`
- `PORTING.md`

## Result

_Fill in when complete: commit hash, what was verified, and how._
