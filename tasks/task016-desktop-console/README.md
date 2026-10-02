# task016 — Desktop console: project registration, pairing, status page, tray, explicit quit

- Phase: 3
- Env: local (fully verifiable here)
- Status: DONE

## Spec

Desktop UI to register project aliases (normalized paths), pair conversations, member allowlist, per-job initiator, status page, tray minimize, explicit quit coordinating running jobs.

## Acceptance (evidence-based)

UI build passes; component/logic tests for project registration path normalization and pairing baseline; manual-run instructions documented.

## Required evidence (stored under evidence/)

- `console-build.txt`
- `console-logic-test.txt`

## Result

Completed — project registration UI + persisted profile file + status page + **GUI tray/quit main implemented and Electron-verified**.

### GUI tray/quit main (added)
- `src/app/quit-coordinator.ts` — `QuitCoordinator`: `stopAccepting()` + `drain(timeoutMs)` that waits for running jobs before quit.
- `launcher/electron/console-main.cjs` — real Electron main: status window; **closing the window minimizes to the tray** (hidden, not destroyed, app stays alive); Tray menu **Quit** performs an explicit quit that drains running jobs then exits. `--smoke` self-check mode.
- Evidence `tray-quit.txt`: REAL Electron ran the main — `hiddenAfterClose:true, aliveAfterClose:true, trayCreated:true, drained:true, waitedMs:371` (quit WAITED for the running job), exit 0; plus quit-coordinator units (accepting flip, drain-waits, drain-timeout). 4/4, skipped 0.

- `src/app/desktop-logic.ts` — `normalizeProjectPath` (absolute-only, normalized), `registerProject`, `createBaseline` (latest visible message → history not executed).
- `src/app/status-page.ts` — `renderStatusHtml(jobs)` renders one escaped row per job + count.
- `launcher/electron/console-main.cjs` + `console-preload.cjs` — local project registration/edit/remove form, collision and absolute-path validation, atomic user-data persistence, and a restricted IPC bridge used only by the local console.
- `src/app/project-config.ts` — shared config-file parser/normalizer used by the v4 runtime; `TEAMBOT_PROJECTS_JSON` remains available for disposable test runs.
- `scripts/console-smoke.cjs` — Electron console window rendering the status page.

Real verification:
- `console-logic-test.txt` — 4 logic units (path must be absolute; normalized cwd stored; baseline = latest message / now-if-empty; status page renders rows + HTML-escapes) + the electron test = 5/5.
- `console-build.txt` — **REAL Electron** launched the console window, loaded the status page, and read back `jobCount=1, firstJobId=T001` from the DOM; exit 0.
- `console-registration.txt` — project config parser tests (normalization, collision/absolute-path rejection, atomic save/load) plus Electron smoke assertion that the registration form is present; all passed.

## Manual run (interactive tray/quit)
Tray minimize, explicit-quit coordination, and live pairing UI are GUI-interactive and
run on a desktop session:
1. `npm install` (installs electron).
2. Render check (headless-capable): `npx electron scripts/console-smoke.cjs` → prints `CONSOLE_RESULT ... exit 0`.
3. Full console app (window visible): launch an Electron main that calls `renderStatusHtml`
   with live `Store` jobs, adds a `Tray` with a "Quit" item that drains running jobs before
   `app.quit()`, and minimizes to tray on window close. Verify: register a project (absolute
   path enforced), pair a conversation (baseline set), see job rows update, minimize→tray,
   explicit quit stops accepting new work.

Commit: recorded on push (see git log).
