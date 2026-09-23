import { test } from "node:test";
import assert from "node:assert/strict";
import { WorktreeAllocator, MultiTaskScheduler } from "../src/supervisor/worktrees.ts";

test("worktree allocator gives unique isolated paths and releases", () => {
  const a = new WorktreeAllocator("D:\\AgentHub");
  const p1 = a.allocate("T1");
  const p2 = a.allocate("T2");
  assert.notEqual(p1, p2);
  assert.match(p1, /T1$/);
  assert.equal(a.activePaths().length, 2);
  a.release("T1");
  assert.equal(a.pathFor("T1"), undefined);
  assert.equal(a.activePaths().length, 1);
});

test("default single-thread scheduler runs one at a time (resident behavior)", () => {
  const s = new MultiTaskScheduler("D:\\AgentHub", 1);
  s.submit({ jobId: "T1", chatId: "c", projectId: "AgentHub" });
  s.submit({ jobId: "T2", chatId: "c", projectId: "AgentHub" });
  const first = s.startNext();
  assert.equal(first?.item.jobId, "T1");
  assert.equal(s.startNext(), null, "cap=1: second cannot start");
  s.finish("T1");
  assert.equal(s.startNext()?.item.jobId, "T2");
});

test("multi-thread: different projects run in parallel with distinct worktrees", () => {
  const s = new MultiTaskScheduler("D:\\AgentHub", 2);
  s.submit({ jobId: "A", chatId: "c1", projectId: "P" });
  s.submit({ jobId: "B", chatId: "c2", projectId: "Q" });
  const a = s.startNext();
  const b = s.startNext();
  assert.equal(a?.item.jobId, "A");
  assert.equal(b?.item.jobId, "B");
  assert.notEqual(a?.worktree, b?.worktree, "isolated worktrees");
  assert.equal(s.activeCount, 2);
});

test("same project never runs concurrently even above the cap", () => {
  const s = new MultiTaskScheduler("D:\\AgentHub", 2);
  s.submit({ jobId: "A", chatId: "c1", projectId: "P" });
  s.submit({ jobId: "B", chatId: "c2", projectId: "P" }); // same project
  const a = s.startNext();
  assert.equal(a?.item.jobId, "A");
  assert.equal(s.startNext(), null, "B blocked: project P locked");
  s.finish("A");
  assert.equal(s.startNext()?.item.jobId, "B");
});
