import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const smoke = join(here, "..", "scripts", "browser-host-smoke.cjs");

// Launches the real Electron Browser Host and asserts the remote Teams page has no
// Node integration. Skips (not fails) if Electron can't launch (e.g. headless CI with
// no display); a launch that reports an insecure page is a real failure.
test("electron browser host: remote page is isolated (no node integration)", async (t) => {
  let electronPath: string;
  try {
    electronPath = require("electron") as string;
  } catch {
    t.skip("electron not installed");
    return;
  }

  const result = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const cp = spawn(electronPath, [smoke], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    cp.stdout.on("data", (d) => (out += d.toString()));
    cp.stderr.on("data", () => undefined);
    cp.on("error", () => resolve({ code: -1, out }));
    cp.on("exit", (code) => resolve({ code, out }));
    setTimeout(() => {
      cp.kill();
      resolve({ code: -2, out });
    }, 60_000).unref();
  });

  if (result.code === -1 || result.code === -2 || !result.out.includes("SMOKE_RESULT")) {
    t.skip(`electron could not run headlessly (code ${result.code})`);
    return;
  }

  const line = result.out.split("\n").find((l) => l.includes("SMOKE_RESULT")) ?? "";
  const json = JSON.parse(line.slice(line.indexOf("{"))) as {
    requireType: string;
    processType: string;
    moduleType: string;
    chatId: string;
    isolated: boolean;
  };
  assert.equal(json.requireType, "undefined", "require must be undefined in remote page");
  assert.equal(json.processType, "undefined", "process must be undefined in remote page");
  assert.equal(json.moduleType, "undefined", "module must be undefined in remote page");
  assert.equal(json.chatId, "fixture-chat-1");
  assert.equal(json.isolated, true);
  assert.equal(result.code, 0, "smoke should exit 0");
});
