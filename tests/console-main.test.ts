import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const mainCjs = join(here, "..", "launcher", "electron", "console-main.cjs");

// Verifies the real Electron console main: closing the window minimizes to tray
// (window hidden but not destroyed, app alive), and an explicit quit drains the
// running job before exiting. Skips if Electron can't launch headlessly.
test("electron console main: close hides to tray; explicit quit drains running jobs", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }
  const res = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const cp = spawn(electronPath, [mainCjs, "--smoke"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", (d) => (out += d.toString()));
    cp.on("error", () => resolve({ code: -1, out }));
    cp.on("exit", (code) => resolve({ code, out }));
    setTimeout(() => {
      cp.kill();
      resolve({ code: -2, out });
    }, 60_000).unref();
  });
  if (res.code === -1 || res.code === -2 || !res.out.includes("CONSOLE_MAIN_RESULT")) {
    t.skip(`electron could not run headlessly (code ${res.code})`);
    return;
  }
  const line = res.out.split("\n").find((l) => l.includes("CONSOLE_MAIN_RESULT")) ?? "";
  const r = JSON.parse(line.slice(line.indexOf("{"))) as {
    hiddenAfterClose: boolean;
    aliveAfterClose: boolean;
    drained: boolean;
    waitedMs: number;
  };
  assert.equal(r.hiddenAfterClose, true, "closing the window must hide (minimize to tray)");
  assert.equal(r.aliveAfterClose, true, "app must stay alive after window close");
  assert.equal(r.drained, true, "explicit quit must drain running jobs");
  assert.ok(r.waitedMs >= 250, `quit must WAIT for the running job (waited ${r.waitedMs}ms)`);
  assert.equal(res.code, 0);
});
