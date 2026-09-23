import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_WORKSPACE_PATH,
  DEFAULT_WORKSPACE,
  registerDefaults,
  ensureWorkspace,
} from "../src/app/defaults.ts";
import { ProjectRegistry } from "../src/app/projects.ts";

test("default workspace is an absolute AgentHub path", () => {
  assert.equal(DEFAULT_PROJECT_ID, "AgentHub");
  assert.ok(isAbsolute(DEFAULT_WORKSPACE_PATH), "cwd must be absolute");
  assert.match(DEFAULT_WORKSPACE_PATH, /AgentHub$/);
  assert.equal(DEFAULT_WORKSPACE.projectId, "AgentHub");
});

test("registerDefaults registers AgentHub as a project alias", () => {
  const reg = new ProjectRegistry();
  registerDefaults(reg);
  assert.ok(reg.has("AgentHub"));
  assert.match(reg.get("AgentHub")!.cwd, /AgentHub$/);
});

test("ensureWorkspace creates the folder tree", () => {
  const root = join(tmpdir(), `agenthub-test-${process.pid}`);
  ensureWorkspace(root);
  assert.ok(existsSync(root));
  assert.ok(existsSync(join(root, "projects")));
  assert.ok(existsSync(join(root, "data")));
  assert.ok(existsSync(join(root, "logs")));
});

test("the real default workspace exists on disk", () => {
  // Created by ensureWorkspace / setup; the default startup folder must be present.
  assert.ok(existsSync(DEFAULT_WORKSPACE_PATH), `${DEFAULT_WORKSPACE_PATH} should exist`);
});
