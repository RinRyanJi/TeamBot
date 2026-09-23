import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";
import type { TeamsMessage } from "../src/transports/teams/transport.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const host = join(here, "..", "launcher", "electron", "teams-host.cjs");
const fixtureUrl = pathToFileURL(join(here, "fixtures", "teams-v2-fixture.html")).href;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Event-driven inbox: a MutationObserver in the app-owned page pushes NEW messages to the
// host as they appear (no polling). Verified with a real Electron host over CDP: injecting
// a new [data-mid] node fires a pushed event; a node with an existing id is deduped.
test("MutationObserver pushes new messages over CDP; dedupes existing ids", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }
  const port = String(9700 + (process.pid % 200));
  const cp: ChildProcess = spawn(electronPath, [host, "--port", port, "--url", fixtureUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await new Promise<boolean>((resolve) => {
    let out = "";
    cp.stdout?.on("data", (d) => {
      out += d.toString();
      if (out.includes("TEAMS_HOST_READY")) resolve(true);
      if (out.includes("TEAMS_HOST_ERROR")) resolve(false);
    });
    cp.on("error", () => resolve(false));
    setTimeout(() => resolve(false), 45_000).unref();
  });
  if (!ready) {
    cp.kill();
    t.skip("electron teams-host unavailable");
    return;
  }

  const adapter = new PlaywrightTeamsAdapter({ url: "", profile: "teams" });
  const pushed: TeamsMessage[] = [];
  try {
    await adapter.connectCDP("http://127.0.0.1:" + port);
    await adapter.watchMessages((m) => pushed.push(m));

    // Inject a NEW message node into the fixture DOM.
    const page = (adapter as unknown as { page: import("playwright-core").Page }).page;
    await page.evaluate(`(() => {
      var d = document.createElement('div');
      d.className = 'chat-pane-message';
      d.setAttribute('data-mid', '9000001');
      var a = document.createElement('span'); a.setAttribute('data-acc-id', '8:orgid:pusher'); a.textContent = 'Pusher';
      var b = document.createElement('span'); b.className='body'; b.textContent='!tb hello from observer';
      d.appendChild(a); d.appendChild(b);
      document.getElementById('messages').appendChild(d);
    })()`);
    await sleep(500);

    assert.equal(pushed.length, 1, "one new message pushed");
    assert.equal(pushed[0]?.messageId, "9000001");
    assert.equal(pushed[0]?.senderId, "8:orgid:pusher");
    assert.match(pushed[0]?.text ?? "", /hello from observer/);

    // Re-inject a node carrying an EXISTING baseline id -> must be deduped (not pushed).
    await page.evaluate(`(() => {
      var d = document.createElement('div');
      d.className = 'chat-pane-message';
      d.setAttribute('data-mid', '1700000000001');
      d.textContent = 'dup';
      document.getElementById('messages').appendChild(d);
    })()`);
    await sleep(400);
    assert.equal(pushed.length, 1, "existing id deduped, not pushed again");
  } finally {
    await adapter.close().catch(() => undefined);
    cp.kill();
  }
});
