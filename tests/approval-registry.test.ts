import { test } from "node:test";
import assert from "node:assert/strict";
import { ApprovalRegistry, kindFromMethod } from "../src/router/approval-registry.ts";

test("kindFromMethod maps server request methods", () => {
  assert.equal(kindFromMethod("item/commandExecution/requestApproval"), "command");
  assert.equal(kindFromMethod("item/fileChange/requestApproval"), "file");
  assert.equal(kindFromMethod("item/permissions/requestApproval"), "permissions");
  assert.equal(kindFromMethod("item/tool/requestUserInput"), "input");
  assert.equal(kindFromMethod("something/else"), "unknown");
});

test("register gives distinct codes; resolve returns the bound requestId", () => {
  const reg = new ApprovalRegistry();
  const a = reg.register(101, "item/commandExecution/requestApproval", 0);
  const b = reg.register(102, "item/fileChange/requestApproval", 0);
  assert.notEqual(a.code, b.code);
  assert.equal(a.kind, "command");
  assert.equal(b.kind, "file");
  const r = reg.resolveApproval(a.code, true, 10);
  assert.deepEqual(r, { ok: true, requestId: 101, kind: "command", accept: true });
});

test("second resolve is 'used'; unknown code rejected", () => {
  const reg = new ApprovalRegistry();
  const { code } = reg.register(1, "item/commandExecution/requestApproval", 0);
  assert.equal(reg.resolveApproval(code, false, 1).ok, true);
  assert.deepEqual(reg.resolveApproval(code, true, 2), { ok: false, reason: "used" });
  assert.deepEqual(reg.resolveApproval("ZZ", true, 2), { ok: false, reason: "unknown" });
});

test("expiry: resolve after TTL is rejected; sweepExpired reports once", () => {
  const reg = new ApprovalRegistry(1000);
  const { code } = reg.register(7, "item/commandExecution/requestApproval", 0);
  assert.deepEqual(reg.resolveApproval(code, true, 1001), { ok: false, reason: "expired" });
  // already expired -> not returned again by sweep
  const swept = reg.sweepExpired(2000);
  assert.equal(swept.find((e) => e.requestId === 7), undefined);
});

test("sweepExpired returns overdue pendings for auto-decline (never auto-approve)", () => {
  const reg = new ApprovalRegistry(1000);
  reg.register(11, "item/fileChange/requestApproval", 0);
  const swept = reg.sweepExpired(2000);
  assert.equal(swept.length, 1);
  assert.equal(swept[0]?.requestId, 11);
  // and it's no longer pending
  assert.equal(reg.pending(2000).length, 0);
});

test("answerInput only works for input kind", () => {
  const reg = new ApprovalRegistry();
  const q = reg.register(21, "item/tool/requestUserInput", 0);
  const cmd = reg.register(22, "item/commandExecution/requestApproval", 0);
  assert.deepEqual(reg.answerInput(q.code, "plan B", 1), { ok: true, requestId: 21, text: "plan B" });
  assert.deepEqual(reg.answerInput(cmd.code, "x", 1), { ok: false, reason: "not-input" });
});

test("multiple pending tracked distinctly", () => {
  const reg = new ApprovalRegistry();
  reg.register(1, "item/commandExecution/requestApproval", 0);
  reg.register(2, "item/fileChange/requestApproval", 0);
  assert.equal(reg.pending(0).length, 2);
});
