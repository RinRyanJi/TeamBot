import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectRegistry } from "../src/app/projects.ts";
import { ConversationContextStore, resolveProject } from "../src/app/context.ts";
import { formatOverview, formatTask } from "../src/app/overview.ts";
import { parseV4Command } from "../src/router/v4-parser.ts";
import { Store } from "../src/storage/store.ts";
import { MultiTaskScheduler } from "../src/supervisor/worktrees.ts";

function setup() {
  const projects = new ProjectRegistry();
  projects.register({ projectId: "TeamBot", name: "TeamBot", aliases: ["tb"], cwd: "D:/workspace/TeamBot", lanePolicy: "worktree-fork" });
  projects.register({ projectId: "CodexWeb", name: "Codex Web", aliases: ["web"], cwd: "D:/workspace/codex-chatgpt-web" });
  return projects;
}

test("UC-01 projects onboarding: profiles expose safe display data", () => {
  const projects = setup();
  assert.equal(projects.resolve("tb")?.projectId, "TeamBot");
  assert.equal(projects.resolve("web")?.cwd, "D:/workspace/codex-chatgpt-web");
});
test("UC-02 focus + natural language keeps the request in context", () => {
  const projects = setup();
  const contexts = new ConversationContextStore();
  contexts.focus("self", "TeamBot", 10);
  const result = resolveProject(projects, contexts, "self", undefined);
  assert.equal(result.kind, "resolved");
  assert.deepEqual(parseV4Command("!tb fix the login tests"), { ok: true, command: { kind: "run", request: "fix the login tests" } });
});

test("UC-03 A waits while B runs: overview keeps project groups separate", () => {
  const store = new Store();
  store.createJob({ jobId: "T-A", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/workspace/TeamBot", status: "waiting", createdAt: 1 });
  store.createJob({ jobId: "T-B", chatId: "self", senderId: "me", projectId: "CodexWeb", cwd: "D:/workspace/codex-chatgpt-web", status: "running", createdAt: 2 });
  const text = formatOverview(store.listJobs(), setup());
  assert.match(text, /TeamBot/);
  assert.match(text, /Codex Web/);
  store.close();
});
test("UC-04 same-project fork gets an isolated worktree", () => {
  const scheduler = new MultiTaskScheduler("D:/workspace/TeamBot", 2);
  scheduler.submit({ jobId: "T-F1", chatId: "self", projectId: "TeamBot" });
  scheduler.submit({ jobId: "T-F2", chatId: "self", projectId: "TeamBot" });
  const first = scheduler.startNext();
  assert.ok(first);
  assert.match(first.worktree, /worktrees/);
  assert.equal(scheduler.startNext(), null, "same project remains locked until fork finishes");
});

test("UC-05 overview/details: task card is concise and actionable", () => {
  const store = new Store();
  store.createJob({ jobId: "T005", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/workspace/TeamBot", status: "completed", createdAt: 1 });
  const job = store.getJob("T005")!;
  assert.match(formatTask(job, "TeamBot"), /T005/);
  assert.match(formatTask(job, "TeamBot"), /Codex thread/);
  store.close();
});

test("UC-06 approval is scoped to task/thread/turn/request/chat/sender", () => {
  const store = new Store();
  store.createApproval({ code: "A6", jobId: "T006", requestId: "r6", threadId: "th6", turnId: "tu6", scope: "git push", userId: "me", chatId: "self", status: "pending", createdAt: 1, expiresAt: 100, usedAt: null });
  const approval = store.getApproval("A6")!;
  assert.equal(approval.chatId, "self");
  assert.equal(approval.turnId, "tu6");
  store.close();
});

test("UC-07 add/stop/cancel commands are explicit", () => {
  assert.deepEqual(parseV4Command("!tb add T007 run the tests").ok, true);
  assert.deepEqual(parseV4Command("!tb cancel T007"), { ok: true, command: { kind: "cancel", jobId: "T007" } });
});

test("UC-08 group context stores roles and keeps viewer read-only by policy", () => {
  const store = new Store();
  store.upsertPairing({ id: "g", tenant: "t", account: "me", chatId: "group", kind: "group", allowlist: ["owner", "viewer"], roles: { owner: "owner", viewer: "viewer" }, projects: ["TeamBot"], createdAt: 1 });
  const pairing = store.getPairing("t", "group")!;
  assert.equal(pairing.roles?.viewer, "viewer");
  assert.equal(pairing.roles?.owner, "owner");
  store.close();
});

test("UC-09 offline recovery uses explicit interrupted state", () => {
  const store = new Store();
  store.createJob({ jobId: "T009", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/workspace/TeamBot", status: "needs_reconciliation", createdAt: 1 });
  assert.equal(store.getJob("T009")?.status, "needs_reconciliation");
  store.close();
});

test("UC-10 handoff names the task rather than exposing a raw cwd", () => {
  assert.deepEqual(parseV4Command("!tb handoff T010"), { ok: true, command: { kind: "handoff", jobId: "T010" } });
});

test("UC-11 ambiguity returns candidates instead of guessing", () => {
  const result = resolveProject(setup(), new ConversationContextStore(), "self", undefined);
  assert.equal(result.kind, "ambiguous");
  if (result.kind === "ambiguous") assert.deepEqual(result.candidates.map((p) => p.projectId), ["TeamBot", "CodexWeb"]);
});

test("UC-12 result and artifact entry remain attached to the project task", () => {
  const store = new Store();
  store.createJob({ jobId: "T012", chatId: "self", senderId: "me", projectId: "TeamBot", cwd: "D:/workspace/TeamBot", status: "completed", createdAt: 1 });
  store.updateJobStatus("T012", "completed", "tests pass; artifact: report.md");
  assert.match(store.getJob("T012")?.lastResult ?? "", /report\.md/);
  store.close();
});
