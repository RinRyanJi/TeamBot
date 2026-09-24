import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.ts";

const now = 1_700_000_000_000;

test("schema is applied and versioned", () => {
  const s = new Store();
  assert.equal(s.schemaVersion, 2);
  s.close();
});

test("pairing upsert + read round-trips json fields", () => {
  const s = new Store();
  s.upsertPairing({
    id: "p1",
    tenant: "t1",
    account: "me@x",
    chatId: "c1",
    kind: "group",
    allowlist: ["u1", "u2"],
    projects: ["TeamBot"],
    baselineMessageId: "m0",
    createdAt: now,
  });
  const p = s.getPairing("t1", "c1");
  assert.ok(p);
  assert.deepEqual(p.allowlist, ["u1", "u2"]);
  assert.deepEqual(p.projects, ["TeamBot"]);
  assert.equal(p.kind, "group");
  // upsert updates in place (no duplicate)
  s.upsertPairing({ ...p, allowlist: ["u1"], projects: [], id: "p1" });
  const p2 = s.getPairing("t1", "c1");
  assert.deepEqual(p2?.allowlist, ["u1"]);
  s.close();
});

test("inbox dedup: same (tenant,chat,message) inserts once", () => {
  const s = new Store();
  const msg = {
    tenant: "t1",
    chatId: "c1",
    messageId: "m1",
    senderId: "u1",
    text: "!tb run TeamBot go",
    receivedAt: now,
  };
  assert.equal(s.insertInboxIfNew(msg), true, "first insert is new");
  assert.equal(s.insertInboxIfNew(msg), false, "second insert is duplicate");
  assert.equal(s.isDispatched("t1", "c1", "m1"), false);
  s.markDispatched("t1", "c1", "m1");
  assert.equal(s.isDispatched("t1", "c1", "m1"), true);
  s.close();
});

test("job create/read/update + thread binding", () => {
  const s = new Store();
  s.createJob({
    jobId: "T001",
    chatId: "c1",
    senderId: "u1",
    projectId: "TeamBot",
    cwd: "D:/proj",
    status: "queued",
    createdAt: now,
  });
  let j = s.getJob("T001");
  assert.equal(j?.status, "queued");
  assert.equal(j?.threadId, null);
  s.setJobThread("T001", "thread-abc", "turn-1");
  s.updateJobStatus("T001", "running");
  j = s.getJob("T001");
  assert.equal(j?.threadId, "thread-abc");
  assert.equal(j?.activeTurnId, "turn-1");
  assert.equal(j?.status, "running");
  s.updateJobStatus("T001", "completed", "done: 3 files");
  assert.equal(s.getJob("T001")?.lastResult, "done: 3 files");
  s.close();
});

test("events append updates job.lastEventAt and lists in order", () => {
  const s = new Store();
  s.createJob({
    jobId: "T002",
    chatId: "c1",
    senderId: "u1",
    projectId: "P",
    cwd: "/p",
    status: "running",
    createdAt: now,
  });
  s.appendEvent("T002", 1, "turn/started", { turnId: "x" }, now + 10);
  s.appendEvent("T002", 2, "item/completed", { text: "hi" }, now + 20);
  const events = s.listEvents("T002");
  assert.equal(events.length, 2);
  assert.equal(events[0]?.kind, "turn/started");
  assert.deepEqual(events[1]?.payload, { text: "hi" });
  assert.equal(s.getJob("T002")?.lastEventAt, now + 20);
  s.close();
});

test("approvals lifecycle", () => {
  const s = new Store();
  s.createApproval({
    code: "A7K2",
    jobId: "T001",
    requestId: "req-1",
    threadId: "th",
    turnId: "tu",
    scope: "write /p",
    userId: "u1",
    chatId: "c1",
    status: "pending",
    createdAt: now,
    expiresAt: now + 60000,
    usedAt: null,
  });
  assert.equal(s.getApproval("A7K2")?.status, "pending");
  s.setApprovalStatus("A7K2", "approved", now + 100);
  const a = s.getApproval("A7K2");
  assert.equal(a?.status, "approved");
  assert.equal(a?.usedAt, now + 100);
  s.close();
});

test("outbox enqueue/list/mark", () => {
  const s = new Store();
  const id = s.enqueueOutbox({
    jobId: "T001",
    chatId: "c1",
    seq: 1,
    part: 1,
    body: "[TB T001] started",
    createdAt: now,
  });
  assert.ok(id > 0);
  s.enqueueOutbox({ jobId: "T001", chatId: "c2", seq: 1, part: 1, body: "other", createdAt: now });
  assert.equal(s.listPendingOutbox("c1").length, 1);
  assert.equal(s.listPendingOutbox().length, 2);
  s.setOutboxStatus(id, "sent", now + 5);
  assert.equal(s.listPendingOutbox("c1").length, 0);
  s.close();
});

test("transaction rolls back on throw (atomic multi-write)", () => {
  const s = new Store();
  s.createJob({
    jobId: "T003",
    chatId: "c1",
    senderId: "u1",
    projectId: "P",
    cwd: "/p",
    status: "running",
    createdAt: now,
  });
  assert.throws(() => {
    s.transaction(() => {
      s.appendEvent("T003", 1, "e1", null, now);
      // duplicate seq violates UNIQUE(jobId,seq) -> throws -> whole tx rolls back
      s.appendEvent("T003", 1, "dup", null, now);
    });
  });
  // The outer transaction rolls back BOTH inserts atomically (nested savepoints
  // compose inside the outer BEGIN), so no events remain.
  const events = s.listEvents("T003");
  assert.equal(events.length, 0, `expected 0 events after rollback, got ${events.length}`);
  // Store is still usable after a rolled-back transaction.
  s.appendEvent("T003", 1, "after", null, now);
  assert.equal(s.listEvents("T003").length, 1);
  s.close();
});
