import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { Store } from "../src/storage/store.ts";
import {
  saveResidentThread,
  loadResidentThread,
  planResume,
  markInFlightInterrupted,
  bootRecovery,
} from "../src/supervisor/session.ts";

const at = 1_800_000_000_000;
function tempDb(name: string): string {
  const p = join(tmpdir(), `teambot-${name}-${at}.sqlite`);
  rmSync(p, { force: true });
  return p;
}
function job(s: Store, jobId: string, status: string): void {
  s.createJob({ jobId, chatId: "c1", senderId: "u", projectId: "AgentHub", cwd: "/p", status, createdAt: at });
}

test("resident threadId persists across restart -> planResume=resume", () => {
  const db = tempDb("resume");
  try {
    const s1 = new Store(db);
    saveResidentThread(s1, "th-persist-1", at);
    s1.close();
    const s2 = new Store(db); // restart
    assert.equal(loadResidentThread(s2), "th-persist-1");
    assert.deepEqual(planResume(s2), { mode: "resume", threadId: "th-persist-1" });
    s2.close();
  } finally {
    rmSync(db, { force: true });
  }
});

test("fresh store -> planResume=start", () => {
  const s = new Store();
  assert.deepEqual(planResume(s), { mode: "start", threadId: null });
  s.close();
});

test("markInFlightInterrupted marks in-flight jobs interrupted (terminal untouched)", () => {
  const s = new Store();
  job(s, "T1", "running");
  job(s, "T2", "waiting_approval");
  job(s, "T3", "completed");
  const marked = markInFlightInterrupted(s).sort();
  assert.deepEqual(marked, ["T1", "T2"]);
  assert.equal(s.getJob("T1")?.status, "interrupted");
  assert.equal(s.getJob("T3")?.status, "completed");
  s.close();
});

test("bootRecovery aggregates resume plan, interrupted jobs, pending outbox + approvals", () => {
  const db = tempDb("boot");
  try {
    const s1 = new Store(db);
    saveResidentThread(s1, "th-boot", at);
    job(s1, "T1", "running");
    s1.enqueueOutbox({ jobId: "T1", chatId: "c1", seq: 1, part: 1, body: "pending reply", createdAt: at });
    s1.createApproval({
      code: "A1", jobId: "T1", requestId: "r1", threadId: "th-boot", turnId: "tu", scope: "write",
      userId: "u", chatId: "c1", status: "pending", createdAt: at, expiresAt: at + 60000, usedAt: null,
    });
    s1.close();

    const s2 = new Store(db); // restart
    const rec = bootRecovery(s2);
    assert.deepEqual(rec.resume, { mode: "resume", threadId: "th-boot" });
    assert.deepEqual(rec.interruptedJobs, ["T1"]);
    assert.equal(rec.pendingOutbox.length, 1);
    assert.equal(rec.pendingApprovals.length, 1);
    assert.equal(rec.pendingApprovals[0]?.code, "A1");
    // in-flight job was NOT re-run, only marked
    assert.equal(s2.getJob("T1")?.status, "interrupted");
    s2.close();
  } finally {
    rmSync(db, { force: true });
  }
});
