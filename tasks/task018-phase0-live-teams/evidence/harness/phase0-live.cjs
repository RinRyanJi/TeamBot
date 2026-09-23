// Phase 0 LIVE harness (architecture §5, implementation-plan Phase 0).
//
// Opens the app-owned, isolated Teams surface and probes for STABLE identifiers
// (chatId, messageId, senderId). Two modes:
//
//   node_modules/.bin/electron phase0-live.cjs            -> real Teams (visible window; you log in)
//   node_modules/.bin/electron phase0-live.cjs --selfcheck -> local fixture (self-verifiable, no login)
//
// In real mode: log in, open the target self-chat and one group, then press the
// probe (window is visible; the harness re-probes every few seconds and writes
// results/phase0-results.json). Record findings in results-template.md and decide go/no-go.
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { app, BaseWindow, WebContentsView } = require("electron");

const SELFCHECK = process.argv.includes("--selfcheck");
const TEAMS_URL = "https://teams.microsoft.com/";
const FIXTURE = pathToFileURL(
  path.join(__dirname, "..", "..", "..", "..", "tests", "fixtures", "teams-fixture.html"),
).href;

// Probe run inside the page: try several strategies to locate stable ids and report
// which one worked. Real Teams DOM differs from the fixture; strategies are ranked.
const PROBE_JS = `(() => {
  const strategies = [];
  // Strategy A: explicit data attributes (our fixture; some Teams builds).
  const chatEl = document.querySelector('[data-chat-id],[data-conversationid],[data-group-id]');
  const chatId = chatEl && (chatEl.getAttribute('data-chat-id') || chatEl.getAttribute('data-conversationid') || chatEl.getAttribute('data-group-id'));
  const msgEls = Array.from(document.querySelectorAll('[data-message-id],[data-mid],.msg'));
  const messages = msgEls.slice(-10).map((el) => ({
    messageId: el.getAttribute('data-message-id') || el.getAttribute('data-mid') || null,
    senderId: el.getAttribute('data-sender-id') || el.getAttribute('data-user-id') || el.getAttribute('data-userid') || null,
    hasText: !!(el.textContent && el.textContent.trim()),
  }));
  strategies.push({ name: 'data-attributes', chatId: chatId || null, messageCount: messages.length });
  return {
    url: location.href,
    title: document.title,
    chatId: chatId || null,
    messages,
    stableChatId: !!chatId,
    stableMessageIds: messages.length > 0 && messages.every((m) => !!m.messageId),
    stableSenderIds: messages.length > 0 && messages.every((m) => !!m.senderId),
    strategies,
  };
})()`;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BaseWindow({ show: !SELFCHECK, width: 1280, height: 900 });
  const view = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: "persist:teambot-teams" },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });

  const url = SELFCHECK ? FIXTURE : TEAMS_URL;
  try {
    await view.webContents.loadURL(url);
  } catch (err) {
    console.log("PHASE0_ERROR " + (err && err.message ? err.message : String(err)));
    app.exit(3);
    return;
  }

  if (SELFCHECK) {
    // loadURL already resolved after the page finished loading; probe directly.
    const probe = await view.webContents.executeJavaScript(PROBE_JS);
    console.log("PHASE0_PROBE " + JSON.stringify(probe));
    app.exit(probe.stableChatId && probe.stableMessageIds && probe.stableSenderIds ? 0 : 2);
    return;
  }

  // Real mode: re-probe periodically so you can log in and open conversations.
  const fs = require("fs");
  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  setInterval(async () => {
    try {
      const probe = await view.webContents.executeJavaScript(PROBE_JS);
      fs.writeFileSync(path.join(outDir, "phase0-results.json"), JSON.stringify(probe, null, 2));
      console.log("PHASE0_PROBE " + JSON.stringify({ url: probe.url, stableChatId: probe.stableChatId, stableMessageIds: probe.stableMessageIds, stableSenderIds: probe.stableSenderIds }));
    } catch (e) {
      /* page navigating */
    }
  }, 5000);
});
