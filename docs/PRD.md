# TeamBot PRD(改版 v2)

日期:2026-09-24。狀態:實作中,核心端到端已跑通。參考:`docs/product-brainstorm.md`、`docs/architecture.md`;借鏡開源 `telecodex`(Telegram↔本機 Codex,MIT)的會話/串流/ACL/附件設計。

## 1. 一句話

**TeamBot 讓你用手機 Microsoft Teams,遠端操作電腦上的常駐 Codex CLI**:交辦任務、持續收到進度、在需要時做決策,結果與產物回傳到同一對話。

## 2. 目標使用者與情境

離開電腦的開發者/個人助理使用者,想從手機:交辦工作、看長任務進度、批准危險操作、取回結果與產物。核心資料區為 `D:\AgentHub`(個人助理工作區)。

## 3. 核心概念(借鏡 telecodex 並調整為 Teams)

| 概念 | 說明 |
|---|---|
| 常駐 Codex 工作階段 | 單一持久 thread 執行於 `D:\AgentHub`,重啟以 `thread/resume` 接回(對話連續)。 |
| 會話對應 | 每個 Teams 對話(自己聊天/群組/未來 topic)對應一個邏輯 session;各自綁定一個 Codex thread。 |
| 每會話佇列 | 一次一個 active turn;執行中的純文字訊息以 `turn/steer` 追加;帶附件的訊息排入下一輪。 |
| 執行姿態 | 預設 read-only;`unlock` 時限切 workspace-write(寫入限 AgentHub、拒網路);`lock`/`kill`。 |

## 4. 三大互動場景(來自 brainstorm,產品需求)

### 4.1 結果回報
- 一輪的**權威結果**:取 `final_answer`(忽略 commentary/deltas),彙整**檔案變更清單**(`turn/diff/updated`)與**執行指令**;兩段式訊息(一行結論 + 細節);同一 turn 冪等只回一次。

### 4.2 持續狀態(長任務)
- coalescer 單一寫入者、**就地編輯狀態卡**、≤1/間隔且有變才更新(借鏡 telecodex `edit_debounce_ms`);長輸出**分段**(借鏡 `max_text_chunk`);**心跳**區分卡住/長跑;`!tb status` 隨時拉快照;Teams 送出遇限流退避(借鏡 `retry_after`)。

### 4.3 決策點
- 批准/選項/補充資訊各有**代碼**並繫結 requestId;多待決各自代碼;逾時**暫停/自動拒絕**(絕不自動批);中途 `turn/steer` 轉向;危險操作導到自己聊天。

## 5. 指令模型(`!tb` 或 `@tb`,全形容錯;`!tb <自然語言>` 預設 AgentHub)

| 指令 | 作用 | 狀態 |
|---|---|---|
| `run <專案> <內容>` / `<自然語言>` | 交辦(預設 AgentHub) | ✅ |
| `status` | 目前狀態快照 | ✅ |
| `result` / `diff` / `files` | 結果 / 變更 / 產物清單 | 部分 |
| `continue` / `steer <內容>` | 續輪 / 中途追加 | 引擎✅、指令待接 |
| `stop` / `kill` | 收尾停 / 硬停 | ✅ |
| `approve <碼>` / `deny <碼>` / `answer <碼> <值>` | 決策 | ✅ |
| `unlock [分] / lock` | 切換寫入姿態 | ✅ |
| `use <thread|latest>` / `new [標題]` / `sessions` / `history` | 切換/開新/列出/瀏覽 session(借鏡 telecodex) | 規劃 |
| `login` / `logout` | Codex 裝置登入(借鏡 telecodex) | 規劃 |
| `help` | 說明 | ✅ |

## 6. 借鏡 telecodex 的新增需求(roadmap v2)

| # | 需求 | 借鏡點 |
|---|---|---|
| H | **串流回覆就地編輯**:狀態/回覆用單一訊息編輯 + debounce + 分段 + 限流退避 | edit_debounce_ms / max_text_chunk / retry_after |
| I | **多會話 / 切換 thread**:`use latest`、`sessions`、`new`;每會話一 session | topic-aware sessions、`/use` |
| J | **附件 in/out**:`.teambot/inbox` 收檔、`turns/out` 回傳產物 | attachment inbox / artifacts |
| K | **歷史匯入 / 綁定既有 thread**:以 cwd 匯入 Codex 歷史 | import history by cwd、`/use` |
| L | **Codex 裝置登入**:`!tb login`/`logout`,未登入不啟動 turn | headless device login |
| M | **語音轉文字**(選用):附件語音轉逐字後併入 prompt | transcribe-rs + ffmpeg |
| N | **ACL 角色**:allowed/admin/user + audit_log(已有 allowlist,擴為角色) | SQLite ACL |
| O | **設定檔驅動**:sandbox/approval/writable dirs/model 預設 | telecodex.toml |

## 7. 架構(與 telecodex 的關鍵差異)

- telecodex 用 **Telegram 官方 Bot API**(long polling)——乾淨、合規。
- Teams **沒有等效的簡單個人 bot 長輪詢**,故 TeamBot 採 **Electron 自有 WebContentsView + Playwright/CDP** 操作 Teams 網頁(§9);這帶來**條款/自動化風險**(架構 §10),長期宜評估官方 **Graph API / Bot Framework**(保留 transport 介面以便替換)。
- 兩者共通:本機常駐 Codex、SQLite 狀態/ACL、per-session、串流回覆、附件、沙箱/批准策略。

```text
手機 Teams ↔ Teams 雲端 ↔ Electron 自有 Teams 表面 ──CDP── TeamBot 常駐服務
                                                              ↕ stdio(app-server)
                                                        常駐 Codex 工作階段 @ D:\AgentHub
                                                              ↕
                                                    專案檔案 / 指令(受沙箱+批准約束)
```

## 8. 安全(MUST)

預設 read-only;`unlock` 時限寫入(限 AgentHub、拒網路);破壞性/網路/機密/提權**永遠需批准**;對外訊息與日誌**去識別**;owner 以不可變 sender id 授權,危險操作導自己聊天;`kill` + 閒置自動 suspend;附加式稽核。條款風險需使用者知情。

## 9. 現況與非目標

- **已完成(27 task,全套測試 136/136)**:Phase 0 GO(真實租戶)、CDP 傳輸、常駐 session、`!tb`/`@tb`、預設 AgentHub、安全姿態、結果彙整、狀態模型、批准註冊表、resume 復原、多任務 worktree(選用);整合進常駐 runner 並實測(接收→執行→彙整回報→批准→重啟 resume)。
- **非目標(首版)**:官方 Teams 傳輸遷移、跨組織多租戶、非 AgentHub 的自由寫入預設。

## 10. 成功指標

手機交辦後:數秒內 ACK;長任務有可讀進度;危險操作必經批准;結果含變更摘要;重啟不重跑歷史、不回錯對話;無秘密外洩。
