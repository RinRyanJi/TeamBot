// Default personal-assistant workspace (AgentHub).
// !tb has a default startup folder at D:\AgentHub; the desktop can still register
// additional project aliases. cwd is normalized to an absolute path (§8: the phone
// never submits a cwd — it names an alias).
import { mkdirSync } from "node:fs";
import { normalize } from "node:path";
import type { ProjectRegistry } from "./projects.ts";

export const DEFAULT_PROJECT_ID = "AgentHub";
export const DEFAULT_WORKSPACE_PATH = normalize("D:\\AgentHub");

export const DEFAULT_WORKSPACE = {
  projectId: DEFAULT_PROJECT_ID,
  cwd: DEFAULT_WORKSPACE_PATH,
};

/** Create the AgentHub workspace (and standard subfolders) if missing. */
export function ensureWorkspace(root: string = DEFAULT_WORKSPACE_PATH): string {
  for (const sub of ["", "projects", "data", "logs"]) {
    mkdirSync(sub ? normalize(root + "\\" + sub) : root, { recursive: true });
  }
  return root;
}

/** Register AgentHub as the default project so !tb has a default working directory. */
export function registerDefaults(registry: ProjectRegistry): void {
  registry.register({ projectId: DEFAULT_PROJECT_ID, cwd: DEFAULT_WORKSPACE_PATH });
}
