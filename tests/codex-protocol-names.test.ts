import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_REQUIRED_PROTOCOL_NAMES } from "../src/codex/protocol-names.ts";

const here = dirname(fileURLToPath(import.meta.url));
const schemaTsDir = join(here, "..", "src", "codex", "schema", "ts");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("generated codex schema exists (run: codex app-server generate-ts)", () => {
  assert.ok(
    existsSync(schemaTsDir),
    `missing generated schema at ${schemaTsDir}`,
  );
});

test("every required protocol name is present in the generated schema", () => {
  const corpus = collectTsFiles(schemaTsDir)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const missing = ALL_REQUIRED_PROTOCOL_NAMES.filter(
    (name) => !corpus.includes(`"${name}"`),
  );

  assert.deepEqual(
    missing,
    [],
    `these names TeamBot depends on are absent from the generated schema: ${missing.join(", ")}`,
  );
});
