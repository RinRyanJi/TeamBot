import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultProjectConfigPath,
  loadProjectConfig,
  parseProjectConfig,
  saveProjectConfig,
} from "../src/app/project-config.ts";

test("project config normalizes profiles and rejects unsafe or colliding entries", () => {
  const profiles = parseProjectConfig(JSON.stringify({ projects: [
    { projectId: "TeamBot", name: "TeamBot", aliases: ["tb", "tb"], cwd: "D:/workspace/TeamBot/../TeamBot" },
    { projectId: "Docs", cwd: "D:/workspace/Docs" },
  ] }));
  assert.equal(profiles[0]?.aliases?.length, 1);
  assert.ok(!profiles[0]!.cwd.includes(".."));
  assert.equal(profiles[1]?.name, "Docs");
  assert.throws(() => parseProjectConfig(JSON.stringify([{ projectId: "Bad", cwd: "relative" }])), /absolute/);
  assert.throws(() => parseProjectConfig(JSON.stringify([
    { projectId: "A", name: "same", cwd: "D:/a" },
    { projectId: "B", aliases: ["same"], cwd: "D:/b" },
  ])), /collision/);
  assert.throws(() => parseProjectConfig(JSON.stringify([
    { projectId: "A", cwd: "D:/a" },
    { projectId: "a", cwd: "D:/b" },
  ])), /duplicate projectId/);
});

test("project config saves atomically and loads from the configured user path", () => {
  const dir = mkdtempSync(join(tmpdir(), "teambot-config-"));
  try {
    const path = join(dir, "projects.json");
    assert.equal(defaultProjectConfigPath({ TEAMBOT_PROJECTS_FILE: path }), path);
    saveProjectConfig(path, [{ projectId: "TeamBot", cwd: "D:/workspace/TeamBot" }]);
    const loaded = loadProjectConfig(path);
    assert.equal(loaded[0]?.projectId, "TeamBot");
    assert.match(readFileSync(path, "utf8"), /"version": 1/);
    assert.equal(readFileSync(path, "utf8").includes("token"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
