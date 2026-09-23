import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.ts";
import { ApprovalManager } from "../src/router/approvals.ts";
import { approvalTarget, isDangerousScope } from "../src/router/approval-routing.ts";
import type { Pairing } from "../src/storage/store.ts";

const at = 1_700_000_000_000;

function setup() {
  const store = new Store();
  store.createJob({
    jobId: "T001",
    chatId: "group1",
    senderId: "alice",
    projectId: "P",
    cwd: "/p",
    status: "running",
    createdAt: at,
  });
  let n = 0;
  const mgr = new ApprovalManager(store, { ttlMs: 60_000, genCode: () => `A${++n}` });
  const code = mgr.create({
    jobId: "T001",
    requestId: "req-1",
    threadId: "th",
    turnId: "tu",
    scope: "write /p/file",
    userId: "alice",
    chatId: "group1",
    now: at,
  });
  const getJob = (id: string) => store.getJob(id);
  return { store, mgr, code, getJob };
}

test("unknown code is rejected", () => {
  const { mgr, getJob } = setup();
  assert.deepEqual(mgr.resolve("ZZZ", "approve", { senderId: "alice", chatId: "group1", now: at, getJob }), {
    ok: false,
    reason: "unknown",
  });
});

test("wrong conversation is rejected and does not affect the turn", () => {
  const { store, mgr, code, getJob } = setup();
  const r = mgr.resolve(code, "approve", { senderId: "alice", chatId: "other", now: at, getJob });
  assert.deepEqual(r, { ok: false, reason: "wrong-conversation" });
  assert.equal(store.getApproval(code)?.status, "pending", "approval untouched");
  assert.equal(store.getJob("T001")?.status, "running", "turn unaffected");
});

test("non-initiator non-admin is rejected", () => {
  const { mgr, code, getJob } = setup();
  assert.deepEqual(
    mgr.resolve(code, "approve", { senderId: "bob", chatId: "group1", now: at, getJob }),
    { ok: false, reason: "not-authorized" },
  );
});

test("admin may resolve even if not initiator", () => {
  const { mgr, code, getJob } = setup();
  const r = mgr.resolve(code, "approve", { senderId: "bob", chatId: "group1", now: at, admins: ["bob"], getJob });
  assert.equal(r.ok, true);
});

test("initiator approves; second attempt is rejected as used (one-time)", () => {
  const { store, mgr, code, getJob } = setup();
  const first = mgr.resolve(code, "approve", { senderId: "alice", chatId: "group1", now: at, getJob });
  assert.equal(first.ok, true);
  assert.equal(store.getApproval(code)?.status, "approved");
  const second = mgr.resolve(code, "approve", { senderId: "alice", chatId: "group1", now: at, getJob });
  assert.deepEqual(second, { ok: false, reason: "used" });
});

test("expired approval is rejected and marked expired", () => {
  const { store, mgr, code, getJob } = setup();
  const r = mgr.resolve(code, "approve", { senderId: "alice", chatId: "group1", now: at + 60_001, getJob });
  assert.deepEqual(r, { ok: false, reason: "expired" });
  assert.equal(store.getApproval(code)?.status, "expired");
  // and a later attempt is 'used' (not re-expirable), turn still fine
  assert.deepEqual(
    mgr.resolve(code, "approve", { senderId: "alice", chatId: "group1", now: at + 60_002, getJob }),
    { ok: false, reason: "used" },
  );
  assert.equal(store.getJob("T001")?.status, "running");
});

test("dangerous scope in a group routes approval to self-chat; safe stays in place", () => {
  const group: Pairing = {
    id: "pg", tenant: "t", account: "me@x", chatId: "group1", kind: "group",
    allowlist: ["alice"], projects: ["P"], baselineMessageId: null, baselineAt: at, createdAt: at,
  };
  assert.equal(isDangerousScope("write /etc/hosts"), true);
  assert.equal(isDangerousScope("read file"), false);
  assert.deepEqual(approvalTarget("delete build dir", group, "self-me"), {
    chatId: "self-me",
    isolated: true,
  });
  assert.deepEqual(approvalTarget("read a file", group, "self-me"), {
    chatId: "group1",
    isolated: false,
  });
});
