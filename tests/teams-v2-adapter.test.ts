import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = pathToFileURL(join(here, "fixtures", "teams-v2-fixture.html")).href;

// Exercises the PRODUCTION adapter with the "teams" selector profile (the real Teams v2
// selectors verified live in Phase 0) against a fixture that mimics the real DOM:
// [data-track-thread-id] / [data-mid] / [data-acc-id] / contenteditable compose (Enter to send).
// Skips if no browser can launch.
test("teams profile: read via real selectors, send via contenteditable+Enter, reconcile", async (t) => {
  const adapter = new PlaywrightTeamsAdapter({
    url: fixtureUrl,
    profile: "teams",
    headless: true,
  });
  try {
    await adapter.open();
  } catch (err) {
    await adapter.close().catch(() => undefined);
    t.skip(`no launchable browser: ${(err as Error).message}`);
    return;
  }
  try {
    // chatId comes from [data-track-thread-id].
    assert.equal(adapter.chatId(), "19:testthread@thread.v2");

    const initial = await adapter.readMessages();
    assert.equal(initial.length, 2);
    assert.equal(initial[0]?.messageId, "1700000000001");
    // sender id read from the nested [data-acc-id] (not a display name).
    assert.equal(initial[0]?.senderId, "8:orgid:user-alice");
    assert.match(initial[0]?.text ?? "", /check login/);

    // Send via the contenteditable + Enter path, then reconcile by data-mid.
    const id = await adapter.sendMessage("[TB T001] started");
    assert.match(id, /^\d+$/);
    const after = await adapter.readMessages();
    const sent = after.find((m) => m.messageId === id);
    assert.ok(sent, "sent message reconcilable by data-mid");
    assert.match(sent.text, /\[TB T001\] started/);
    assert.equal(sent.senderId, "8:orgid:me-account");

    // Single-writer ordering holds for the teams profile too.
    const [a, b] = await Promise.all([
      adapter.sendMessage("[TB T001] one"),
      adapter.sendMessage("[TB T001] two"),
    ]);
    const ids = (await adapter.readMessages()).map((m) => m.messageId);
    assert.ok(ids.indexOf(a) < ids.indexOf(b), "first send appears before second");
  } finally {
    await adapter.close();
  }
});
