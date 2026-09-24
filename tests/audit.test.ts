import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.ts";

test("appendAudit writes a row and listAudit returns it (newest first)", () => {
  const s = new Store(":memory:");
  s.appendAudit({ at: 1, decision: "deny", rule: "path-wall", command: "cat /etc/passwd" });
  s.appendAudit({ at: 2, decision: "allow", rule: "whitelist", command: "npm test" });
  const rows = s.listAudit();
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.decision, "allow"); // newest first
  assert.equal(rows[1]?.decision, "deny");
  assert.equal(s.auditCount(), 2);
  s.close();
});

test("audit is append-only: UPDATE and DELETE are rejected at the DB level", () => {
  const s = new Store(":memory:");
  const id = s.appendAudit({ at: 1, decision: "deny", rule: "blacklist:destructive", command: "rm -rf /" });
  // Reach into the raw db through a fresh Store on the same schema is not possible;
  // instead assert the triggers fire by attempting raw SQL via a second connection.
  // The Store API intentionally exposes no update/delete for audit, so we prove the
  // trigger by executing raw SQL through a helper.
  const raw = (s as unknown as { db: { prepare(sql: string): { run(...a: unknown[]): unknown } } }).db;
  assert.throws(
    () => raw.prepare("UPDATE audit SET decision='allow' WHERE id=?").run(id),
    /append-only/,
  );
  assert.throws(
    () => raw.prepare("DELETE FROM audit WHERE id=?").run(id),
    /append-only/,
  );
  // The row is unchanged.
  assert.equal(s.listAudit()[0]?.decision, "deny");
  s.close();
});

test("appendAudit redacts token-shaped secrets in the command field", () => {
  const s = new Store(":memory:");
  s.appendAudit({
    at: 1,
    decision: "deny",
    rule: "blacklist:secret",
    command: "echo github_pat_1234567890abcdefghijALMNOP > out.txt",
  });
  const row = s.listAudit()[0];
  assert.ok(row, "audit row exists");
  assert.ok(!row.command.includes("github_pat_"), "token must be redacted");
  assert.ok(row.command.includes("[redacted]"));
  s.close();
});

test("decision CHECK constraint rejects unknown decisions", () => {
  const s = new Store(":memory:");
  const raw = (s as unknown as { db: { prepare(sql: string): { run(...a: unknown[]): unknown } } }).db;
  assert.throws(() =>
    raw
      .prepare("INSERT INTO audit (at,decision,rule,command) VALUES (?,?,?,?)")
      .run(1, "bogus", "x", "y"),
  );
  s.close();
});
