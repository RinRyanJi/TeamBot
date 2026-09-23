// TeamBot Electron Teams host (architecture §9).
// Owns the isolated Teams WebContentsView (persistent partition, supported UA) and
// exposes a LOOPBACK-ONLY remote-debugging endpoint so PlaywrightTeamsAdapter can
// attach over CDP to this app-owned surface (never launching its own browser, never
// connecting to the user's system browser).
//
// Args: --port <n> (default 9333), --url <url> (default real Teams).
"use strict";

const { app, BaseWindow, WebContentsView } = require("electron");

function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PORT = argVal("--port", "9333");
const URL = argVal("--url", "https://teams.microsoft.com/");
const SHOW = process.argv.includes("--show");
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";

// Bind the debugging endpoint to loopback only, before app ready.
app.commandLine.appendSwitch("remote-debugging-port", PORT);
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BaseWindow({ show: SHOW, width: 1280, height: 900 });
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:teambot-teams",
    },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });
  view.webContents.setUserAgent(DESKTOP_UA);
  try {
    await view.webContents.loadURL(URL);
  } catch (err) {
    console.log("TEAMS_HOST_ERROR " + (err && err.message ? err.message : String(err)));
    app.exit(3);
    return;
  }
  // Ready for CDP attach. Stay alive until killed.
  console.log("TEAMS_HOST_READY " + PORT);
});
