// Desktop status page renderer (architecture §5). Shows each job with its status and
// per-conversation connection state. Pure function -> unit-testable; the Electron
// console loads the produced HTML.

export interface StatusJob {
  jobId: string;
  status: string;
  projectId: string;
  chatId: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderStatusHtml(jobs: StatusJob[]): string {
  const rows = jobs
    .map(
      (j) =>
        `<li class="job" data-job-id="${esc(j.jobId)}">` +
        `${esc(j.jobId)} · ${esc(j.projectId)} · ${esc(j.status)} · ${esc(j.chatId)}</li>`,
    )
    .join("");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>TeamBot</title></head>` +
    `<body><h1>TeamBot 控制台</h1>` +
    `<ul id="jobs">${rows}</ul>` +
    `<p id="count" data-count="${jobs.length}">jobs: ${jobs.length}</p>` +
    `</body></html>`
  );
}
