// TeamBot desktop console — Electron main (architecture §5/§7).
// - Registers project profiles in the user's data directory.
// - Shows a status window and keeps it alive in the tray when closed.
// - Explicit quit drains running jobs before exiting.
//
// Run:   npx electron launcher/electron/console-main.cjs
// Smoke: npx electron launcher/electron/console-main.cjs --smoke
"use strict";

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require("electron");
const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { dirname, isAbsolute, join, normalize, basename } = require("node:path");

app.setName("TeamBot");

const SMOKE = process.argv.includes("--smoke");
const DRAIN_TIMEOUT_MS = SMOKE ? 3000 : 15000;
const PRELOAD = join(__dirname, "console-preload.cjs");

let win = null;
let tray = null;
let quitting = false;

let running = SMOKE ? ["T001"] : [];
function getRunningJobIds() {
  return running.slice();
}

function configPath() {
  if (process.env.TEAMBOT_PROJECTS_FILE?.trim()) return process.env.TEAMBOT_PROJECTS_FILE.trim();
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  return base ? join(base, "TeamBot", "projects.json") : join(app.getPath("userData"), "projects.json");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function profileArray(value) {
  const profiles = Array.isArray(value) ? value : value && Array.isArray(value.projects) ? value.projects : null;
  if (!profiles || profiles.length === 0) throw new Error("project config must contain a non-empty projects array");
  const aliases = new Map();
  const projectIds = new Set();
  return profiles.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid project profile");
    const projectId = String(raw.projectId ?? "").trim();
    const cwd = String(raw.cwd ?? "").trim();
    if (!projectId) throw new Error("projectId is required");
    if (projectIds.has(projectId.toLowerCase())) throw new Error(`duplicate projectId: ${projectId}`);
    projectIds.add(projectId.toLowerCase());
    if (!cwd || !(isAbsolute(cwd) || /^[A-Za-z]:[\\/]/.test(cwd) || /^\\\\/.test(cwd))) {
      throw new Error(`project ${projectId} needs an absolute cwd`);
    }
    const profile = {
      ...raw,
      projectId,
      name: String(raw.name ?? projectId).trim() || projectId,
      cwd: normalize(cwd),
      aliases: [...new Set((Array.isArray(raw.aliases) ? raw.aliases : []).map((a) => String(a).trim()).filter(Boolean))],
    };
    for (const key of [profile.projectId, profile.name, ...profile.aliases]) {
      const folded = key.toLowerCase();
      const owner = aliases.get(folded);
      if (owner && owner !== projectId) throw new Error(`project alias collision: ${key}`);
      aliases.set(folded, projectId);
    }
    return profile;
  });
}

function readProjects() {
  const inline = process.env.TEAMBOT_PROJECTS_JSON?.trim();
  if (inline) return profileArray(JSON.parse(inline));
  const path = configPath();
  if (!existsSync(path)) return [];
  return profileArray(JSON.parse(readFileSync(path, "utf8")));
}

function saveProjects(value) {
  if (process.env.TEAMBOT_PROJECTS_JSON?.trim()) {
    throw new Error("TEAMBOT_PROJECTS_JSON overrides the desktop file; clear it before saving profiles");
  }
  const projects = profileArray(value);
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
  return projects;
}

function pathTail(cwd) {
  const normalized = String(cwd).replace(/[\\/]+$/, "");
  return basename(normalized) || normalized;
}

function projectCards(projects) {
  if (!projects.length) return `<p class="empty" id="projects-empty">尚未登記專案。請在下方新增第一個專案。</p>`;
  return projects.map((project) =>
    `<article class="project" data-project-id="${esc(project.projectId)}">` +
      `<h3>${esc(project.name)} <code>${esc(project.projectId)}</code></h3>` +
      `<p>${esc(pathTail(project.cwd))} · ${esc(project.defaultBranch || "default")} · ${esc(project.executionPolicy || "read-only")}</p>` +
      `<p class="muted">repo：${esc(project.repository || "未設定")} · lane：${esc(project.lanePolicy || "single-active")} · 通知：${esc(project.notificationPolicy || "important")}</p>` +
      `<p class="muted">別名：${esc((project.aliases || []).join(", ") || "無")} · 允許聊天：${esc((project.conversationBindings || []).length || "全部已配對聊天")}</p>` +
      `<button type="button" class="edit-project" data-project-id="${esc(project.projectId)}">編輯</button> ` +
      `<button type="button" class="remove-project" data-project-id="${esc(project.projectId)}">移除</button>` +
    `</article>`,
  ).join("");
}

