import type { ProjectDef, ProjectRegistry } from "./projects.ts";

export interface ConversationContext {
  chatId: string;
  activeProjectId: string | null;
  updatedAt: number;
  expiresAt: number;
}
/**
 * Small state holder for the project selected in a self-chat or group chat.
 * The desktop may replace this with the Store-backed implementation later;
 * keeping the policy here makes parser/coordinator behaviour deterministic in
 * both the local fixture and Electron runtime.
 */
export class ConversationContextStore {
  private readonly contexts = new Map<string, ConversationContext>();
  private readonly ttlMs: number;
  constructor(ttlMs = 30 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  get(chatId: string, now?: number): ConversationContext {
    const current = this.contexts.get(chatId) ?? { chatId, activeProjectId: null, updatedAt: 0, expiresAt: 0 };
    if (now !== undefined && current.activeProjectId && current.expiresAt > 0 && now > current.expiresAt) {
      return this.clear(chatId, now);
    }
    return current;
  }

  focus(chatId: string, projectId: string, now: number): ConversationContext {
    const next = { chatId, activeProjectId: projectId, updatedAt: now, expiresAt: now + this.ttlMs };
    this.contexts.set(chatId, next);
    return next;
  }

  clear(chatId: string, now: number): ConversationContext {
    const next = { chatId, activeProjectId: null, updatedAt: now, expiresAt: 0 };
    this.contexts.set(chatId, next);
    return next;
  }
}

export type ProjectResolution =
  | { kind: "resolved"; project: ProjectDef; source: "explicit" | "focused" | "only-project" }
  | { kind: "ambiguous"; candidates: ProjectDef[] }
  | { kind: "unknown"; projectId: string };

/** Resolve a command's optional project without accepting a phone-supplied cwd. */
export function resolveProject(
  registry: ProjectRegistry,
  contexts: ConversationContextStore,
  chatId: string,
  explicitProject: string | undefined,
  allowedProjectIds?: ReadonlySet<string>,
): ProjectResolution {
  if (explicitProject) {
    const project = registry.resolve(explicitProject);
    return project && (!allowedProjectIds || allowedProjectIds.has(project.projectId))
      ? { kind: "resolved", project, source: "explicit" }
      : { kind: "unknown", projectId: explicitProject };
  }
  const focused = contexts.get(chatId).activeProjectId;
  if (focused) {
    const project = registry.get(focused);
    if (project && (!allowedProjectIds || allowedProjectIds.has(project.projectId))) return { kind: "resolved", project, source: "focused" };
  }
  const projects = registry.all().filter((project) => !allowedProjectIds || allowedProjectIds.has(project.projectId));
  if (projects.length === 1) return { kind: "resolved", project: projects[0]!, source: "only-project" };
  return { kind: "ambiguous", candidates: projects };
}
