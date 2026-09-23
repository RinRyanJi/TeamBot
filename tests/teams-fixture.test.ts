import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PlaywrightTeamsAdapter } from "../src/transports/teams/playwright-adapter.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = pathToFileURL(join(here, "fixtures", "teams-fixture.html")).href;

// Drives a real browser (installed Chrome via playwright-core) against a local Teams
// DOM fixture. Skips (not fails) if no browser can launch, so the suite stays green
// off-box; a launch success but behavior mismatch is a real failure.
test("playwright teams adapter: read ids, send, reconcile, single-writer", async (t) => {
  const adapter = new PlaywrightTeamsAdapter({ url: fixtureUrl, headless: true });
  try {
    await adapter.open();
  } catch (err) {
    await adapter.close().catch(() => undefined);
    t.skip(`no launchable browser: ${(err as Error).message}`);
    return;
  }
  try {
    assert.equal(adapter.chatId(), "fixture-chat-1");

    const initial = await adapter.readMessages();
    assert.equal(initial.length, 2);
    assert.deepEqual(initial[0], {
      chatId: "fixture-chat-1",
      messageId: "m1",
      senderId: "u-alice",
      text: "!tb run TeamBot check login",
    });
    // stable sender ids are extractable (not display names)
    assert.equal(initial[1]?.senderId, "u-bob");

    // Send + reconcile.
    const id = await adapter.sendMessage("[TB T001] started");
    assert.match(id, /^s\d+$/);
    const after = await adapter.readMessages();
    const sent = after.find((m) => m.messageId === id);
    assert.ok(sent, "sent message should be reconcilable by id");
    assert.equal(sent.text, "[TB T001] started");
    assert.equal(sent.senderId, "me@fixture");

    // Single-writer ordering: concurrent sends land in call order.
    const [a, b] = await Promise.all([
      adapter.sendMessage("[TB T001] one"),
      adapter.sendMessage("[TB T001] two"),
    ]);
    const finalMsgs = await adapter.readMessages();
    const ids = finalMsgs.map((m) => m.messageId);
    assert.ok(ids.indexOf(a) < ids.indexOf(b), "first send must appear before second");
  } finally {
    await adapter.close();
  }
});
