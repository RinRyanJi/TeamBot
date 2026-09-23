# task017 — Windows install package, settings docs, redacted diagnostics export

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Produce a Windows installer/package, settings documentation, and a redacted diagnostics export.

## Acceptance (evidence-based)

Packaging script runs and produces an artifact; diagnostics export verified free of secrets.

## Required evidence (stored under evidence/)

- `package.txt`
- `diagnostics-redaction.txt`

## Result

Completed (portable package + docs + redacted diagnostics; signed NSIS installer is the future step).
- `scripts/package-win.mjs` (`npm run package:win`) — builds TypeScript then produces a real Windows ZIP artifact under `release/` via PowerShell `Compress-Archive`.
- `src/app/diagnostics.ts` — `exportDiagnostics`/`writeDiagnostics` produce a redacted JSON (no token/cookie/env).
- `docs/settings.md` — settings + install documentation.

Real verification:
- `package.txt` — packaging ran and produced `release/TeamBot-0.0.1-win.zip` (41,957 bytes); artifact listing shows the compiled `dist/**` + launcher + manifest.
- `diagnostics-redaction.txt` — 2/2: exported diagnostics omit secrets/env; the on-disk file contains no api key / env and shows `"apiKey": "[redacted]"`.

Note: a signed NSIS installer via electron-builder needs a signing cert + CI; the portable
ZIP is a real distributable artifact and the interface is documented in docs/settings.md.

Commit: recorded on push (see git log).
