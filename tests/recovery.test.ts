import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { Store } from "../src/storage/store.ts";
import type { Pairing, InboxMessage } from "../src/storage/store.ts";
import type { TeamsMessage, TeamsTransport } from "../src/transports/teams/transport.ts";
import { Inbox } from "../src/router/inbox.ts";
import {
  markProcessLossUnknown,
  reconcileOutbox,
  offlineGapNotice,
} from "../src/supervisor/recovery.ts";

const at = 1_700_000_000_000;

function tempDb(name: string): string {
  const p = join(tmpdir(), `teambot-${name}-${at}.sqlite`);
  rmSync(p, { force: true });
  return p;
}

function pairing(): Pairing {
  return {
    id: "p", tenant: "t1", account: "me@x", chatId: "c1", kind: "self",
    allowlist: ["me@x"], projects: ["P"], baselineMessageId: "m0", baselineAt: at, createdAt: at,
  };
}
function msg(id: string): InboxMessage {
  return { tenant: "t1", chatId: "c1", messageId: id, senderId: "me@x", text: "!tb run P go", receivedAt: at + 100 };
}

class FlakyTransport implements TeamsTransport {
  sent: string[] = [];
  online = true;
  chatId() {
    return "c1";
  }
  async readMessages(): Promise<TeamsMessage[]> {
    return [];
  }
  async sendMessage(text: string): Promise<string> {
    if (!this.online) throw new Error("offline");
    this.sent.push(text);
    return "s" + this.sent.length;
  }
  async close(): Promise<void> {}
}

test("restart does not re-run history (dedup persists across reopen)", () => {
  const db = tempDb("hist");
  try {
    const s1 = new Store(db);
    s1.upsertPairing(pairing());
    const p = s1.getPairing("t1", "c1")!;
    const inbox1 = new Inbox(s1);
    assert.deepEqual(inbox1.intake(msg("m1"), p), { accepted: true });
    s1.markDispatched("t1", "c1", "m1");
    s1.close();

    // Simulate a restart: reopen the same DB; Teams re-renders old history.
    const s2 = new Store(db);
    const p2 = s2.getPairing("t1", "c1")!;
    const inbox2 = new Inbox(s2);
    assert.deepEqual(inbox2.intake(msg("m1"), p2), { accepted: false, reason: "duplicate" });
    s2.close();
  } finally {
    rmSync(db, { force: true });
  }
});

test("in-flight jobs are marked 'unknown' on restart, not re-run", () => {
  const s = new Store();
  s.createJob({ jobId: "T1", chatId: "c1", senderId: "u", projectId: "P", cwd: "/p", status: "running", createdAt: at });
  s.createJob({ jobId: "T2", chatId: "c1", senderId: "u", projectId: "P", cwd: "/p", status: "waiting_approval", createdAt: at });
  s.createJob({ jobId: "T3", chatId: "c1", senderId: "u", projectId: "P", cwd: "/p", status: "completed", createdAt: at });

  const reconciled = markProcessLossUnknown(s);
  assert.deepEqual(reconciled.map((r) => r.jobId).sort(), ["T1", "T2"]);
  assert.equal(s.getJob("T1")?.status, "unknown");
  assert.equal(s.getJob("T2")?.status, "unknown");
  assert.equal(s.getJob("T3")?.status, "completed", "terminal jobs untouched");
  s.close();
});

test("offline result is retained in outbox and reconciled on reconnect", async () => {
  const s = new Store();
  // A completed job produced a reply while Teams was offline.
  s.enqueueOutbox({ jobId: "T1", chatId: "c1", seq: 1, part: 1, body: "[TB T1] done", createdAt: at });
  assert.equal(s.listPendingOutbox("c1").length, 1);

  const transport = new FlakyTransport();
  transport.online = false;
  // Attempt while offline: nothing sent, still pending (uncertain -> unknown).
  const r1 = await reconcileOutbox(s, transport, () => at);
  assert.equal(r1.sent, 0);
  assert.equal(transport.sent.length, 0);

  // Reconnect and reconcile: pending/uncertain flushed successfully.
  transport.online = true;
  // move the 'unknown' row back to pending for retry (verified-safe here: no side effects)
  for (const row of s.listOutboxByStatus("unknown", "c1")) s.setOutboxStatus(row.id, "pending");
  const r2 = await reconcileOutbox(s, transport, () => at + 1);
  assert.equal(r2.sent, 1);
  assert.ok(transport.sent.some((x) => x.includes("[TB T1] done")));
  assert.equal(s.listPendingOutbox("c1").length, 0);
  s.close();
});

test("offline gap notice names the window", () => {
  const note = offlineGapNotice(at, at + 60000);
  assert.match(note, /離線/);
  assert.match(note, /不自動補跑/);
});
