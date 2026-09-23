# TeamBot 產品規劃 Brainstorm — 回報 / 狀態 / 決策

日期:2026-09-24。形式:四視角會議(產品UX、架構可靠度、安全信任、Codex 事件整合)彙整。
背景:TeamBot 以**常駐 Codex session**(單一持久 thread,執行於 `D:\AgentHub`)為核心,經由 Teams(CDP 接自有 WebContentsView)接收 `!tb`/`@tb` 指令,回報到同一對話。此文件規劃三大互動場景並提出落地路線。

> 現況(已實測):端到端跑通(真實 Teams ↔ CDP ↔ 常駐 Codex@AgentHub ↔ 真實檔案效果);`!tb`/`@tb`、全形容錯、自然語言預設 AgentHub、on-request 批准關卡。

---

## 場景 1:結果回報

**共識:結果 = 一輪(turn)的彙整,不是最後一個 delta。**
- 權威文字來自 `item/completed` 中 `MessagePhase == final_answer` 的 agent 訊息;`commentary` 與所有 `*Delta` 只作進度、排除於最終結果。
- `turn/completed` 用來「封版」(帶 turnId、token 用量、停止原因),不作文字來源。
- **變更了什麼**:由 `turn/diff/updated`(取最後快照)彙整成檔案增/改/刪清單(+/- 行數),與 `fileChange` / `commandExecution` items 交叉核對;必要時以 turn 前後 `git status --porcelain` 對帳補強。
- **冪等送出**:outbox 以 `(turnId, kind='result')` UNIQUE;送出後存 Teams `messageId`,重試時**用編輯(edit-upsert)而非重貼**,避免重複訊息。

**建議訊息格式(兩段式:先結論、後細節)**
```
[TB #a3f ✅ 完成] 重構登入 · 3 檔 · 2m14s
• src/auth.py (+58 −12)、tests/test_auth.py (+30)、README (+4)
• 改用 bcrypt;保留舊 hash 讀取路徑
• 下一步:要我部署到 staging 嗎?  回覆 diff #a3f | files #a3f | result #a3f
```
失敗時只給**單一根因** + 停在哪 + 續跑指令,絕不把 stacktrace 倒進手機(截斷/附檔)。

---

## 場景 2:長任務的持續狀態

**共識:狀態由 coalescer「單一寫入者」統一輸出,就地編輯同一則狀態卡,≤1 則/間隔,且僅在有變化時更新。**
- 來源事件:`item/plan/delta`(當作可勾選 TODO,原地改寫)、`item/started`(當前步驟名)、`commandExecution/outputDelta`(末 N 行 tail)、`thread/tokenUsage/updated`(footer)。
- **不逐 token 洗版**:debounce ~0.75–1s 併一張卡;`reasoning/*Delta` 預設不對用戶顯示。
- **心跳**:記 `lastEventAt`;活動中但靜默達 T → 顯示「仍在執行(閒置 Ns)」,區分「卡住」與「長但活著」。
- **拉取路徑 `status`**:直接讀 store/coalescer 快照,**不等模型**,離線也可回。
- **推播禮貌**:進度靜默貼出(可見、不 @);只有結論與決策點才 @ 用戶(手機推播)。

```
[TB #a3f ⏳ 執行中] 步驟 3/~6 · 已 4m
現在:跑測試 (142/210 通過)   最近:遷移 schema ✓   eta:~3–5m
```

---

## 場景 3:決策點(批准 / 選項 / 補充資訊)

**共識:每個決策都有代碼 + 明確選項;繫結 requestId;逾時暫停(絕不自動批准副作用)。**
- server→client 請求對應:
  - `item/commandExecution/requestApproval` → 顯示「執行 `<cmd>` 於 `<cwd>`?」→ 以 request `id` 回 `{decision:"accept"|"decline"}`。
  - `item/fileChange/requestApproval` → 顯示路徑 + diff 摘要 → 同上。
  - `item/permissions/requestApproval` → 顯示要求的能力範圍 → 同上。
  - `item/tool/requestUserInput` → 顯示提問/欄位 → 以 `id` 回**答案 payload**(文字/結構,非 decision enum)。
- **多個待決**:各有代碼(A1/A2…);Teams 回覆必須指名代碼;>1 待決時拒絕裸 `yes`。
- **逾時**:`expiresAt` 到期 → 任務**暫停**;安全選項可套預設,破壞性動作永不自動批。
- **中途轉向**:用 `turn/steer` 帶 `expectedTurnId` 注入新指示,不必砍掉整輪;`expectedTurnId` 不符則拒絕。

```
[TB #a3f ⛔ 需要批准 A1 · 30m 後失效]
即將:git push --force origin main(改寫 4 個 commit)
回覆:approve A1 | deny A1 | ask A1 <問題>
```

---

## 跨場景設計

