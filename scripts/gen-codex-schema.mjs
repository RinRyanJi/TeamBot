// Regenerate the Codex app-server protocol schema from the pinned codex-cli.
// The TypeScript bindings (src/codex/schema/ts) are committed as the pinned
// contract and verified by tests/codex-protocol-names.test.ts. The JSON schema
// (src/codex/schema/json) is bulky and gitignored; regenerate it on demand.
//
// Usage: node scripts/gen-codex-schema.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";

const PINNED = "0.156.1";
const version = execFileSync("codex", ["--version"], { encoding: "utf8" }).trim();
if (!version.includes(PINNED)) {
  console.warn(`WARNING: expected codex-cli ${PINNED}, found "${version}". Update PINNED_CODEX_CLI_VERSION and re-verify names if you intend to upgrade.`);
}

for (const [sub, out] of [
  ["generate-ts", "src/codex/schema/ts"],
  ["generate-json-schema", "src/codex/schema/json"],
]) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  console.log(`codex app-server ${sub} --out ${out}`);
  execFileSync("codex", ["app-server", sub, "--out", out], { stdio: "inherit" });
}
console.log("Done. Run `npm test` to verify required protocol names are still present.");
