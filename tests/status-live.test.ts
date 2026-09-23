import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnStatus } from "../src/progress/status-model.ts";

test("coalesce: flush only when dirty AND interval elapsed", () => {
  const s = new TurnStatus(15_000);
  assert.equal(s.shouldFlush(0), false, "nothing dirty yet");
  s.setStep("running tests", 1_000);
  assert.equal(s.shouldFlush(1_000), true, "first dirty flush passes (interval since -inf)");
  s.markFlushed(1_000);
  assert.equal(s.shouldFlush(1_000), false, "not dirty after flush");
  s.pushOutput("142/210", 5_000);
  assert.equal(s.shouldFlush(5_000), false, "dirty but within interval");
  assert.equal(s.shouldFlush(16_000), true, "interval elapsed");
});

test("output tail keeps only the last N lines", () => {
  const s = new TurnStatus(15_000, 3);
  for (let i = 1; i <= 6; i++) s.pushOutput("line" + i, i);
  assert.deepEqual(s.snapshot(10).outputTail, ["line4", "line5", "line6"]);
});

test("snapshot reflects step/plan/tokens and idle time", () => {
  const s = new TurnStatus();
  s.setStep("migrate schema", 1_000);
  s.setPlan([{ text: "a", done: true }, { text: "b", done: false }], 2_000);
  s.setTokens(1234, 3_000);
  const snap = s.snapshot(9_000);
  assert.equal(snap.step, "migrate schema");
  assert.equal(snap.plan.length, 2);
  assert.equal(snap.plan[0]?.done, true);
  assert.equal(snap.tokens, 1234);
  assert.equal(snap.idleMs, 6_000);
});

test("heartbeat flags idle after threshold", () => {
  const s = new TurnStatus();
  s.setStep("thinking", 1_000);
  assert.equal(s.isIdle(3_000, 5_000), false);
  assert.equal(s.isIdle(6_500, 5_000), true);
});

test("snapshot is a copy (pull path can't mutate internal state)", () => {
  const s = new TurnStatus();
  s.setPlan([{ text: "x", done: false }], 1_000);
  const snap = s.snapshot(2_000);
  snap.plan[0]!.done = true;
  snap.outputTail.push("injected");
  assert.equal(s.snapshot(2_000).plan[0]?.done, false);
  assert.equal(s.snapshot(2_000).outputTail.length, 0);
});
