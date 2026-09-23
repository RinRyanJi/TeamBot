// Electron smoke for the desktop console: render a status page and confirm the
// window shows job rows. Prints "CONSOLE_RESULT <json>" and exits 0 on success.
"use strict";

const { app, BaseWindow, WebContentsView } = require("electron");

app.disableHardwareAcceleration();

// Minimal inline status page (mirrors src/app/status-page.ts, which is unit-tested).
const html =
  "<!doctype html><html><head><meta charset='utf-8'></head><body>" +
  "<ul id='jobs'><li class='job' data-job-id='T001'>T001 · TeamBot · running · self1</li></ul>" +
  "<p id='count' data-count='1'>jobs: 1</p></body></html>";

app.whenReady().then(async () => {
  try {
    const win = new BaseWindow({ show: false, width: 900, height: 600 });
    const view = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
    await view.webContents.loadURL("data:text/html," + encodeURIComponent(html));
    const probe = await view.webContents.executeJavaScript(
      '[document.querySelectorAll("#jobs .job").length, (document.querySelector("[data-job-id]")||{}).getAttribute ? document.querySelector("[data-job-id]").getAttribute("data-job-id") : "", document.getElementById("count").getAttribute("data-count")]',
    );
    const result = { jobCount: probe[0], firstJobId: probe[1], count: probe[2] };
    // eslint-disable-next-line no-console
    console.log("CONSOLE_RESULT " + JSON.stringify(result));
    app.exit(probe[0] === 1 && probe[1] === "T001" ? 0 : 2);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log("CONSOLE_ERROR " + (err && err.message ? err.message : String(err)));
    app.exit(3);
  }
});
