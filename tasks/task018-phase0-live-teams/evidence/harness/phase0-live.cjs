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
const DIAG = process.argv.includes("--diag");
const SENDTEST = process.argv.includes("--sendtest");
const WATCH = process.argv.includes("--watch");
const TEAMS_URL = "https://teams.microsoft.com/";
// Teams web refuses unrecognized browsers ("classic Teams no longer available"). Present
// a supported desktop Edge/Chrome User-Agent so the real web app loads and lets us log in.
// (Phase-0 finding: the embedded surface must set a supported UA.)
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
// Not-authenticated signals: an auth host, or a Teams error/landing path that appears
// when there is no valid session.
const NOT_AUTHED = /login\.(microsoftonline|live)\.com|login\.microsoft\.com|\/error\b|\/eoa\b|\/go\b/i;
const FIXTURE = pathToFileURL(
  path.join(__dirname, "..", "..", "..", "..", "tests", "fixtures", "teams-fixture.html"),
).href;

// Probe run inside the page: try several strategies to locate stable ids and report
// which one worked. Real Teams DOM differs from the fixture; strategies are ranked.
const PROBE_JS = `(() => {
  // Strategy A — local fixture (keeps --selfcheck working).
  const fchat = document.querySelector('[data-chat-id]');
  if (fchat) {
    const msgEls = Array.from(document.querySelectorAll('.msg,[data-message-id]'));
    const messages = msgEls.slice(-10).map((el) => ({
      messageId: el.getAttribute('data-message-id') || el.getAttribute('data-mid') || null,
      senderId: el.getAttribute('data-sender-id') || null,
      hasText: !!(el.textContent && el.textContent.trim()),
    }));
    const chatId = fchat.getAttribute('data-chat-id');
    return { url: location.href, title: document.title, strategy: 'fixture', chatId,
      messages, stableChatId: !!chatId,
      stableMessageIds: messages.length > 0 && messages.every((m) => !!m.messageId),
      stableSenderIds: messages.length > 0 && messages.every((m) => !!m.senderId) };
  }
  // Strategy B — real Teams v2 web (discovered via --diag):
  //   chat/thread id -> [data-track-thread-id]; message id -> [data-mid]; author -> [data-acc-id].
  const threadEl = document.querySelector('[data-track-thread-id]');
  const chatId = threadEl ? threadEl.getAttribute('data-track-thread-id') : null;
  const msgEls = Array.from(document.querySelectorAll('[data-mid]'));
  const messages = msgEls.slice(-10).map((el) => {
    const accEl = el.matches('[data-acc-id]') ? el : (el.querySelector('[data-acc-id]') || el.closest('[data-acc-id]'));
    return {
      messageId: el.getAttribute('data-mid'),
      senderId: accEl ? accEl.getAttribute('data-acc-id') : null,
      hasText: !!(el.textContent && el.textContent.trim()),
    };
  });
  return {
    url: location.href,
    title: document.title,
    strategy: 'teams-v2',
    chatId,
    messages,
    stableChatId: !!chatId,
    stableMessageIds: messages.length > 0 && messages.every((m) => !!m.messageId),
    stableSenderIds: messages.length > 0 && messages.every((m) => !!m.senderId),
  };
})()`;

