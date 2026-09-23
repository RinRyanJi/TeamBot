import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  assertTransition,
  isTerminal,
  type JobStatus,
} from "../src/supervisor/states.ts";
import { JobQueue } from "../src/supervisor/queue.ts";

test("legal transitions are accepted", () => {
  const legal: Array<[JobStatus, JobStatus]> = [
    ["queued", "starting"],
    ["starting", "running"],
    ["running", "waiting_approval"],
    ["waiting_approval", "running"],
    ["running", "stopping"],
    ["stopping", "cancelled"],
    ["stopping", "completed"], // stop races a real completion
    ["running", "completed"],
    ["running", "interrupted"],
    ["interrupted", "running"],
    ["unknown", "failed"],
  ];
  for (const [a, b] of legal) {
    assert.ok(canTransition(a, b), `expected ${a} -> ${b} legal`);
    assertTransition(a, b);
  }
});

test("illegal transitions are rejected", () => {
  const illegal: Array<[JobStatus, JobStatus]> = [
    ["completed", "running"],
    ["cancelled", "running"],
    ["failed", "completed"],
    ["queued", "running"], // must go through starting
    ["running", "queued"],
  ];
  for (const [a, b] of illegal) {
    assert.equal(canTransition(a, b), false, `expected ${a} -> ${b} illegal`);
    assert.throws(() => assertTransition(a, b), /illegal job transition/);
  }
});

test("terminal states have no outgoing transitions", () => {
  for (const s of ["completed", "failed", "cancelled"] as JobStatus[]) {
    assert.ok(isTerminal(s));
  }
  assert.equal(isTerminal("running"), false);
});

test("MVP single-job: self-chat and group queue in order, results route to source", () => {
  const q = new JobQueue(1);
  assert.equal(q.enqueue({ jobId: "T001", chatId: "self", projectId: "P" }), 1);
  assert.equal(q.enqueue({ jobId: "T002", chatId: "group", projectId: "P" }), 2);

  const first = q.activateNext();
  assert.equal(first?.jobId, "T001");
  assert.equal(first?.chatId, "self");
  // second cannot start yet (global single-job)
  assert.equal(q.activateNext(), null);
  assert.equal(q.positionOf("T002"), 1);

  q.complete("T001");
  const second = q.activateNext();
  assert.equal(second?.jobId, "T002");
  assert.equal(second?.chatId, "group", "result must route to the originating chat");
});

test("project lock: same project never runs concurrently even above cap", () => {
  const q = new JobQueue(2); // allow 2 concurrent
  q.enqueue({ jobId: "A", chatId: "c1", projectId: "P" });
  q.enqueue({ jobId: "B", chatId: "c2", projectId: "P" }); // same project
  q.enqueue({ jobId: "C", chatId: "c3", projectId: "Q" }); // different project

  const first = q.activateNext();
  assert.equal(first?.jobId, "A");
  // B shares project P (locked) -> skipped; C (project Q) activates instead
  const second = q.activateNext();
  assert.equal(second?.jobId, "C");
  // nothing else can start: cap=2 reached
  assert.equal(q.activateNext(), null);

  q.complete("A"); // releases project P
  const third = q.activateNext();
  assert.equal(third?.jobId, "B");
});

test("waiting job can be removed (cancel before run)", () => {
  const q = new JobQueue(1);
  q.enqueue({ jobId: "T1", chatId: "c", projectId: "P" });
  q.enqueue({ jobId: "T2", chatId: "c", projectId: "P" });
  assert.equal(q.removeWaiting("T2"), true);
  assert.equal(q.waitingCount, 1);
  assert.equal(q.removeWaiting("nope"), false);
});
