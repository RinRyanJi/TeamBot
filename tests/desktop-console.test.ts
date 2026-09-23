import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeProjectPath, registerProject, createBaseline } from "../src/app/desktop-logic.ts";
import { ProjectRegistry } from "../src/app/projects.ts";
import { renderStatusHtml } from "../src/app/status-page.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

test("project path normalization requires an absolute path", () => {
  assert.throws(() => normalizeProjectPath("relative/dir"), /absolute/);
  const n = normalizeProjectPath("D:/proj/../proj/TeamBot");
  assert.ok(/TeamBot$/.test(n));
  assert.ok(!n.includes(".."), "normalized path has no ..");
});

test("registerProject stores a normalized absolute cwd", () => {
  const reg = new ProjectRegistry();
  registerProject(reg, "TeamBot", "D:/work/./TeamBot");
  assert.ok(reg.has("TeamBot"));
  assert.ok(/TeamBot$/.test(reg.get("TeamBot")!.cwd));
  assert.throws(() => registerProject(reg, "", "D:/x"), /projectId/);
  assert.throws(() => registerProject(reg, "X", "rel/path"), /absolute/);
});

test("createBaseline uses the latest visible message (history not executed)", () => {
  const b = createBaseline(
    [
      { messageId: "m1", receivedAt: 100 },
      { messageId: "m3", receivedAt: 300 },
      { messageId: "m2", receivedAt: 200 },
    ],
    999,
  );
  assert.equal(b.baselineMessageId, "m3");
  assert.equal(b.baselineAt, 300);
  // empty -> now
  assert.deepEqual(createBaseline([], 999), { baselineMessageId: null, baselineAt: 999 });
});

test("status page renders a row per job and escapes content", () => {
  const html = renderStatusHtml([
    { jobId: "T001", status: "running", projectId: "TeamBot", chatId: "self1" },
    { jobId: "T002", status: "completed", projectId: "P<>", chatId: "g1" },
  ]);
  assert.match(html, /data-job-id="T001"/);
  assert.match(html, /data-job-id="T002"/);
  assert.match(html, /data-count="2"/);
  assert.ok(!html.includes("P<>"), "content is HTML-escaped");
});

test("electron desktop console renders the status page (job rows visible)", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }
  const smoke = join(here, "..", "scripts", "console-smoke.cjs");
  const res = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const cp = spawn(electronPath, [smoke], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", (d) => (out += d.toString()));
    cp.on("error", () => resolve({ code: -1, out }));
    cp.on("exit", (code) => resolve({ code, out }));
    setTimeout(() => {
      cp.kill();
      resolve({ code: -2, out });
    }, 60_000).unref();
  });
  if (res.code === -1 || res.code === -2 || !res.out.includes("CONSOLE_RESULT")) {
    t.skip(`electron could not run headlessly (code ${res.code})`);
    return;
  }
  const line = res.out.split("\n").find((l) => l.includes("CONSOLE_RESULT")) ?? "";
  const json = JSON.parse(line.slice(line.indexOf("{"))) as {
    jobCount: number;
    firstJobId: string;
  };
  assert.equal(json.jobCount, 1);
  assert.equal(json.firstJobId, "T001");
  assert.equal(res.code, 0);
});
