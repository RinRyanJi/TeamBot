import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize } from "../src/router/router.ts";
import type { RouteContext } from "../src/router/router.ts";
import type { Job, Pairing } from "../src/storage/store.ts";
import { parseCommand } from "../src/router/parser.ts";

const at = 1_700_000_000_000;

const groupPairing: Pairing = {
  id: "pg",
  tenant: "t1",
  account: "me@x",
  chatId: "group1",
  kind: "group",
  allowlist: ["alice", "bob"],
  projects: ["TeamBot"],
  baselineMessageId: "m0",
  baselineAt: at,
  createdAt: at,
};

function job(over: Partial<Job>): Job {
  return {
    jobId: "T001",
    chatId: "group1",
    senderId: "alice",
    projectId: "TeamBot",
    cwd: "/p",
    threadId: null,
    activeTurnId: null,
    status: "running",
    createdAt: at,
    lastEventAt: null,
    lastResult: null,
    ...over,
  };
}

function ctx(over: Partial<RouteContext>): RouteContext {
  return {
    pairing: groupPairing,
    senderId: "alice",
    admins: [],
    getJob: () => undefined,
    ...over,
  };
}

function cmd(text: string) {
  const r = parseCommand(text);
  assert.ok(r.ok, `parse failed for ${text}`);
  return r.command;
}

test("unauthorized (non-allowlisted) member cannot start work", () => {
  const d = authorize(cmd("!tb run TeamBot go"), ctx({ senderId: "mallory" }));
  assert.deepEqual(d, { allow: false, reason: "not-allowlisted" });
});

test("allowlisted member can start an authorized project", () => {
  assert.deepEqual(authorize(cmd("!tb run TeamBot go"), ctx({})), { allow: true });
});

test("unregistered project does not start Codex", () => {
  const d = authorize(cmd("!tb run SecretProj go"), ctx({}));
  assert.deepEqual(d, { allow: false, reason: "project-not-authorized" });
});

test("querying a job that belongs to another conversation is refused", () => {
  // A group member tries to read a self-chat job id.
  const selfJob = job({ jobId: "T001", chatId: "selfchat", senderId: "me@x" });
  const d = authorize(
    cmd("!tb status T001"),
    ctx({ getJob: () => selfJob }),
  );
  assert.deepEqual(d, { allow: false, reason: "cross-conversation" });
});

test("same conversation query is allowed for any allowlisted member", () => {
  const d = authorize(
    cmd("!tb status T001"),
    ctx({ senderId: "bob", getJob: () => job({}) }),
  );
  assert.deepEqual(d, { allow: true });
});

test("only initiator or admin may stop/continue/steer", () => {
  const owned = () => job({ senderId: "alice" });
  // bob is allowlisted but not the initiator and not admin:
  assert.deepEqual(
    authorize(cmd("!tb stop T001"), ctx({ senderId: "bob", getJob: owned })),
    { allow: false, reason: "not-initiator" },
  );
  // initiator can:
  assert.deepEqual(
    authorize(cmd("!tb stop T001"), ctx({ senderId: "alice", getJob: owned })),
    { allow: true },
  );
  // admin can, even if not initiator:
  assert.deepEqual(
    authorize(
      cmd("!tb continue T001 more"),
      ctx({ senderId: "bob", admins: ["bob"], getJob: owned }),
    ),
    { allow: true },
  );
});

test("acting on an unknown job is refused", () => {
  const d = authorize(cmd("!tb stop T999"), ctx({ getJob: () => undefined }));
  assert.deepEqual(d, { allow: false, reason: "unknown-job" });
});

test("display-name spoof cannot gain permission (identity is sender id)", () => {
  // Two users share the display name "Alice" but have different ids. The impostor's
  // stable id is not in the allowlist, so authorization fails regardless of name.
  const d = authorize(cmd("!tb run TeamBot go"), ctx({ senderId: "alice-impostor" }));
  assert.deepEqual(d, { allow: false, reason: "not-allowlisted" });
});