// Diagnostic probe: discover which attributes/roles carry stable ids in the REAL
// Teams DOM (our fixture selectors won't match). Reports attribute-name frequency for
// id-like names with sample values, plus any conversation id in the URL.
const DIAG_JS = `(() => {
  const attrNames = {};
  const all = document.querySelectorAll('*');
  for (const el of all) {
    for (const a of el.attributes) attrNames[a.name] = (attrNames[a.name] || 0) + 1;
  }
  const distinctTid = Array.from(new Set(
    Array.from(document.querySelectorAll('[data-tid]')).map((e) => e.getAttribute('data-tid'))
  ));
  // Chat-list item candidates: data-tid values that look like conversation ids.
  const convLike = distinctTid.filter((t) => /^(1[89]:|48:|unq\.|chat)/i.test(t || ''));
  // Message/text candidates: elements with a lot of text under likely roles.
  const roleCounts = {
    'role=listitem': document.querySelectorAll('[role=listitem]').length,
    'role=row': document.querySelectorAll('[role=row]').length,
    'role=treeitem': document.querySelectorAll('[role=treeitem]').length,
    'data-mid': document.querySelectorAll('[data-mid]').length,
    'aria-label present': document.querySelectorAll('[aria-label]').length,
  };
  // Sample aria-labels of list/tree items (often contain sender + preview).
  const itemAria = Array.from(document.querySelectorAll('[role=listitem],[role=treeitem],[role=row]'))
    .slice(0, 8).map((e) => (e.getAttribute('aria-label') || '').slice(0, 90));
  return {
    url: location.href,
    title: document.title,
    attrNamesCount: Object.keys(attrNames).length,
    idishAttrNames: Object.keys(attrNames).filter((n) => /id|tid|mid|conversation|thread|mri|oid|upn|author|sender/i.test(n)),
    distinctTidCount: distinctTid.length,
    distinctTidSample: distinctTid.slice(0, 60),
    convLike,
    roleCounts,
    itemAria,
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Current messages in the open conversation (real Teams v2 selectors).
const MSG_JS = `(() => {
  const els = Array.from(document.querySelectorAll('[data-mid]'));
  return els.map((el) => {
    const a = el.querySelector('[data-acc-id]') || el.closest('[data-acc-id]');
    return { messageId: el.getAttribute('data-mid'), senderId: a ? a.getAttribute('data-acc-id') : null, text: (el.textContent || '').trim().slice(0, 160) };
  });
})()`;

// Reports the currently-open conversation so you can confirm the target before sending.
const OPEN_JS = `(() => {
  const t = document.querySelector('[data-track-thread-id]');
  const box = document.querySelector('[contenteditable="true"][role="textbox"]') || document.querySelector('div[contenteditable="true"]');
  return { threadId: t ? t.getAttribute('data-track-thread-id') : null, title: document.title, hasCompose: !!box };
})()`;

// Sends a clearly-marked test message into the CURRENTLY-OPEN conversation, then
// reconciles it by finding the [data-mid] whose text contains the marker.
async function doSendTest(wc, outDir, fs) {
  const marker = "[TB TEST] Phase0 send-path check - please ignore (" + Date.now() + ")";
  const focused = await wc.executeJavaScript(
    `(() => { const b = document.querySelector('[contenteditable="true"][role="textbox"]') || document.querySelector('div[contenteditable="true"]'); if (!b) return false; b.focus(); return true; })()`,
  );
  if (!focused) {
    console.log("SENDTEST_RESULT " + JSON.stringify({ ok: false, reason: "no-compose-box" }));
    app.exit(2);
    return;
  }
  wc.insertText(marker);
  await sleep(600);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Return" });
  wc.sendInputEvent({ type: "char", keyCode: "\r" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Return" });
  await sleep(4000);
  const rec = await wc.executeJavaScript(
    `(() => {
      const els = Array.from(document.querySelectorAll('[data-mid]'));
      const hit = els.find((e) => (e.textContent || '').includes(${JSON.stringify(marker)}));
      const t = document.querySelector('[data-track-thread-id]');
      let senderId = null;
      if (hit) { const a = hit.querySelector('[data-acc-id]') || hit.closest('[data-acc-id]'); senderId = a ? a.getAttribute('data-acc-id') : null; }
      return { found: !!hit, messageId: hit ? hit.getAttribute('data-mid') : null, senderId, threadId: t ? t.getAttribute('data-track-thread-id') : null };
    })()`,
  );
  fs.writeFileSync(
    path.join(outDir, "sendtest-result.json"),
    JSON.stringify({ marker, ...rec }, null, 2),
  );
  console.log(
    "SENDTEST_RESULT " +
      JSON.stringify({ ok: rec.found, reconciled: rec.found, hasMessageId: !!rec.messageId, hasSenderId: !!rec.senderId, hasThreadId: !!rec.threadId }),
  );
  app.exit(rec.found ? 0 : 2);
}

// Teams' new web app renders its content in child iframes; run JS in every frame.
async function runInAllFrames(wc, js) {
  const out = [];
  let frames = [];
  try {
    frames = wc.mainFrame.framesInSubtree;
  } catch {
    frames = [wc.mainFrame];
  }
  for (const f of frames) {
    try {
      const result = await f.executeJavaScript(js, true);
      out.push({ frameUrl: f.url, result });
    } catch (e) {
      out.push({ frameUrl: f && f.url, error: (e && e.message) || String(e) });
    }
  }
  return out;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const visible = !SELFCHECK && !PROBE && !WATCH; // headless for selfcheck/probe/watch
  const win = new BaseWindow({ show: visible, width: 1280, height: 900 });
  const view = new WebContentsView({
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: "persist:teambot-teams" },
  });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });

  // Real Teams needs a supported-browser UA; the local fixture does not care.
  if (!SELFCHECK) {
    view.webContents.setUserAgent(DESKTOP_UA);
    view.webContents.session.setUserAgent(DESKTOP_UA);
  }

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

  if (WATCH) {
    // Headless (hidden) watch: proves TeamBot RECEIVES messages you send, and that a
    // hidden surface still gets background updates (architecture §5). Baseline the current
    // messages, then report any new one that appears.
    await sleep(12000); // settle + restore last-open conversation
    const first = await view.webContents.executeJavaScript(MSG_JS);
    const seen = new Set(first.map((m) => m.messageId));
    console.log("WATCH ready — baseline " + seen.size + " messages. Send a message now; watching for ~3 min. Title: " + JSON.stringify(await view.webContents.executeJavaScript("document.title")));
    const deadline = Date.now() + 180000;
    const timer = setInterval(async () => {
      try {
        const msgs = await view.webContents.executeJavaScript(MSG_JS);
        for (const m of msgs) {
          if (m.messageId && !seen.has(m.messageId)) {
            seen.add(m.messageId);
            console.log("NEW_MESSAGE " + JSON.stringify({ text: m.text, hasMessageId: !!m.messageId, hasSenderId: !!m.senderId }));
          }
        }
        if (Date.now() > deadline) {
          clearInterval(timer);
          console.log("WATCH done");
          app.exit(0);
        }
      } catch (e) {
        /* navigating */
      }
    }, 2500);
    return;
  }

  if (SENDTEST) {
    // Visible: YOU navigate to the conversation you want to test. The harness reports
    // the currently-open chat every 3s, and only sends when a trigger file appears
    // (results/SEND_NOW), so the target is whatever YOU have open at that moment.
    const fs = require("fs");
    const outDir = path.join(__dirname, "results");
    fs.mkdirSync(outDir, { recursive: true });
    const triggerFile = path.join(outDir, "SEND_NOW");
    try { fs.rmSync(triggerFile, { force: true }); } catch (e) {}
    console.log("SENDTEST ready — open the target conversation. Waiting for trigger file: " + triggerFile);
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      try {
        const info = await view.webContents.executeJavaScript(OPEN_JS);
        console.log(
          "OPEN_CHAT " +
            JSON.stringify({ title: info.title, threadIdPrefix: info.threadId ? info.threadId.slice(0, 14) + "…" : "none", hasCompose: info.hasCompose }),
        );
        if (fs.existsSync(triggerFile)) {
          busy = true;
          clearInterval(timer);
          fs.rmSync(triggerFile, { force: true });
          await doSendTest(view.webContents, outDir, fs);
        }
      } catch (e) {
        /* navigating */
      }
    }, 3000);
    return;
  }

  if (PROBE) {
    // Headless probe against the persisted (already-authenticated) session.
    await sleep(15000); // let the Teams SPA + child iframes settle
    const finalUrl = view.webContents.getURL();
    if (NOT_AUTHED.test(finalUrl)) {
      console.log("PHASE0_PROBE " + JSON.stringify({ authenticated: false, url: finalUrl }));
      app.exit(4); // not logged in: run --login first
      return;
    }
    if (DIAG) {
      const frames = await runInAllFrames(view.webContents, DIAG_JS);
      // Keep frames that actually carry content signals.
      const interesting = frames.filter((f) => f.result && f.result.distinctTidCount > 0);
      console.log("PHASE0_DIAG " + JSON.stringify({ frameCount: frames.length, frames: interesting.length ? interesting : frames }));
      app.exit(0);
      return;
    }
    const frameResults = await runInAllFrames(view.webContents, PROBE_JS);
    // Pick the frame that found the most messages (fixture or teams-v2).
    let best = null;
    for (const f of frameResults) {
      if (f.result && (!best || f.result.messages.length > best.messages.length)) best = f.result;
    }
    const probe = best || { messages: [], stableChatId: false, stableMessageIds: false, stableSenderIds: false };
    const fs = require("fs");
    const outDir = path.join(__dirname, "results");
    fs.mkdirSync(outDir, { recursive: true });
    const record = { authenticated: true, ...probe, messageCount: probe.messages.length };
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