function statusHtml(projects) {
  const cards = projectCards(projects);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TeamBot 控制台</title>
  <style>body{font:15px system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#17202a;background:#f7f8fa}h1{margin:0 0 4px}h2{margin-top:28px}.muted,.hint{color:#5d6d7e}.project{background:#fff;border:1px solid #dfe6ee;border-radius:10px;padding:14px;margin:10px 0}.project h3{margin:0 0 6px}.project p{margin:5px 0}.project code{font-size:12px}.card{background:#fff;border:1px solid #dfe6ee;border-radius:10px;padding:16px;margin-top:16px}label{display:block;margin:10px 0 4px;font-weight:600}input,select{box-sizing:border-box;width:100%;padding:8px;border:1px solid #b9c5d1;border-radius:6px}button{padding:7px 11px;border:1px solid #9aa8b5;border-radius:6px;background:#fff;cursor:pointer}button[type=submit]{background:#1769aa;color:#fff;border-color:#1769aa;margin-top:14px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.row{grid-template-columns:1fr}}#message{margin-left:10px}.empty{padding:12px;background:#fff;border-radius:8px}</style></head><body>
  <header><h1>TeamBot 控制台</h1><p id="state">running</p><p class="hint">手機只能選擇這裡登記的專案；絕對路徑只保留在本機設定檔。</p></header>
  <section aria-labelledby="projects-heading"><h2 id="projects-heading">專案</h2><div id="project-list">${cards}</div></section>
  <section class="card" aria-labelledby="register-heading"><h2 id="register-heading">登記／編輯專案</h2><p class="hint">路徑必須是本機絕對路徑。儲存後重新啟動 TeamBot runtime 才會套用設定。</p>
    <form id="project-form"><input type="hidden" id="original-project-id"><label for="project-id">Project ID</label><input id="project-id" required placeholder="TeamBot"><div class="row"><div><label for="project-name">顯示名稱</label><input id="project-name" placeholder="TeamBot"></div><div><label for="project-aliases">別名（逗號分隔）</label><input id="project-aliases" placeholder="tb, teambot"></div></div><label for="project-cwd">本機絕對路徑</label><input id="project-cwd" required placeholder="D:\\workspace\\GitBank\\GitRin\\TeamBot"><div class="row"><div><label for="project-repository">Repository（可選）</label><input id="project-repository" placeholder="RinRyanJi/TeamBot"></div><div><label for="project-branch">預設分支</label><input id="project-branch" placeholder="main"></div></div><div class="row"><div><label for="project-policy">權限姿態</label><select id="project-policy"><option value="read-only">read-only</option><option value="workspace-write">workspace-write</option><option value="danger-full-access">danger-full-access</option></select></div><div><label for="project-lane">工作 lane</label><select id="project-lane"><option value="single-active">single-active</option><option value="worktree-fork">worktree-fork</option></select></div></div><div class="row"><div><label for="project-notification">通知層級</label><select id="project-notification"><option value="quiet">quiet</option><option value="important" selected>important</option><option value="all-decisions">all-decisions</option></select></div><div><label for="project-bindings">允許聊天 ID（逗號分隔，可選）</label><input id="project-bindings" placeholder="self-chat-id, group-chat-id"></div></div><button type="submit">儲存專案</button><button type="button" id="clear-form">清除表單</button><span id="message" role="status"></span></form></section>
  <section class="card"><h2>工作</h2><ul id="jobs"></ul><p id="count" data-count="0">jobs: 0</p></section>
  <script>
  (()=>{const bridge=window.teamBot;let projects=${JSON.stringify(projects).replace(/</g,"\\u003c")};const byId=id=>document.getElementById(id);const msg=text=>{byId('message').textContent=text};
  const escapeHtml=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');const pathTail=v=>String(v||'').replace(/[\\/]+$/,'').split(/[\\/]/).pop()||String(v||'');
  const render=()=>{byId('project-list').innerHTML=projects.length?projects.map(p=>'<article class="project" data-project-id="'+escapeHtml(p.projectId)+'"><h3>'+escapeHtml(p.name||p.projectId)+' <code>'+escapeHtml(p.projectId)+'</code></h3><p>'+escapeHtml(pathTail(p.cwd))+' · '+escapeHtml(p.defaultBranch||'default')+' · '+escapeHtml(p.executionPolicy||'read-only')+'</p><p class="muted">repo：'+escapeHtml(p.repository||'未設定')+' · lane：'+escapeHtml(p.lanePolicy||'single-active')+' · 通知：'+escapeHtml(p.notificationPolicy||'important')+'</p><p class="muted">別名：'+escapeHtml((p.aliases||[]).join(', ')||'無')+' · 允許聊天：'+escapeHtml((p.conversationBindings||[]).length||'全部已配對聊天')+'</p><button type="button" class="edit-project" data-project-id="'+escapeHtml(p.projectId)+'">編輯</button> <button type="button" class="remove-project" data-project-id="'+escapeHtml(p.projectId)+'">移除</button></article>').join(''):'<p class="empty" id="projects-empty">尚未登記專案。請在下方新增第一個專案。</p>';bindButtons()};
  const clear=()=>{byId('original-project-id').value='';byId('project-form').reset();byId('project-policy').value='read-only';byId('project-lane').value='single-active';byId('project-notification').value='important';msg('')};const edit=id=>{const p=projects.find(x=>x.projectId===id);if(!p)return;byId('original-project-id').value=p.projectId;byId('project-id').value=p.projectId;byId('project-name').value=p.name||'';byId('project-aliases').value=(p.aliases||[]).join(', ');byId('project-cwd').value=p.cwd;byId('project-repository').value=p.repository||'';byId('project-branch').value=p.defaultBranch||'';byId('project-policy').value=p.executionPolicy||'read-only';byId('project-lane').value=p.lanePolicy||'single-active';byId('project-notification').value=p.notificationPolicy||'important';byId('project-bindings').value=(p.conversationBindings||[]).join(', ');window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})};
  const bindButtons=()=>{document.querySelectorAll('.edit-project').forEach(b=>b.onclick=()=>edit(b.dataset.projectId));document.querySelectorAll('.remove-project').forEach(b=>b.onclick=async()=>{const id=b.dataset.projectId;if(!confirm('移除 '+id+'？'))return;try{projects=await bridge.saveProjects(projects.filter(p=>p.projectId!==id));render();msg('已儲存，重啟 runtime 後生效。')}catch(e){msg(e.message||String(e))}})};
  byId('project-form').addEventListener('submit',async e=>{e.preventDefault();const profile={projectId:byId('project-id').value.trim(),name:byId('project-name').value.trim(),aliases:byId('project-aliases').value.split(',').map(x=>x.trim()).filter(Boolean),cwd:byId('project-cwd').value.trim(),repository:byId('project-repository').value.trim()||undefined,defaultBranch:byId('project-branch').value.trim()||undefined,executionPolicy:byId('project-policy').value,lanePolicy:byId('project-lane').value,notificationPolicy:byId('project-notification').value,conversationBindings:byId('project-bindings').value.split(',').map(x=>x.trim()).filter(Boolean)};const old=byId('original-project-id').value;const next=projects.filter(p=>p.projectId!==old&&p.projectId!==profile.projectId);try{projects=await bridge.saveProjects([...next,profile]);render();clear();msg('已儲存，重啟 runtime 後生效。')}catch(e){msg(e.message||String(e))}});byId('clear-form').onclick=clear;bindButtons();
  })();</script></body></html>`;
}

async function drainRunning() {
  const start = Date.now();
  while (getRunningJobIds().length > 0 && Date.now() - start < DRAIN_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return { drained: getRunningJobIds().length === 0, waitedMs: Date.now() - start };
}

async function explicitQuit() {
  quitting = true;
  const res = await drainRunning();
  if (!SMOKE) app.quit();
  return res;
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("TeamBot");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Show", click: () => win && win.show() },
      { label: "Quit TeamBot", click: () => explicitQuit() },
    ]));
    return true;
  } catch {
    return false;
  }
}

app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  let projects = [];
  try {
    projects = readProjects();
  } catch (error) {
    console.error(`PROJECT_CONFIG_ERROR ${error instanceof Error ? error.message : String(error)}`);
  }
  ipcMain.handle("projects:list", (event) => {
    if (!win || event.sender !== win.webContents) throw new Error("invalid console sender");
    return readProjects();
  });
  ipcMain.handle("projects:save", (event, value) => {
    if (!win || event.sender !== win.webContents) throw new Error("invalid console sender");
    return saveProjects(value);
  });
  win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 800,
    webPreferences: { preload: PRELOAD, nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(statusHtml(projects)));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  const trayCreated = createTray();

  if (!SMOKE) return;

  win.show();
  const visibleBefore = win.isVisible();
  win.close();
  const hiddenAfterClose = !win.isVisible();
  const aliveAfterClose = !win.isDestroyed();
  const ui = await win.webContents.executeJavaScript("({hasRegistrationForm: !!document.querySelector('#project-form'), hasProfileFields: ['#project-repository','#project-lane','#project-notification','#project-bindings'].every((selector) => !!document.querySelector(selector)), projectCount: document.querySelectorAll('#project-list .project').length})");
  setTimeout(() => { running = []; }, 300);
  const drain = await explicitQuit();
  const result = { visibleBefore, hiddenAfterClose, aliveAfterClose, trayCreated, drained: drain.drained, waitedMs: drain.waitedMs, ...ui };
  console.log("CONSOLE_MAIN_RESULT " + JSON.stringify(result));
  app.exit(hiddenAfterClose && aliveAfterClose && drain.drained && drain.waitedMs >= 250 && ui.hasRegistrationForm && ui.hasProfileFields ? 0 : 2);
});
