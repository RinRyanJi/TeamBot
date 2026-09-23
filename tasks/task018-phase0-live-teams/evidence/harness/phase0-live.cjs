// Phase 0 LIVE harness (architecture §5, implementation-plan Phase 0).
//
// Opens the app-owned, ISOLATED Teams surface (persistent partition, NOT the system
// browser) and probes for STABLE identifiers (chatId, messageId, senderId). Modes:
//
//   electron phase0-live.cjs --selfcheck  -> local fixture (self-verifiable, no login)
//   electron phase0-live.cjs --login      -> real Teams, VISIBLE. YOU log in once (MFA/
//                                            conditional access). Session persists to the
//                                            partition. Close the window when done.
//   electron phase0-live.cjs --probe      -> real Teams, HEADLESS, reuses the persisted
//                                            login; probes the real DOM and writes results.
//                                            Exit 0 = authenticated+probed, 4 = not logged in.
//   electron phase0-live.cjs              -> real Teams, VISIBLE, re-probes every 5s.
//
// The persistent partition means: log in ONCE with --login, then --probe can run
// unattended (e.g. by the agent) against the authenticated real Teams DOM. This is the
// intended design (isolated app surface + one-time in-app login), not cookie copying.
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { app, BaseWindow, WebContentsView } = require("electron");

const SELFCHECK = process.argv.includes("--selfcheck");
const LOGIN = process.argv.includes("--login");
const PROBE = process.argv.includes("--probe");
const TEAMS_URL = "https://teams.microsoft.com/";
// Not-authenticated signals: an auth host, or a Teams error/landing path that appears
// when there is no valid session.
const NOT_AUTHED = /login\.(microsoftonline|live)\.com|login\.microsoft\.com|\/error\b|\/eoa\b|\/go\b/i;
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const visible = !SELFCHECK && !PROBE; // headless for selfcheck and probe
  const win = new BaseWindow({ show: visible, width: 1280, height: 900 });
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

  if (LOGIN) {
    // Interactive one-time login. Leave the window open; the persistent partition
    // saves the session. Log in, open your test self-chat + a group, then close.
    console.log("PHASE0_LOGIN ready — log in, open your test conversations, then close the window.");
    return;
  }

  if (PROBE) {
    // Headless probe against the persisted (already-authenticated) session.
    await sleep(9000); // let the Teams SPA settle
    const finalUrl = view.webContents.getURL();
    if (NOT_AUTHED.test(finalUrl)) {
      console.log("PHASE0_PROBE " + JSON.stringify({ authenticated: false, url: finalUrl }));
      app.exit(4); // not logged in: run --login first
      return;
    }
    const probe = await view.webContents.executeJavaScript(PROBE_JS);
    const fs = require("fs");
    const outDir = path.join(__dirname, "results");
    fs.mkdirSync(outDir, { recursive: true });
    const record = { authenticated: true, ...probe };
    fs.writeFileSync(path.join(outDir, "phase0-results.json"), JSON.stringify(record, null, 2));
    console.log("PHASE0_PROBE " + JSON.stringify(record));
    app.exit(0); // authenticated + probed; stable* flags are the Phase-0 finding
    return;
  }

  // Default real mode: visible, re-probe periodically so you can open conversations.
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
