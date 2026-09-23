// Project registry (architecture §8). The desktop registers project aliases with
// normalized absolute paths; the phone can only name a registered alias, never
// submit an arbitrary cwd.
export interface ProjectDef {
  projectId: string;
  cwd: string;
}

export class ProjectRegistry {
  private m = new Map<string, ProjectDef>();
  register(def: ProjectDef): void {
    this.m.set(def.projectId, def);
  }
  get(projectId: string): ProjectDef | undefined {
    return this.m.get(projectId);
  }
  has(projectId: string): boolean {
    return this.m.has(projectId);
  }
  list(): string[] {
    return [...this.m.keys()];
  }
}