- **指令詞彙**(皆吃 `!tb`/`@tb`、全形容錯):`run` · `status`/`where` · `stop`(收尾)/`kill`(硬停) · `continue`/`steer <text>` · `approve`/`deny` · `answer <code> <值>` · `result`/`diff`/`files`/`get`。裸自然語言 → `run`(預設 AgentHub)。
- **Job ID**:短碼 `#a3f`,各訊息一致前綴;emoji 表狀態(⏳⛔❓✅❌⏸️)便於掃視。
- **並行**:常駐單 thread = 串列佇列(一次一 turn);`run` 時忙碌 → 明示排隊;`status`/`answer`/`steer` 插隊。真正並行留給**額外 thread + git worktree**(選用,非預設,保連續性)。
- **連續性**:持久化 `threadId`,重啟以 `thread/resume` 接回;啟動時重播未決 approvals/outbox、把 in-flight job 標 interrupted 並重貼狀態。
- **收件事件化**:以 Teams DOM `MutationObserver`(exposeBinding 推事件)取代輪詢,保留慢速輪詢當保險。

## 正規化「TeamBot 事件」模型(解耦 Codex 線路與 Teams 呈現)
```
{ threadId, turnId, kind: status|result|decision|error, phase, payload, ts }
```
adapter 每個已驗證事件/請求各一 handler → normalizer;渲染層:狀態卡更新器(debounced edit)、結果卡建構器、批准卡工廠;狀態庫:per-turn 狀態結構、pending-approvals(以 request id 為鍵)、thread→對話註冊表、follow-up 佇列。

---

## 安全姿態(重大決策,需你拍板)

> ⚠️ 本質是「從聊天室遠端執行程式(RCE)」;信任邊界是一則 Teams 訊息。常駐 = 全天候武裝能力。這是最大結構性風險。

**安全視角強烈建議(與目前 e2e 預設不同,需你決定):**
1. **預設改為 read-only**,寫入/執行以 `!tb unlock <時長>` 明確、時限式開啟(到期自動關)。自然語言預設應是**計畫/dry-run**,而非直接執行。 ← *目前 e2e 是 workspace-write + on-request,屬較寬鬆*
2. **預設拒絕網路**(無外流路徑);網路存取自成一個批准類別。
3. **寫入限制在 `D:\AgentHub`**(正規化路徑、拒 `..`/符號連結逃逸/UNC)。
4. **永遠需要批准(不論 policy)**:AgentHub 外的寫/刪、`rm -rf`/format/登錄檔/服務/驅動;網路外送(push/curl/安裝);讀取機密(`.env`/`.ssh`/`GH_TOKEN`);git 歷史改寫/force-push;提權。
5. **輸出去識別**:對外訊息與日誌都掃 token/JWT/AWS key/email/絕對路徑;群組只給摘要,詳細輸出只進自己聊天。
6. **owner-only 授權**:以不可變 sender id 白名單,群組中僅 owner 可觸發;危險操作隔離到自己聊天並需再次打字確認。
7. **失控防護 + kill switch**:每輪 wall-clock/輸出量/命令數上限、重複失敗自動停;`!tb kill` 從任何頻道硬停 + 本機托盤 kill;閒置 N 分自動 suspend。
8. **附加式稽核日誌**(hash 串鏈防竄改),本機保存。
9. **ToS 風險**:UI/CDP 自動化 Teams 可能違反 Microsoft 條款;長期宜評估官方 Bot Framework + Graph API。

---

## 路線圖(提議的後續 task)

| # | 主題 | 內容 |
|---|---|---|
| A | 安全預設收斂 | read-only 預設 + `unlock` 時限、path allow-list、always-approve 清單、輸出去識別、kill/idle-suspend、owner 授權 |
| B | 結果彙整器 | turn fold → final_answer 擷取 + 檔案變更清單;outbox `(turnId,kind)` UNIQUE + Teams edit-upsert |
| C | 狀態卡 + coalescer 接線 | 就地編輯單卡、plan/outputDelta/tokens、心跳、`status` 讀快照 |
| D | 批准註冊表 | code↔requestId、多待決、逾時、requestUserInput 答覆、steer vs 新 turn |
| E | 事件化收件 | MutationObserver 推送取代輪詢 + 單調游標去重 |
| F | 連續性/復原 | thread/resume、開機重播 approvals/outbox/in-flight |
| G | 多任務(選用) | 額外 thread + worktree 隔離 |

## 待你拍板的關鍵決策
1. **預設 sandbox 姿態**:維持 workspace-write(方便),還是改 read-only + `unlock`(安全,建議)?
2. **群組 vs 自己聊天**:首版是否僅自己聊天?危險操作是否一律導到自己聊天?
3. **多任務**:首版維持單 thread 串列,還是要 worktree 並行?
4. **回報密度**:狀態間隔(建議 15s 併卡 + 心跳)與是否 @ 推播的規則。
5. **ToS**:接受 CDP 自動化風險,或排程評估 Graph/Bot Framework?
