import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.ts";
import { purgeExpired, DEFAULT_RETENTION } from "../src/storage/retention.ts";

const now = 2_000_000_000_000;
const day = 24 * 60 * 60 * 1000;

function seedJob(s: Store, jobId: string, createdAt: number): void {
  s.createJob({ jobId, chatId: "c1", senderId: "u", projectId: "P", cwd: "/p", status: "completed", createdAt });
  s.appendEvent(jobId, 1, "turn/completed", null, createdAt);
  s.createApproval({
    code: `AC-${jobId}`, jobId, requestId: "r", threadId: null, turnId: null, scope: null,
    userId: "u", chatId: "c1", status: "approved", createdAt, expiresAt: createdAt + 1000, usedAt: createdAt,
  });
  s.enqueueOutbox({ jobId, chatId: "c1", seq: 1, part: 1, body: "x", createdAt });
}

test("deleteJob removes the job and all attached rows", () => {
  const s = new Store();
  seedJob(s, "T1", now);
  assert.equal(s.count("jobs"), 1);
  assert.equal(s.count("events"), 1);
  assert.equal(s.count("approvals"), 1);
  assert.equal(s.count("outbox"), 1);
  s.deleteJob("T1");
  assert.equal(s.count("jobs"), 0);
  assert.equal(s.count("events"), 0);
  assert.equal(s.count("approvals"), 0);
  assert.equal(s.count("outbox"), 0);
  s.close();
});

test("deleteConversation removes all data for a chat", () => {
  const s = new Store();
  s.upsertPairing({ id: "p", tenant: "t", account: "me", chatId: "c1", kind: "self", allowlist: [], projects: [], baselineMessageId: null, baselineAt: now, createdAt: now });
  seedJob(s, "T1", now);
  s.insertInboxIfNew({ tenant: "t", chatId: "c1", messageId: "m1", senderId: "u", text: "hi", receivedAt: now });
  s.deleteConversation("c1");
  assert.equal(s.count("jobs"), 0);
  assert.equal(s.count("events"), 0);
  assert.equal(s.count("approvals"), 0);
  assert.equal(s.count("inbox"), 0);
  assert.equal(s.count("outbox"), 0);
  assert.equal(s.count("pairings"), 0);
  s.close();
});

test("purgeExpired removes rows older than TTL, keeps fresh ones", () => {
  const s = new Store();
  // Old job (> jobs TTL) and fresh job.
  seedJob(s, "OLD", now - DEFAULT_RETENTION.jobsMs - day);
  seedJob(s, "NEW", now - day);
  // Old inbox cache row and a fresh one.
  s.insertInboxIfNew({ tenant: "t", chatId: "c1", messageId: "old", senderId: "u", text: "x", receivedAt: now - DEFAULT_RETENTION.cacheMs - day });
  s.insertInboxIfNew({ tenant: "t", chatId: "c1", messageId: "new", senderId: "u", text: "x", receivedAt: now - day });

  const res = purgeExpired(s, now);
  assert.equal(res.jobs, 1, "one old job purged");
  assert.equal(res.inbox, 1, "one old inbox row purged");
  assert.ok(s.getJob("NEW"), "fresh job kept");
  assert.equal(s.getJob("OLD"), undefined, "old job gone");
  // Old job's children cascaded away; fresh job's remain.
  assert.equal(s.count("events"), 1);
  assert.equal(s.count("inbox"), 1);
  s.close();
});
