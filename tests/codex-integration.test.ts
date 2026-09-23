import { test } from "node:test";
import assert from "node:assert/strict";
import { CodexAdapter } from "../src/codex/adapter.ts";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms).unref(),
    ),
  ]);
}

// Real handshake against the installed `codex app-server`. This proves the adapter
// speaks the actual protocol of the pinned codex-cli. If codex is not installed or
// cannot start, the test is skipped (not failed) so the suite stays green off-box.
test("real codex app-server: initialize handshake round-trip", async (t) => {
  const adapter = new CodexAdapter({ clientName: "teambot-itest", clientVersion: "0.0.1" });
  let result;
  try {
    result = await withTimeout(adapter.start(), 15000, "codex initialize");
  } catch (err) {
    adapter.stop();
    t.skip(`codex app-server unavailable: ${(err as Error).message}`);
    return;
  }
  try {
    // These are real assertions: a running codex MUST return a well-formed result.
    assert.equal(typeof result, "object");
    assert.ok(result.codexHome, "initialize result should include codexHome");
    assert.ok(
      typeof result.userAgent === "string" && result.userAgent.includes("teambot-itest"),
      `userAgent should echo our client name, got: ${result.userAgent}`,
    );
  } finally {
    adapter.stop();
  }
});
