import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { normalize } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WorktreeRuntime {
  create(projectCwd: string, taskId: string): Promise<string | WorktreeInfo>;
  remove(projectCwd: string, worktreePath: string): Promise<void>;
}

export interface WorktreeInfo {
  path: string;
  branchName: string;
}

/** Creates real named Git worktrees for explicit same-project forks. */
export class GitWorktreeRuntime implements WorktreeRuntime {
  private readonly rootName: string;
  constructor(rootName = ".worktrees") {
    this.rootName = rootName;
  }

  async create(projectCwd: string, taskId: string): Promise<WorktreeInfo> {
    const path = normalize(`${projectCwd}\\${this.rootName}\\${taskId}`);
    await mkdir(normalize(`${projectCwd}\\${this.rootName}`), { recursive: true });
    const branchName = `teambot/${taskId}`;
    await execFileAsync("git", ["-C", projectCwd, "worktree", "add", "-b", branchName, path, "HEAD"], { windowsHide: true });
    return { path, branchName };
  }

  async remove(projectCwd: string, worktreePath: string): Promise<void> {
    await execFileAsync("git", ["-C", projectCwd, "worktree", "remove", "--force", worktreePath], { windowsHide: true });
  }
}

