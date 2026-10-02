# TeamBot User Cases v4

這些案例用來檢查新版規格是否真正降低手機操作成本。每個案例都以可觀察的使用者結果結束，而不是以「呼叫了某個 API」結束。

## UC-01 初次設定：我有三個專案，但不想記路徑

**角色**：個人維護者。

**前置**：桌面 TeamBot 已登入 Teams，Codex 可用。

1. 桌面端登記「TeamBot」「CodexWeb」「Firmware」三個專案。
2. 每個專案顯示名稱、路徑尾段、Git 分支、sandbox/網路姿態和允許的 Teams 對話。
3. 使用者在自己聊天執行 `!tb projects`。

**預期**：手機看到三張簡短專案列；不顯示需要背誦的絕對路徑。若兩個名稱或 alias 衝突，桌面端在啟用前要求修正。

**驗收**：不需輸入 cwd；選定專案最多兩次訊息完成；未登記專案不能啟動 Codex。

## UC-02 第一次交辦：自然語言但不送錯專案

**角色**：多專案開發者。

1. 使用者輸入 `!tb focus CodexWeb`。
2. TeamBot 回覆「目前專案：CodexWeb，僅對此聊天有效」。
3. 使用者輸入「修正登入錯誤並跑測試」。

**預期**：TeamBot 建立 `TB-WEB-19`，ACK 明確包含 `CodexWeb`、工作摘要、執行模式和目前權限。若 active context 已過期，先顯示確認卡，不執行。

**驗收**：在兩個候選專案存在時省略專案必須詢問；不能默默使用 AgentHub。

## UC-03 多專案並行：A 等測試時交辦 B

**角色**：個人維護者。

1. TeamBot 已在 TeamBot 專案執行 `TB-API-7K2`。
2. 使用者輸入 `!tb run Firmware 更新 HID 測試`。
3. 使用者輸入 `!tb overview`。

**預期**：overview 分組顯示兩項工作及其 Project。若資源上限為 1，Firmware 顯示排隊原因和前方工作；若上限允許並行，Firmware 顯示自己的 lane/worktree。不能只回「queued」而不說為何。

**驗收**：不同 Project 並行時 cwd、thread、worktree 可追蹤；同一 Project 不共用主工作區同時寫入。

## UC-04 同專案平行修正：使用者明確要求隔離

**角色**：需要同時處理兩條不相關修正的開發者。

1. `TB-API-7K2` 正在 TeamBot 主工作區執行。
2. 使用者輸入 `!tb fork TB-API-7K2 修正相容性問題`。

**預期**：TeamBot 顯示將建立 worktree、分支和新 task，要求一次明確確認。確認後建立 `TB-API-8Q4`，狀態列顯示 `worktree/TB-API-8Q4`。

**驗收**：拒絕確認不建立副作用；建立後兩項工作變更不互相覆蓋；完成時清楚顯示需要合併。

## UC-05 總覽與細節：我只想知道哪裡需要我

**角色**：手機使用者。

1. 使用者輸入 `!tb overview`。
2. 看到三個 Project：一個執行中、一個待批准、一個完成。
3. 使用者輸入 `!tb task TB-WEB-19 details`。

**預期**：overview 一屏提供分流；details 才顯示 plan、最近命令、diff、測試與產物。沒有百分比或 ETA 證據時不顯示假數字。

**驗收**：使用者不必掃過命令輸出才能知道下一步；task 短碼可直接複製使用。

## UC-06 批准：我知道自己批准的是哪個專案的哪個動作

**角色**：批准者。

1. Codex 在 `CodexWeb / TB-WEB-19` 要求執行一個非白名單命令。
2. Teams 顯示 Project、Task、cwd、命令、影響範圍、失效時間和 `A2`。
3. 使用者回覆 `ok A2`。

**預期**：批准只對該 request 生效；若同時有 `Firmware / TB-FW-04` 的 `A1`，不能交叉批准。群組只顯示待處理摘要，完整命令導向發起人的自己聊天。

**驗收**：過期、重複、跨對話或非授權 sender 的批准全部拒絕並留稽核。

