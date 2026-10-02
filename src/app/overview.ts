import type { Job } from "../storage/store.ts";
import type { ProjectRegistry } from "./projects.ts";

export interface ProjectOverview {
  projectId: string;
  name: string;
  active: number;
  queued: number;
  completed: number;
  failed: number;
  jobs: Job[];
}
const ACTIVE = new Set(["queued", "starting", "running", "waiting", "approval", "recovering"]);

export function buildOverview(jobs: Job[], projects: ProjectRegistry): ProjectOverview[] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) groups.set(job.projectId, [...(groups.get(job.projectId) ?? []), job]);
  return projects.all().map((project) => {
    const projectJobs = groups.get(project.projectId) ?? [];
    return {
      projectId: project.projectId,
      name: project.name ?? project.projectId,
      active: projectJobs.filter((j) => ACTIVE.has(j.status)).length,
      queued: projectJobs.filter((j) => j.status === "queued").length,
      completed: projectJobs.filter((j) => j.status === "completed").length,
      failed: projectJobs.filter((j) => ["failed", "cancelled", "killed"].includes(j.status)).length,
      jobs: projectJobs.sort((a, b) => b.createdAt - a.createdAt),
    };
  });
}

export function formatOverview(jobs: Job[], projects: ProjectRegistry, maxJobs = 8): string {
  const groups = buildOverview(jobs, projects);
  const total = groups.reduce((n, g) => n + g.jobs.length, 0);
  const lines = ["[TB] 專案總覽"];
  for (const group of groups) {
    const label = `${group.name} (${group.projectId})`;
    if (group.jobs.length === 0) {
      lines.push(`• ${label}：目前沒有任務`);
      continue;
    }
    lines.push(`• ${label}：${group.active} 進行中、${group.completed} 已完成、${group.failed} 失敗/取消`);
    for (const job of group.jobs.slice(0, maxJobs)) lines.push(`  ${job.jobId} · ${job.status}${job.lastResult ? ` · ${job.lastResult.slice(0, 120)}` : ""}`);
  }
  if (total > maxJobs) lines.push(`…還有 ${total - maxJobs} 個任務，使用 !tb task <T id> 查看`);
  return lines.join("\n");
}

export function formatTask(job: Job, projectName = job.projectId): string {
  return [
    `[TB ${job.jobId}] ${projectName}`,
    `狀態：${job.status}`,
    `來源聊天：${job.chatId}`,
    `Codex thread：${job.threadId ?? "尚未建立"}`,
    `最近事件：${job.lastEventAt ?? "-"}`,
    `結果：${job.lastResult ?? "(尚無)"}`,
  ].join("\n");
}
