import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const host = join(here, "..", "launcher", "electron", "teams-host.cjs");
const fixtureUrl = pathToFileURL(join(here, "fixtures", "teams-v2-fixture.html")).href;

// Production wiring: the Electron host owns the isolated WebContentsView (loading the
// teams-v2 fixture) and exposes a loopback debugging port; the adapter attaches over CDP
// and drives THAT app-owned surface. Skips if electron/browser can't run.
test("adapter attaches to the Electron-owned Teams surface over CDP and read/send works", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }
  const port = String(9300 + (process.pid % 400));

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
    t.skip("electron teams-host could not start / expose CDP");
    return;
  }

  const adapter = new PlaywrightTeamsAdapter({ url: "", profile: "teams" });
  try {
    await adapter.connectCDP("http://127.0.0.1:" + port);
    assert.equal(adapter.chatId(), "19:testthread@thread.v2");

    const initial = await adapter.readMessages();
    assert.equal(initial.length, 2);
    assert.equal(initial[0]?.senderId, "8:orgid:user-alice");

    const id = await adapter.sendMessage("[TB CDP] hello over cdp");
    assert.match(id, /^\d+$/);
    const after = await adapter.readMessages();
    const sent = after.find((m) => m.messageId === id);
    assert.ok(sent, "sent message reconcilable over CDP");
    assert.match(sent.text, /\[TB CDP\] hello over cdp/);
  } finally {
    await adapter.close().catch(() => undefined); // disconnect only
    cp.kill();
  }
});
