# Porting provenance — Electron Browser Host

TeamBot's `launcher/electron/browser-host.cjs` is an **independent implementation**
whose design is informed by the reference project:

- Upstream: `../codex-chatgpt-web` (MIT-licensed)
- Reference file: `launcher/electron/browser-host.cjs`
- Reference HEAD reviewed: `3a68045533517673c6fe90b5d5c017c2799de7fb`

## What was reused (design/approach)
- Owning the browser surface as an app-controlled `WebContentsView`.
- A dedicated **persistent** session partition for login state.
- Locking the remote page down: `nodeIntegration:false`, `contextIsolation:true`,
  `sandbox:true`, and **no preload** exposed to the remote content.

## What is new in TeamBot
- Teams-specific binding (chatId checks), the `persist:teambot-teams` partition name,
  and integration with TeamBot's transport/router. No upstream code was copied verbatim;
  if upstream code is copied later, its MIT copyright/license header will be preserved
  in-file and recorded here.

## License note
Upstream is MIT. This directory documents provenance so any future verbatim copies
retain their original copyright and license text, per AGENTS.md.
