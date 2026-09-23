// Generates taskNNN-slug/ folders (spec README + evidence/) and the master index
// from manifest.json. Idempotent: never overwrites an existing README or evidence.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

const dirFor = (t) => `${t.id}-${t.slug}`;

for (const t of manifest.tasks) {
  const dir = join(here, dirFor(t));
  const evidenceDir = join(dir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  const gitkeep = join(evidenceDir, ".gitkeep");
  if (!existsSync(gitkeep)) writeFileSync(gitkeep, "");

  const readme = join(dir, "README.md");
  if (!existsSync(readme)) {
    const body = [
      `# ${t.id} — ${t.title}`,
      ``,
      `- Phase: ${t.phase}`,
      `- Env: ${t.env === "live" ? "live (requires user's real Teams tenant/phone)" : "local (fully verifiable here)"}`,
      `- Status: pending`,
      ``,
      `## Spec`,
      ``,
      t.spec,
      ``,
      `## Acceptance (evidence-based)`,
      ``,
      t.acceptance,
      ``,
      `## Required evidence (stored under evidence/)`,
      ``,
      ...t.evidence.map((e) => `- \`${e}\``),
      ``,
      `## Result`,
      ``,
      `_Fill in when complete: commit hash, what was verified, and how._`,
      ``,
    ].join("\n");
    writeFileSync(readme, body);
  }
}

// Master index — status is read back from each task's README so regeneration
// never reverts progress.
const statusOf = (t) => {
  const readme = join(here, dirFor(t), "README.md");
  if (!existsSync(readme)) return "pending";
  const m = readFileSync(readme, "utf8").match(/^- Status:\s*(.+)$/m);
  return m ? m[1].trim() : "pending";
};
const rows = manifest.tasks
  .map((t) => `| ${t.id} | ${t.phase} | ${t.env} | [${t.title}](${dirFor(t)}/README.md) | ${statusOf(t)} |`)
  .join("\n");
const index = [
  `# TeamBot task list`,
  ``,
  `Decomposition of [../docs/implementation-plan.md](../docs/implementation-plan.md). Each task is completed with real evidence stored under its \`evidence/\` folder, then committed/pushed individually.`,
  ``,
  `- **env=local**: fully verifiable on this machine (build/test/real codex-cli).`,
  `- **env=live**: requires the user's real Teams tenant/phone; the agent provides the harness, the user runs it (real Teams sends are restricted per AGENTS.md).`,
  ``,
  `| ID | Phase | Env | Task | Status |`,
  `|---|---|---|---|---|`,
  rows,
  ``,
  `See [manifest.json](manifest.json) for the machine-readable source and [scaffold.mjs](scaffold.mjs) for the generator.`,
  ``,
].join("\n");
writeFileSync(join(here, "README.md"), index);

console.log(`Scaffolded ${manifest.tasks.length} tasks.`);
