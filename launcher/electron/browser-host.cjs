// TeamBot Electron Browser Host.
//
// Ported design (independent implementation) inspired by
//   ../codex-chatgpt-web/launcher/electron/browser-host.cjs
// which is MIT-licensed. See tasks/task011-electron-browser-host/evidence/PORTING.md
// for provenance. The remote Teams surface runs in an isolated WebContentsView with
// NO Node integration and NO preload, in a dedicated persistent partition
// (architecture §2/§9). TeamBot-specific logic (Teams binding, chatId checks) is new.
"use strict";

const { WebContentsView } = require("electron");

const TEAMS_PARTITION = "persist:teambot-teams";

/** Locked-down webPreferences for the remote Teams page. Mirrors src/browser/browser-host-config.ts. */
function remoteWebPreferences(partition) {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    partition: partition || TEAMS_PARTITION,
    // Intentionally NO preload: the remote page gets no bridge.
  };
}

/**
 * Create an isolated Teams WebContentsView attached to a BaseWindow/BrowserWindow.
 * The app owns this view; Playwright/CDP only ever attaches to app-owned surfaces.
 */
function createTeamsView(win, url, opts) {
  const options = opts || {};
  const view = new WebContentsView({
    webPreferences: remoteWebPreferences(options.partition),
  });
  win.contentView.addChildView(view);
  const bounds = options.bounds || { x: 0, y: 0, width: 1200, height: 800 };
  view.setBounds(bounds);
  if (url) {
    view.webContents.loadURL(url);
  }
  return view;
}

module.exports = { createTeamsView, remoteWebPreferences, TEAMS_PARTITION };
