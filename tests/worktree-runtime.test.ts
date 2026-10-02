import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitWorktreeRuntime } from "../src/supervisor/worktree-runtime.ts";

const execFileAsync = promisify(execFile);

test("GitWorktreeRuntime creates and removes a real isolated worktree", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "teambot-worktree-"));
  try {
    await execFileAsync("git", ["-C", root, "init", "-q"]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "teambot-fixture@example.invalid"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "TeamBot Fixture"]);
    await writeFile(join(root, "README.md"), "fixture\n", "utf8");
    await execFileAsync("git", ["-C", root, "add", "README.md"]);
    await execFileAsync("git", ["-C", root, "commit", "-qm", "fixture"]);
    const runtime = new GitWorktreeRuntime();
    const path = await runtime.create(root, "T-WT");
    assert.match(path, /\.worktrees/);
    const inside = await execFileAsync("git", ["-C", path, "rev-parse", "--show-toplevel"]);
    assert.ok(inside.stdout.trim().length > 0);
    await runtime.remove(root, path);
    const list = await execFileAsync("git", ["-C", root, "worktree", "list", "--porcelain"]);
    assert.doesNotMatch(list.stdout, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } catch (error) {
    if (error instanceof Error && /not recognized|ENOENT|cannot find/i.test(error.message)) t.skip("git executable unavailable");
    else throw error;
  } finally {
    try { await rm(root, { recursive: true, force: true }); } catch { /* Windows may hold a transient Git metadata handle. */ }
  }
});

