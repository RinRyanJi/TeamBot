// Electron smoke: launch the Browser Host, load the local Teams fixture in the
// isolated WebContentsView, and PROVE the remote page has no Node integration.
// Prints "SMOKE_RESULT <json>" and exits 0 on success, 2 on a security failure.
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { app, BaseWindow } = require("electron");
const { createTeamsView } = require(path.join(__dirname, "..", "launcher", "electron", "browser-host.cjs"));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const win = new BaseWindow({ show: false, width: 1200, height: 800 });
    const fixture = pathToFileURL(
      path.join(__dirname, "..", "tests", "fixtures", "teams-fixture.html"),
    ).href;
    const view = createTeamsView(win, fixture);
    const wc = view.webContents;
    await new Promise((resolve) => wc.once("did-finish-load", resolve));

    const probe = await wc.executeJavaScript(
      '[typeof require, typeof module, typeof process, document.querySelector("#chat").getAttribute("data-chat-id")]',
    );
    const result = {
      requireType: probe[0],
      moduleType: probe[1],
      processType: probe[2],
      chatId: probe[3],
    };
    const isolated =
      probe[0] === "undefined" && probe[1] === "undefined" && probe[2] === "undefined";
    // eslint-disable-next-line no-console
    console.log("SMOKE_RESULT " + JSON.stringify({ ...result, isolated }));
    app.exit(isolated && result.chatId === "fixture-chat-1" ? 0 : 2);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log("SMOKE_ERROR " + (err && err.message ? err.message : String(err)));
    app.exit(3);
  }
});
