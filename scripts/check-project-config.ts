// Validate the desktop-created project profile file without starting Teams or Codex.
// Output is intentionally limited to safe display fields.
import { basename } from "node:path";
import { defaultProjectConfigPath, loadProjectConfig } from "../src/app/project-config.ts";

try {
  const path = defaultProjectConfigPath(process.env);
  const projects = loadProjectConfig(path);
  console.log(`Project config OK: ${projects.length} project(s)`);
  for (const project of projects) {
    console.log(`- ${project.name ?? project.projectId} (${project.projectId}) · ${basename(project.cwd)} · ${project.executionPolicy ?? "read-only"}`);
  }
} catch (error) {
  console.error(`Project config invalid: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
