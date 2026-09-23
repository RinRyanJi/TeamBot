// TeamBot desktop console — Electron main (architecture §5/§7).
// - Shows a status window.
// - Closing the window MINIMIZES TO THE TRAY (does not quit); TeamBot keeps taking work.
// - Tray menu "Quit" performs an EXPLICIT quit: stop accepting new work, drain running
//   jobs (bounded), then exit.
//
// Run:   npx electron launcher/electron/console-main.cjs
// Smoke: npx electron launcher/electron/console-main.cjs --smoke   (headless self-check)
"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");

const SMOKE = process.argv.includes("--smoke");
const DRAIN_TIMEOUT_MS = SMOKE ? 3000 : 15000;

let win = null;
let tray = null;
let quitting = false;

// Running-jobs source. In the real app this comes from the supervisor; in smoke we
// start with one job that finishes shortly, to exercise the drain path.
let running = SMOKE ? ["T001"] : [];
function getRunningJobIds() {
  return running.slice();
}

function statusHtml() {
  return (
    "<!doctype html><meta charset='utf-8'><title>TeamBot</title>" +
    "<body><h1>TeamBot 控制台</h1><p id='state'>running</p></body>"
  );
}

async function drainRunning() {
  const start = Date.now();
  while (getRunningJobIds().length > 0 && Date.now() - start < DRAIN_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return { drained: getRunningJobIds().length === 0, waitedMs: Date.now() - start };
}

async function explicitQuit() {
  quitting = true; // allow the window to actually close
  const res = await drainRunning();
  if (!SMOKE) app.quit();
  return res;
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("TeamBot");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show", click: () => win && win.show() },
        { label: "Quit TeamBot", click: () => explicitQuit() },
      ]),
    );
    return true;
  } catch {
    return false;
  }
}

// Never quit just because the window was closed (it only hid to the tray).
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 700,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  await win.loadURL("data:text/html," + encodeURIComponent(statusHtml()));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide(); // minimize to tray
    }
  });
  const trayCreated = createTray();

  if (!SMOKE) return;

  // --- headless self-check of the tray/quit behavior ---
  win.show();
  const visibleBefore = win.isVisible();
  win.close(); // should hide, not destroy
  const hiddenAfterClose = !win.isVisible();
  const aliveAfterClose = !win.isDestroyed();

  // A running job finishes shortly; explicit quit must WAIT for it to drain.
  setTimeout(() => {
    running = [];
  }, 300);
  const drain = await explicitQuit();

  const result = {
    visibleBefore,
    hiddenAfterClose,
    aliveAfterClose,
    trayCreated,
    drained: drain.drained,
    waitedMs: drain.waitedMs,
  };
  // eslint-disable-next-line no-console
  console.log("CONSOLE_MAIN_RESULT " + JSON.stringify(result));
  app.exit(
    hiddenAfterClose && aliveAfterClose && drain.drained && drain.waitedMs >= 250 ? 0 : 2,
  );
});
