// Project registry (PRD v4 §5). The desktop registers project aliases with
// normalized absolute paths; the phone can only name a registered project,
// never submit an arbitrary cwd.
export interface ProjectDef {
  projectId: string;
  cwd: string;
  /** Friendly name shown in the mobile overview. */
  name?: string;
  /** Additional names accepted by the command parser. */
  aliases?: string[];
  repository?: string;
  defaultBranch?: string;
  executionPolicy?: "read-only" | "workspace-write" | "danger-full-access";
  lanePolicy?: "single-active" | "worktree-fork";
  notificationPolicy?: "quiet" | "important" | "all-decisions";
  conversationBindings?: string[];
  lastUsedAt?: number;
}

export class ProjectRegistry {
  private m = new Map<string, ProjectDef>();
  private aliases = new Map<string, string>();

  register(def: ProjectDef): void {
    const projectId = def.projectId.trim();
    if (!projectId) throw new Error("projectId is required");
    const normalized: ProjectDef = {
      ...def,
      projectId,
      name: def.name?.trim() || projectId,
      aliases: [...new Set((def.aliases ?? []).map((a) => a.trim()).filter(Boolean))],
      lanePolicy: def.lanePolicy ?? "single-active",
      notificationPolicy: def.notificationPolicy ?? "important",
      conversationBindings: [...new Set((def.conversationBindings ?? []).map((id) => id.trim()).filter(Boolean))],
    };

    // A project name/alias is a user-facing routing key. Replacing an existing
    // project is allowed only when the key belongs to that same project; a
    // collision between two projects must be fixed at desktop setup time.
    const keys = [projectId, normalized.name!, ...(normalized.aliases ?? [])];
    for (const key of keys) {
      const owner = this.aliases.get(key.toLowerCase());
      if (owner && owner !== projectId) throw new Error(`project alias collision: ${key}`);
    }
    const previous = this.m.get(projectId);
    if (previous) {
      for (const key of [previous.projectId, previous.name ?? "", ...(previous.aliases ?? [])]) {
        if (key) this.aliases.delete(key.toLowerCase());
      }
    }
    this.m.set(projectId, normalized);
    this.aliases.set(projectId.toLowerCase(), projectId);
    this.aliases.set(normalized.name!.toLowerCase(), projectId);
    for (const alias of normalized.aliases ?? []) this.aliases.set(alias.toLowerCase(), projectId);
  }

  get(projectId: string): ProjectDef | undefined {
    const canonical = this.aliases.get(projectId.trim().toLowerCase()) ?? projectId;
    return this.m.get(canonical);
  }

  resolve(projectIdOrAlias: string): ProjectDef | undefined {
    return this.get(projectIdOrAlias);
  }

  has(projectId: string): boolean {
    return this.get(projectId) !== undefined;
  }

  list(): string[] {
    return [...this.m.keys()];
  }

  all(): ProjectDef[] {
    return [...this.m.values()];
  }

  markUsed(projectId: string, at: number): void {
    const project = this.m.get(projectId);
    if (project) project.lastUsedAt = at;
  }
}
