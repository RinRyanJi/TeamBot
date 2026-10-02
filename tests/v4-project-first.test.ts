import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectRegistry } from "../src/app/projects.ts";
import { ConversationContextStore, resolveProject } from "../src/app/context.ts";
import { formatOverview } from "../src/app/overview.ts";
import { parseV4Command } from "../src/router/v4-parser.ts";
import { Store } from "../src/storage/store.ts";

function registry(): ProjectRegistry {
  const projects = new ProjectRegistry();
  projects.register({ projectId: "Alpha", name: "Web", aliases: ["frontend"], cwd: "D:/work/alpha" });
  projects.register({ projectId: "Beta", name: "API", cwd: "D:/work/beta" });
  return projects;
}

test("v4 parser supports project-first controls and natural language", () => {
  assert.deepEqual(parseV4Command("!tb overview"), { ok: true, command: { kind: "overview" } });
  assert.deepEqual(parseV4Command("!tb focus frontend"), { ok: true, command: { kind: "focus", projectId: "frontend" } });
  assert.deepEqual(parseV4Command("!tb run Alpha fix login", ["Alpha"]), { ok: true, command: { kind: "run", projectId: "Alpha", request: "fix login" } });
  assert.deepEqual(parseV4Command("!tb run -- fix login"), { ok: true, command: { kind: "run", request: "fix login" } });
  assert.deepEqual(parseV4Command("!tb inspect the failing login"), { ok: true, command: { kind: "run", request: "inspect the failing login" } });
  assert.deepEqual(parseV4Command("!tb task T004"), { ok: true, command: { kind: "task", jobId: "T004" } });
  assert.deepEqual(parseV4Command("!tb fork T004 add tests"), { ok: true, command: { kind: "fork", jobId: "T004", request: "add tests" } });
});
test("project resolution asks instead of guessing when several projects exist", () => {
  const projects = registry();
  const contexts = new ConversationContextStore();
  assert.equal(resolveProject(projects, contexts, "chat", undefined).kind, "ambiguous");
  const focused = contexts.focus("chat", "Alpha", 10);
  assert.equal(focused.activeProjectId, "Alpha");
  const result = resolveProject(projects, contexts, "chat", undefined);
  assert.equal(result.kind, "resolved");
  if (result.kind === "resolved") assert.equal(result.project.projectId, "Alpha");
  assert.equal(resolveProject(projects, contexts, "chat", "frontend").kind, "resolved");
});

test("focused project expires and requires an explicit selection again", () => {
  const contexts = new ConversationContextStore(100);
  contexts.focus("chat", "Alpha", 10);
  assert.equal(contexts.get("chat", 50).activeProjectId, "Alpha");
  assert.equal(contexts.get("chat", 111).activeProjectId, null);
});

test("overview groups jobs by project and limits noise", () => {
  const store = new Store();
  store.createJob({ jobId: "T001", chatId: "self", senderId: "me", projectId: "Alpha", cwd: "D:/work/alpha", status: "running", createdAt: 1 });
  store.createJob({ jobId: "T002", chatId: "self", senderId: "me", projectId: "Beta", cwd: "D:/work/beta", status: "completed", createdAt: 2 });
  const text = formatOverview(store.listJobs(), registry(), 8);
  assert.match(text, /Web \(Alpha\).*1 進行中/s);
  assert.match(text, /API \(Beta\).*1 已完成/s);
  store.setConversationContext("self", "Beta", 5);
  assert.equal(store.getConversationContext("self").activeProjectId, "Beta");
  store.close();
});
