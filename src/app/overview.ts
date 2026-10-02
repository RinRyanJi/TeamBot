import type { Job } from "../storage/store.ts";
import type { ProjectRegistry } from "./projects.ts";

export interface ProjectOverview {
  projectId: string;
  name: string;
  active: number;
  queued: number;
  completed: number;
  followup: number;
  failed: number;
  jobs: Job[];
}
const ACTIVE = new Set(["queued", "starting", "running", "waiting", "waiting_input", "approval", "waiting_approval", "recovering", "merge-pending"]);

export function buildOverview(jobs: Job[], projects: ProjectRegistry, allowedProjectIds?: ReadonlySet<string>): ProjectOverview[] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) groups.set(job.projectId, [...(groups.get(job.projectId) ?? []), job]);
  return projects.all().filter((project) => !allowedProjectIds || allowedProjectIds.has(project.projectId)).map((project) => {
    const projectJobs = groups.get(project.projectId) ?? [];
    return {
      projectId: project.projectId,
      name: project.name ?? project.projectId,
      active: projectJobs.filter((j) => ACTIVE.has(j.status)).length,
      queued: projectJobs.filter((j) => j.status === "queued").length,
      completed: projectJobs.filter((j) => j.status === "completed").length,
      followup: projectJobs.filter((j) => j.status === "completed_with_followup").length,
      failed: projectJobs.filter((j) => ["failed", "cancelled", "killed"].includes(j.status)).length,
      jobs: projectJobs.sort((a, b) => b.createdAt - a.createdAt),
    };
  });
}

export function formatOverview(jobs: Job[], projects: ProjectRegistry, maxJobs = 8, allowedProjectIds?: ReadonlySet<string>): string {
  const groups = buildOverview(jobs, projects, allowedProjectIds);
  const total = groups.reduce((n, g) => n + g.jobs.length, 0);
  const lines = ["[TB] 專案總覽"];
  let remaining = maxJobs;
  for (const group of groups) {
    const label = `${group.name} (${group.projectId})`;
    if (group.jobs.length === 0) {
      lines.push(`• ${label}：目前沒有任務`);
      continue;
    }
    lines.push(`• ${label}：${group.active} 進行中、${group.completed} 已完成、${group.followup} 需後續、${group.failed} 失敗/取消`);
    for (const job of group.jobs.slice(0, remaining)) {
      const mode = job.executionMode === "worktree" ? ` · worktree/${job.jobId}` : "";
      const queue = job.queuePosition ? ` · queue #${job.queuePosition}${job.queueReason ? ` (${job.queueReason})` : ""}` : "";
      const step = job.currentStep ? ` · ${job.currentStep}` : "";
      const delivery = job.deliveryStatus === "delivery_degraded" ? " · delivery_degraded" : "";
      lines.push(`  ${job.jobId} · ${job.status}${mode}${queue}${step}${delivery}${job.lastResult ? ` · ${job.lastResult.slice(0, 120)}` : ""}`);
      remaining -= 1;
    }
  }
  if (total > maxJobs) lines.push(`…還有 ${total - maxJobs} 個任務，使用 !tb task <T id> 查看`);
  return lines.join("\n");
}

export function formatTask(job: Job, projectName = job.projectId): string {
  return [
    `[TB ${job.jobId}] ${projectName}`,
    `標題：${job.title || "(未命名)"}`,
    `狀態：${job.status}`,
    `模式：${job.executionMode ?? "main"}${job.branchName ? ` · ${job.branchName}` : ""}${job.worktreePath ? ` · ${pathTail(job.worktreePath)}` : ""}`,
    `目前步驟：${job.currentStep ?? "(尚無)"}${job.queuePosition ? ` · 排隊第 ${job.queuePosition}${job.queueReason ? ` (${job.queueReason})` : ""}` : ""}`,
    `待處理：${job.pendingDecision ?? "(無)"} · 檔案：${job.changedFiles?.length ?? 0} · 產物：${job.artifactCount ?? 0}`,
    `來源聊天：${job.chatId}`,
    `Codex thread：${job.threadId ?? "尚未建立"}`,
    `最近事件：${job.lastEventAt ?? "-"} · 更新：${job.updatedAt ?? "-"}${job.deliveryStatus === "delivery_degraded" ? " · delivery_degraded" : ""}`,
    `結果：${job.resultSummary ?? job.lastResult ?? "(尚無)"}`,
  ].join("\n");
}

/**
 * Details are intentionally a compact, action-oriented view. Raw Codex event
 * payloads stay in the local store; only the useful command/plan/diff/test
 * hints are rendered for a phone-sized Teams message.
 */
export function formatTaskDetails(events: Array<{ seq: number; kind: string; payload: unknown }>): string {
  const lines: string[] = [];
  for (const event of events.slice(-12)) {
    const payload = event.payload != null && typeof event.payload === "object"
      ? event.payload as Record<string, unknown>
      : {};
    const item = payload.item != null && typeof payload.item === "object"
      ? payload.item as Record<string, unknown>
      : payload;
    const type = typeof item.type === "string" ? item.type : "";
    if (type.toLowerCase() === "commandexecution" || event.kind.includes("command")) {
      const command = typeof item.command === "string" ? item.command : typeof payload.command === "string" ? payload.command : "(命令)";
      const exitCode = typeof item.exitCode === "number" ? ` · exit ${item.exitCode}` : "";
      lines.push(`命令：${command}${exitCode}`);
    } else if (event.kind.includes("plan")) {
      const plan = Array.isArray(payload.plan) ? payload.plan : undefined;
      lines.push(`計畫：${plan?.length ? `${plan.length} 個步驟` : "已更新"}`);
    } else if (event.kind.includes("diff") || type.toLowerCase() === "filechange") {
      const diff = typeof payload.diff === "string" ? payload.diff.split("\n").filter(Boolean).length : 0;
      lines.push(`Diff：${diff ? `${diff} 行` : "已更新"}`);
    } else if (event.kind === "item/completed" && (type.toLowerCase() === "agentmessage" || typeof item.text === "string")) {
      const text = typeof item.text === "string" ? item.text : "(訊息)";
      lines.push(`Codex：${text.slice(0, 180)}`);
    } else {
      lines.push(`${event.seq}. ${event.kind}`);
    }
  }
  return `\n最近事件：\n${lines.length ? lines.join("\n") : "(無)"}`;
}

function pathTail(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || cwd;
}

export function formatProjects(projects: ProjectRegistry, allowedProjectIds?: ReadonlySet<string>): string {
  const rows = projects.all().filter((project) => !allowedProjectIds || allowedProjectIds.has(project.projectId)).map((project) => {
    const aliases = (project.aliases ?? []).join(", ") || "-";
    const branch = project.defaultBranch ?? "default";
    const execution = project.executionPolicy ?? "read-only";
    const lane = project.lanePolicy ?? "single-active";
    const repository = project.repository ? ` · repo: ${project.repository}` : "";
    const bindings = project.conversationBindings?.length ? ` · chats: ${project.conversationBindings.length}` : "";
    const used = project.lastUsedAt ? ` · used: ${project.lastUsedAt}` : "";
    return `• ${project.name} (${project.projectId}) · ${pathTail(project.cwd)} · ${branch} · ${execution} · ${lane}${repository}${bindings}${used} · aliases: ${aliases}`;
  });
  return `[TB] 專案\n${rows.join("\n") || "(無已登記專案)"}`;
}
