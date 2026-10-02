# TeamBot PRD v4 — 手機上的 Codex 工作控制台

日期：2026-10-03。狀態：產品規格重整，作為後續 UX 與多專案實作的優先依據。

v3 已驗證許多底層管線，但它仍以「一個常駐 AgentHub 工作階段」為產品中心。當使用者同時維護 TeamBot、Codex Web、韌體和其他專案時，這個模型會讓人必須記住專案名稱、job ID、thread、佇列位置和批准代碼；出錯時最危險的結果是工作送進了看似合理、實際錯誤的專案。

v4 的核心改變是：**TeamBot 不是把 Terminal 縮小到手機，而是把手機變成 Codex 的控制平面。** 程式碼與命令仍在電腦執行；手機只負責選擇工作上下文、提出要求、看懂狀態、做必要決策和取得結果。

Codex app-server 官方文件把 thread、turn、item 和串流事件作為整合的基本單位，並提供 `thread/start`、`thread/resume`、`turn/start`、`turn/steer`、`turn/interrupt`、批准請求與 `turn/plan/updated` 等能力。TeamBot 以這些能力建立自己的產品語意，不把 Teams 訊息直接當成 shell 命令。[Codex app-server 官方文件](https://learn.chatgpt.com/docs/app-server)

## 1. 產品承諾

使用者在手機 Teams 中可以：

- 清楚知道目前有哪些專案、每個專案正在做什麼，以及哪個工作需要自己處理。
- 用一句自然語言交辦工作，不必每次重述專案路徑或歷史上下文。
- 同時管理不同專案；不同專案可在明確資源上限內並行，同一專案不會被兩項工作悄悄互相覆蓋。
- 在手機上完成低風險決策，在高風險或需要大量檢視時，順利交接回桌面。
- 在 Teams 斷線、電腦睡眠、Codex 重啟或工作失敗後，知道發生了什麼，且不會因不確定而自動重跑副作用。

## 2. 目標使用者與工作

| 使用者 | 工作 | 成功感受 |
|---|---|---|
| 個人維護者 | 外出時處理多個 repo 的小修正、測試和查詢 | 不用跑回電腦，也不會把要求送錯 repo |
| 多專案開發者 | 在 A 專案等待測試時交辦 B 專案 | 看得到 A/B 的佇列與資源狀態，不必記住內部 ID |
| 審核／批准者 | 從手機判斷某個命令或檔案變更是否可放行 | 看到具體專案、任務、命令、路徑和影響範圍 |
| 群組協作者 | 在指定 Teams 群組查看共同工作的摘要 | 不會看到不該看的私有輸出，也不會替別人批准 |
| 回到桌面的開發者 | 接續手機上已完成一半的工作 | 能用同一個 Codex thread、專案和 worktree 接手 |

## 3. 使用者心智模型

```text
Project（專案）
  └─ Task（使用者想完成的一件事）
       └─ Session（持續的 Codex thread）
            └─ Turn（一次要求及其執行）
                 └─ Items（計畫、命令、檔案變更、批准、結果）
```

這四層不可混用：

- Project 是「在哪裡工作」，由桌面端登記的名稱和正規化路徑代表。手機不能提交任意 `cwd`。
- Task 是「要完成什麼」，有穩定的人類可讀短碼，例如 `TB-API-7K2`。
- Session 是「這項工作保留哪些對話上下文」，通常一項長工作一個 Codex thread。
- Turn 是「這次送給 Codex 的要求」，可完成、失敗、被中止或等待決策。

TeamBot 顯示給使用者的是 Project 名稱、Task 短碼和目前狀態；threadId、turnId、requestId 只在交接、診斷或批准細節中出現。

## 4. 多專案產品模型

### 4.1 Project Profile

桌面端每個專案保存：

| 欄位 | 用途 |
|---|---|
| `projectId` | 不變的內部識別碼 |
| `name` | 手機顯示名稱，例如「TeamBot」 |
| `aliases` | 可接受的簡短稱呼，例如 `tb`、`teambot` |
| `cwd` | 正規化絕對路徑；不由手機輸入 |
| `repository` | remote、預設分支、是否為 Git repo |
| `executionPolicy` | read-only、workspace-write、批准策略、網路策略 |
| `lanePolicy` | 主工作區是否可並行、worktree 根目錄與上限 |
| `notificationPolicy` | quiet、important、all-decisions |
| `conversationBindings` | 哪些自己聊天／群組可使用此專案 |
| `lastUsedAt` | 最近使用時間，用於排序與預設建議 |

專案卡片必須顯示路徑尾段、分支、工作區模式和權限姿態；不能只顯示一個容易重名的短字串。兩個專案顯示名稱重複時，桌面端必須要求修正，不能靠猜。

### 4.2 Task Profile

每項工作保存：

```text
taskId, title, projectId, sourceConversation, requester
session/threadId, activeTurnId, executionMode
status, queuePosition, currentStep, lastEventAt
pendingDecision, changedFiles, artifactCount, resultSummary
createdAt, updatedAt, notificationPolicy
```

`title` 由使用者要求產生簡短摘要，使用者可用 `rename` 修改。狀態卡一定同時顯示專案和 taskId，例如：

```text
[TB-API-7K2 · TeamBot] ⏳ 執行中
測試登入流程 · 第 2/4 步 · 最近活動 14:07
```

### 4.3 工作區與並行規則

1. 同一 Project 的主工作區同時只允許一個 active turn。
2. 不同 Project 可依全域 `maxConcurrent` 並行；預設仍以資源與安全為主，桌面端可明確提高上限。
3. 同一 Project 要並行，必須使用 TeamBot 建立的 Git worktree，且狀態卡明示 `worktree/<taskId>`。
4. 專案排隊不是全域黑箱：每次排隊立即回報「前面有哪些專案／工作、為何等待、可用 `cancel` 哪一項」。
5. `focus` 只改變手機目前查看的專案，不會停止、切換或竄改正在執行的 task。
6. 若工作需要合併回主分支，TeamBot 顯示「待合併」而非假裝已完成；合併、push、部署仍是明確決策。

## 5. 對話與上下文

### 5.1 自己聊天

自己聊天提供個人控制台語意：

- 可設定一個 active project；沒有 active project 且候選超過一個時，TeamBot 必須先詢問，不猜。
- `run` 首次可帶專案，後續可省略；所有回報保留 project 名稱。
- TeamBot 的回報以 `[TB]` 事件標記，不能再次被 parser 當成要求。
- 私人工作、批准詳情和完整 diff 可在自己聊天查看；不自動轉發到群組。

### 5.2 指定群組

群組是協作控制台，不是私人 Terminal：

- 群組綁定可使用的 Project 清單和成員角色。
- 群組內第一次交辦必須明示專案，或使用該群組已設定的 active project；模糊要求拒絕並顯示選項。
- 群組只顯示摘要、狀態和可分享的產物；完整敏感輸出導向發起人的自己聊天。
- 啟動、查詢、追加、停止、批准依角色和工作發起人判斷；引用或轉發的作者不繼承權限。

### 5.3 上下文有效期限

active project 不是永久隱性狀態。切換後的有效期限與範圍必須可見：

```text
目前專案：TeamBot（只對此聊天有效，最近使用 18 分鐘前）
```

若超過設定時間、專案設定變更、或上一項工作在不同 project，下一次省略專案的 `run` 先回覆確認卡，不直接執行。

## 6. 手機操作語言

命令短、可讀、可複製；自然語言只在上下文唯一時省略細節。

| 操作 | 首選語法 | 行為 |
|---|---|---|
| 看總覽 | `!tb overview` / `!tb ?` | 按專案分組列出執行中、待決、排隊和最近完成 |
| 看專案 | `!tb projects` | 顯示名稱、別名、分支、權限、目前工作 |
| 設定焦點 | `!tb focus TeamBot` | 只設定此聊天的 active project |
| 開始工作 | `!tb run TeamBot 修正登入錯誤並測試` | 建立 task，回覆短碼與佇列位置 |
| 省略專案交辦 | `!tb run 修正剛才的型別錯誤` | 只在 active project 唯一有效時執行 |
| 看任務 | `!tb task TB-API-7K2` | 顯示一屏摘要；不展開完整事件流 |
| 看細節 | `!tb task TB-API-7K2 details` | 展開計畫、最近命令、檔案變更、測試 |
| 重新命名 | `!tb rename TB-API-7K2 登入測試修正` | 修改手機顯示的 task 標題，不改變 Project、thread 或執行內容 |
| 查看變更 | `!tb diff TB-API-7K2` / `files` / `artifact` | 只回傳已儲存的 diff 摘要、檔案清單或產物摘要 |
| 追加要求 | `!tb add TB-API-7K2 優先處理 Windows` | 送入同一 thread 的下一個 turn |
| 中途轉向 | `!tb steer TB-API-7K2 改跑單元測試` | 使用 `turn/steer`，只接受明確 task |
| 新建平行工作 | `!tb fork TB-API-7K2 做相容性修正` | 建立 worktree，回覆新 task 和隔離路徑 |
| 觀察／靜音 | `!tb watch TB-API-7K2` / `mute` | 設定此 task 的回報層級，不影響執行 |
| 停止 | `!tb stop TB-API-7K2` | 優雅中止 active turn，完成後回報真正狀態 |
| 硬停 | `!tb kill TB-API-7K2` | 立即停止持有的程序，標記需要核對 |
| 取消排隊 | `!tb cancel TB-API-7K2` | 只取消尚未開始的工作 |
| 批准／拒絕 | `ok A2` / `no A2` | 綁定 task、turn、request 和使用者，一次性使用 |
| 交接 | `!tb handoff TB-API-7K2` | 回傳 thread、分支、worktree、改檔和桌面接手步驟 |

`!tb status` 保留為 `overview` 的別名；不再要求使用者先記住哪一個 job ID 才能知道系統是否有工作。短碼可點選或複製時優先使用 Teams 原生互動；若 Teams DOM 不支援，維持純文字退路。

## 7. 三種回報層級

### 7.1 總覽卡

`overview` 一屏完成分流：

```text
TeamBot · 目前 3 個專案
⏳ TeamBot      TB-API-7K2  測試中       2m
❓ CodexWeb     TB-WEB-19   等待批准 A1  需你處理
⏸ Firmware     TB-FW-04    排隊第 2      前面 TeamBot
✅ Docs         TB-DOC-11   已完成        18m 前
```

每列可用短碼進一步查詢；總覽不塞入命令輸出或模型長文。

### 7.2 任務狀態卡

狀態卡只呈現使用者能採取行動的資訊：目前步驟、最近活動、是否等待、檔案數、測試摘要、下一個建議。Plan 和 diff 來自 app-server 事件；沒有可計算的百分比時不得製造百分比或 ETA。

### 7.3 結果與產物

完成回報先給結論，再提供 `details`、`diff`、`files`、`artifact`。結果必須說明：成功／失敗／中止、影響的 Project/Task、變更檔案、測試、未完成事項和下一步。附件或產物保存於 task 的 outbox，送出狀態不明時不重複產生副作用。

## 8. 通知設計

通知是每個 Project/Task 的設定，不是全域固定值：

| 層級 | 會收到新訊息的事件 |
|---|---|
| quiet | 完成、失敗、需要使用者決策、離線／恢復 |
| important | quiet + 卡住警告、排隊時間過長、產物可用 |
| all-decisions | important + 每個批准／問題 |

進度優先就地編輯狀態卡；若 Teams 編輯不可用或會造成推播，退回低頻 `overview` 拉取和完成／失敗／待決新訊息。不可把「編輯不推播」當成未驗證的產品承諾。

## 9. 決策與批准體驗

批准卡必須同時顯示 Project、Task、Turn、動作、cwd、影響範圍和失效時間。手機只需在單一待決時輸入 `ok`；多個待決要求代碼。批准代碼綁定 `(taskId, threadId, turnId, requestId, chatId, senderId)` 且一次性。

高風險操作的詳細內容不在群組公開；群組顯示「某 task 等待發起人處理」，細節導向自己的聊天。逾時一律拒絕或保持暫停，不自動放行。這符合 OpenAI 官方對批准邊界、明確審查和最小權限的建議。[Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)

## 10. 失敗、斷線與恢復

使用者看到的狀態必須區分：

```text
queued → starting → running → waiting_for_you
                         ├──────→ completed
                         ├──────→ failed
                         └──────→ stopping → cancelled / needs_reconciliation
Teams offline / Codex disconnected → delivery_degraded / execution_unknown
```

- Teams 收不到時，任務仍可繼續的條件和暫存回報清楚顯示；需要批准時保持等待。
- Codex 程序重啟後以 `thread/resume` 恢復；不能確認 active turn 是否已執行時標記 `needs_reconciliation`，不盲目重跑。
- 電腦重新上線後，先發一則離線摘要：離線區間、已確認事件、未確認訊息、需要使用者重送的命令。
- 任何回報都帶 Project + Task 短碼，避免多專案恢復後回錯對話。

## 11. 資料模型與不變條件

新增或調整的核心關聯：

```text
projects(projectId, name, cwd, policy, lanePolicy, notificationPolicy)
conversation_context(chatId, activeProjectId, expiresAt)
tasks(taskId, projectId, threadId, sourceChatId, requesterId, executionMode, status)
turns(taskId, turnId, sequence, status, lastEventAt)
approvals(taskId, turnId, requestId, code, requesterId, expiresAt, status)
artifacts(taskId, path, kind, hash, deliveryStatus)
```

必要不變條件：

1. 任務只能指向已登記 Project，不能由 Teams 訊息改寫 cwd。
2. 每個 active turn 只能有一個 Task、Project 和來源對話。
3. 同一 `(chatId, messageId)` 只建立一次 inbox 事件。
4. `status`, `add`, `stop`, `approve` 若缺少唯一 task 上下文，必須詢問或拒絕，不猜測最近工作。
5. 專案並行一定有可追蹤的 lane/worktree；不能兩項任務共用同一主工作區而沒有明示鎖。
6. outbox 以事件或 task kind 做冪等鍵；送出狀態不明時只核對，不盲目重貼。

## 12. 使用者成功指標

| 指標 | 目標 |
|---|---|
| 使用者從總覽找到正確 task 的時間 | ≤ 10 秒 |
| 省略專案時送錯專案 | 0；有歧義必須先詢問 |
| 新工作 ACK | 中位數 ≤ 5 秒；離線則明確顯示不可接單 |
| 多專案 overview 閱讀量 | 一屏看懂最多 8 個工作 |
| `status` 為了找工作而輸入 jobId 的比例 | 逐步降到少於 20%；優先從 overview/最近工作選取 |
| 同一 task 重複啟動 turn | 0 |
| 回報送錯來源對話 | 0 |
| 手機可自行處理的決策 | ≥ 90% 的低風險批准／問題 |
| 無聲卡住 | 0；至少有事件時間、離線或需要處理狀態 |
| 交接後桌面可恢復同一 thread | 100% 的可恢復 task |

## 13. 版本與交付順序

### M0：Project-first 基礎

- Project Profile、聊天 active context、overview、task 短碼。
- 所有回報首行加入 Project + Task。
- 多專案路由與歧義詢問；不再以 AgentHub 作為無條件 fallback。
- 更新 `settings`、桌面註冊畫面和診斷輸出。

### M1：多專案可靠執行

- 不同 Project 的排隊／並行狀態。
- 同一 Project 的主工作區鎖和 worktree fork。
- per-project notification policy、watch/mute、overview refresh。
- Codex event → Task status reducer；完成時整理差異與產物。

### M2：手機決策與交接

- task-specific approve/answer/steer/stop/kill。
- 群組摘要與角色檢查；危險批准導向私人對話。
- `handoff`、`thread/resume`、離線恢復、資料保留。

### M3：效率擴充

- 附件與產物、語音回顯確認、歷史搜尋、任務篩選。
- 每 Project 的模板、常用命令名單和資源預算。
- 只有在真實用量證明必要時，才增加更多 session 管理選項；避免把內部 thread 選擇暴露給一般使用者。

## 14. 明確非目標

- 把手機變成完整 Terminal 或複製桌面 TUI。
- 允許手機提交任意路徑、任意環境變數或任意 shell。
- 以 Teams 訊息內容擴大 Project 權限或批准範圍。
- 在沒有穩定來源身分、對話 ID 或送出確認時宣稱支援群組自動化。
- 為了多專案而預設無限制並行；資源上限、主工作區互斥和 worktree 隔離不可省略。

## 15. 官方能力依據與實作限制

Codex app-server 提供長時間 client 需要的 thread/turn/item 事件、plan/diff 更新、thread resume、compact、shell command 和批准請求；TeamBot 會將它們映射成 Project/Task/狀態卡，而非直接把內部事件全部轉發到 Teams。[官方 app-server API](https://learn.chatgpt.com/docs/app-server)

OpenAI 對 Remote 的產品說明也採用「手機是控制平面、程式碼在已連線主機執行」的模型，並把專案、worktree、排隊、steer、批准和結果檢視視為遠端工程工作的核心操作。[Mastering remote engineering work from your phone](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)

Teams Web + Playwright/CDP 仍是非官方傳輸，受租戶登入、條件式存取、頁面變更和服務條款影響；本規格保留 Teams adapter 可替換性。實際支援範圍必須由 live evidence 決定，不能以 fixture 測試代替。
