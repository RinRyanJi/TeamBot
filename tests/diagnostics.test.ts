import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { exportDiagnostics, writeDiagnostics } from "../src/app/diagnostics.ts";

test("exported diagnostics omit secrets and env", () => {
  const diag = exportDiagnostics({
    version: "0.0.1",
    platform: "win32",
    jobCount: 3,
    token: "gho_supersecretsupersecret1234567",
    cookie: "sid=abc",
    environment: { HOME: "/home/x", SECRET: "y" },
    recentLog: "Authorization: Bearer aaa.bbb.ccc done",
  });
  const s = JSON.stringify(diag);
  assert.match(s, /"version":"0.0.1"/);
  assert.match(s, /"jobCount":3/);
  assert.ok(!s.includes("gho_supersecret"), "no token value");
  assert.ok(!s.includes("sid=abc"), "no cookie value");
  assert.ok(!s.includes("HOME"), "no environment keys");
  assert.ok(!s.includes("Bearer aaa"), "no bearer token in logs");
});

test("writeDiagnostics writes a redacted file to disk", () => {
  const p = join(tmpdir(), `teambot-diag-${Date.now()}.json`);
  try {
    writeDiagnostics(p, {
      version: "0.0.1",
      platform: "win32",
      apiKey: "sk-secretsecretsecret",
      env: { PATH: "/x" },
    });
    const onDisk = readFileSync(p, "utf8");
    assert.ok(!onDisk.includes("sk-secret"), "file must not contain the api key");
    assert.ok(!onDisk.includes("PATH"), "file must not contain env");
    assert.match(onDisk, /"apiKey": "\[redacted\]"/);
  } finally {
    rmSync(p, { force: true });
  }
});
