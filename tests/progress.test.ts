import { test } from "node:test";
import assert from "node:assert/strict";
import { ProgressCoalescer, segmentMessage, isImportant } from "../src/progress/progress.ts";
import { Store } from "../src/storage/store.ts";
import { Outbox } from "../src/progress/outbox.ts";

test("important events always emit and reset the routine timer", () => {
  const c = new ProgressCoalescer(30_000);
  assert.equal(c.shouldEmit({ kind: "started", at: 0 }), true);
  assert.equal(isImportant("started"), true);
  assert.equal(c.shouldEmit({ kind: "waiting_approval", at: 100 }), true);
  assert.equal(c.shouldEmit({ kind: "completed", at: 200 }), true);
});

test("routine progress is coalesced to once per interval", () => {
  const c = new ProgressCoalescer(30_000);
  assert.equal(c.shouldEmit({ kind: "progress", at: 0 }), true); // first routine
  assert.equal(c.shouldEmit({ kind: "progress", at: 5_000 }), false);
  assert.equal(c.shouldEmit({ kind: "progress", at: 29_999 }), false);
  assert.equal(c.shouldEmit({ kind: "progress", at: 30_000 }), true); // interval elapsed
  assert.equal(c.shouldEmit({ kind: "progress", at: 40_000 }), false);
});

test("an important event resets the window for subsequent routine events", () => {
  const c = new ProgressCoalescer(30_000);
  assert.equal(c.shouldEmit({ kind: "progress", at: 0 }), true);
  assert.equal(c.shouldEmit({ kind: "waiting_input", at: 10_000 }), true); // important
  // routine right after important is within the (reset) window
  assert.equal(c.shouldEmit({ kind: "progress", at: 15_000 }), false);
  assert.equal(c.shouldEmit({ kind: "progress", at: 40_001 }), true);
});

test("short message is a single part", () => {
  const segs = segmentMessage("T001", 3, "done");
  assert.equal(segs.length, 1);
  assert.equal(segs[0]?.total, 1);
  assert.match(segs[0]!.body, /^\[TB T001\] done$/);
});

test("long message is segmented with part/total and size cap", () => {
  const body = "x".repeat(5000);
  const segs = segmentMessage("T001", 7, body, 1800);
  assert.ok(segs.length >= 3, `expected multiple parts, got ${segs.length}`);
  segs.forEach((s, i) => {
    assert.equal(s.part, i + 1);
    assert.equal(s.total, segs.length);
    assert.equal(s.seq, 7);
    assert.ok(s.body.length <= 1800, `part ${i + 1} too long: ${s.body.length}`);
    assert.match(s.body, /^\[TB T001\] \(\d+\/\d+\) /);
  });
  // reassembled payload equals original
  const rejoined = segs.map((s) => s.body.replace(/^\[TB T001\] \(\d+\/\d+\) /, "")).join("");
  assert.equal(rejoined, body);
});

test("outbox enqueues segments atomically and tracks send state", () => {
  const store = new Store();
  const outbox = new Outbox(store);
  const ids = outbox.enqueueMessage("T001", "c1", 1, "y".repeat(4000), 1000, 1800);
  assert.ok(ids.length >= 2);
  assert.equal(outbox.pending("c1").length, ids.length);

  // Confirmed send removes it from pending.
  outbox.markSent(ids[0]!, 1100);
  assert.equal(outbox.pending("c1").length, ids.length - 1);

  // Uncertain send is retained as 'unknown' (not pending, not lost).
  outbox.markUnknown(ids[1]!);
  assert.equal(outbox.pending("c1").length, ids.length - 2);
  assert.equal(outbox.unknown("c1").length, 1);
  store.close();
});
