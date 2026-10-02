// Project profile configuration shared by the v4 runtime and desktop setup.
// The file lives in the user's data directory; it is never committed to Git.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import type { ProjectDef } from "./projects.ts";
import { ProjectRegistry } from "./projects.ts";

export interface ProjectConfigEnvironment {
  TEAMBOT_PROJECTS_FILE?: string;
  LOCALAPPDATA?: string;
  APPDATA?: string;
  HOME?: string;
}

/** Resolve the user-data config location without ever placing it in the repo. */
export function defaultProjectConfigPath(env: ProjectConfigEnvironment = process.env): string {
  if (env.TEAMBOT_PROJECTS_FILE?.trim()) return env.TEAMBOT_PROJECTS_FILE.trim();
  const base = env.LOCALAPPDATA ?? env.APPDATA ?? env.HOME;
  if (!base) throw new Error("cannot determine TeamBot user-data directory; set TEAMBOT_PROJECTS_FILE");
  return join(base, "TeamBot", "projects.json");
}

function asProfiles(value: unknown): ProjectDef[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { projects?: unknown }).projects)
      ? (value as { projects: unknown[] }).projects
      : null;
  if (!raw || raw.length === 0) throw new Error("project config must contain a non-empty projects array");

  const registry = new ProjectRegistry();
  const seenIds = new Set<string>();
  const profiles = raw.map((value) => {
    if (!value || typeof value !== "object") throw new Error("invalid project profile");
    const project = value as ProjectDef;
    const projectId = project.projectId?.trim();
    const cwd = project.cwd?.trim();
    if (!projectId) throw new Error("projectId is required");
    if (seenIds.has(projectId.toLowerCase())) throw new Error(`duplicate projectId: ${projectId}`);
    seenIds.add(projectId.toLowerCase());
    if (!cwd || !isAbsolute(cwd)) throw new Error(`project ${projectId} needs an absolute cwd`);
    return { ...project, projectId, cwd: normalize(cwd) };
  });
  for (const profile of profiles) registry.register(profile);
  return registry.all();
}

export function parseProjectConfig(raw: string): ProjectDef[] {
  try {
    return asProfiles(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`invalid project config JSON: ${error.message}`);
    throw error;
  }
}

export function loadProjectConfig(path: string): ProjectDef[] {
  return parseProjectConfig(readFileSync(path, "utf8"));
}

/** Write atomically so a runtime restart never observes a half-written profile list. */
export function saveProjectConfig(path: string, projects: readonly ProjectDef[]): void {
  const normalized = asProfiles([...projects]);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify({ version: 1, projects: normalized }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}
