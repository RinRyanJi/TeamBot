import { test } from "node:test";
import assert from "node:assert/strict";
import { redactString, redactValue, buildDiagnostics, REDACTED } from "../src/util/redact.ts";

test("token-shaped substrings are scrubbed from strings", () => {
  assert.equal(redactString("auth: Bearer abc.def-123"), `auth: ${REDACTED}`);
  assert.match(redactString("use github_pat_ABCDEFGHIJKLMNOPQRSTUV as token"), /\[redacted\]/);
  assert.match(redactString("gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), /\[redacted\]/);
  assert.equal(redactString("nothing secret here"), "nothing secret here");
});

test("secret-named keys are redacted; env is dropped entirely", () => {
  const out = redactValue({
    user: "alice",
    token: "gho_secretsecretsecretsecret123456",
    cookie: "session=abc",
    nested: { apiKey: "k", note: "ok" },
    env: { PATH: "/usr/bin", SECRET: "x" },
  }) as Record<string, unknown>;
  assert.equal(out.user, "alice");
  assert.equal(out.token, REDACTED);
  assert.equal(out.cookie, REDACTED);
  assert.deepEqual(out.nested, { apiKey: REDACTED, note: "ok" });
  assert.ok(!("env" in out), "env must be dropped, not just redacted");
});

test("buildDiagnostics never emits secrets or full env", () => {
  const diag = buildDiagnostics({
    version: "0.0.1",
    logs: ["ok", "Authorization: Bearer zzz.yyy.xxx"],
    environment: { HOME: "/home/x" },
    credential: "hunter2",
  });
  const serialized = JSON.stringify(diag);
  assert.match(serialized, /"version":"0.0.1"/);
  assert.ok(!serialized.includes("Bearer zzz"), "no bearer token in diagnostics");
  assert.ok(!serialized.includes("HOME"), "no environment in diagnostics");
  assert.ok(!serialized.includes("hunter2"), "no credential value in diagnostics");
});