## UC-07 執行中追加與停止

**角色**：正在通勤的開發者。

1. `TB-API-7K2` 顯示測試階段。
2. 使用者輸入 `!tb add TB-API-7K2 同時補上 Windows 路徑案例`。
3. 發現方向錯誤後輸入 `!tb stop TB-API-7K2`。

**預期**：追加要求進入同一 thread 的下一個 turn；停止先顯示 `stopping`，收到 Codex 真正中止事件後才顯示 `cancelled`。使用者不必在手機輸入 threadId。

**驗收**：停止不影響其他 Project；steer、stop 不能被解讀成批准；停止狀態不會永久顯示執行中。

## UC-08 群組協作：看得到摘要，但不能越權

**角色**：三人群組，只有 Alice 可批准。

1. Alice 在群組輸入 `@tb run TeamBot 修正文件`。
2. Bob 輸入 `@tb status`。
3. Codex 要求危險命令批准。
4. Bob 嘗試 `ok A3`，Alice 在自己聊天批准。

**預期**：群組回報摘要與結果；Bob 可查詢被授權的摘要但不能批准或查看私有輸出。危險批准不在群組公開命令和代碼。

**驗收**：成員、角色、Project binding 和來源 chatId 都參與授權；引用 Alice 的訊息不會讓 Bob 繼承 Alice 權限。

## UC-09 離線恢復：不確定就不要重跑

**角色**：筆電睡眠後重新上線的使用者。

1. `TB-DOC-11` 執行中 Teams 失聯。
2. 電腦恢復後 TeamBot 重新連線 Codex。
3. 使用者輸入 `!tb overview`。

**預期**：先顯示離線時間、已確認事件、未確認訊息和目前 task 狀態。若無法判定 turn 是否已執行，顯示 `needs reconciliation`，要求使用者決定是否續跑；不自動重送。

**驗收**：outbox 不重複貼結果；可恢復 thread 使用 `thread/resume`；來源對話不混淆。

## UC-10 回到桌面：從手機交接，不必重述

**角色**：回到辦公桌的開發者。

1. 使用者輸入 `!tb handoff TB-API-7K2`。
2. TeamBot 回傳 project、分支、worktree、thread、目前 turn、改動檔案、測試和桌面接手命令。
3. 使用者在桌面 Codex CLI resume 同一 thread。

**預期**：桌面看到同一段上下文；TeamBot 不把內部 token、cookie 或完整敏感輸出貼到 Teams。

**驗收**：可恢復 task 的 threadId 與 Project 綁定一致；不可恢復時明確說明原因和安全替代方案。

## UC-11 輸入模糊：先問一個好回答的問題

**角色**：使用者在群組輸入「跑一下昨天的測試」。

**預期**：TeamBot 不猜 Project 或 task，顯示最多三個候選：`TeamBot / TB-API-7K2`、`CodexWeb / TB-WEB-19`、`Firmware / 無`，並要求回覆 `1`、`2` 或明確的新要求。

**驗收**：澄清問題包含選項、原因和目前對話，不要求使用者知道內部 threadId；回答後只建立一個 task/turn。

## UC-12 結果與產物：我知道完成代表什麼

**角色**：使用者等待一個修正與測試結果。

**預期**：完成訊息首行說明 Project、Task、成功／失敗、變更檔案數和測試；`details` 可取得 diff 摘要；`artifact` 可取得報告或產物。若只有部分完成，狀態是 `completed_with_followup` 而不是綠色 ✅。

**驗收**：結果不以最後一個 delta 代替 final answer；未完成的工作、失敗根因和下一步可區分。

## User case 總結矩陣

| 能力 | UC | P0/MVP |
|---|---|---|
| 專案註冊與安全選擇 | 01、02 | P0 |
| 跨專案 overview | 03、05 | P0 |
| 專案隔離並行 | 03、04 | P1 |
| task-first 控制 | 06、07、10 | P0 |
| 群組摘要與角色 | 08 | P1 |
| 離線恢復 | 09 | P0 |
| 澄清而不猜 | 02、11 | P0 |
| 結果與產物 | 05、12 | P1 |
