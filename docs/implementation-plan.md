# TeamBot 分階段實作計畫

目前狀態：僅規劃。所有項目尚未實作或驗收。

## Phase 0 — 確認介接可行性

- 帳號拓撲已確認：同帳號的自己聊天與指定群組皆需支援；確認 app-server 工作階段是否符合「操作 Codex CLI Terminal」需求。
- 經設計確認後，建立可看見的 Teams 登入瀏覽器，驗證實際租戶登入。
- 確認目標對話、message ID、作者 ID、目前帳號與送出結果能穩定辨識。
- 同時綁定自己聊天與一個群組，驗證多表面的收件、背景更新、回覆定位及同帳號手機推播實際行為。
- 固定 Codex CLI 版本並產生協定 schema；在隔離測試目錄確認握手、事件、取消、批准與輸入要求。
- 真實訊息往返測試須有指定測試對話與內容，避免測試時回覆一般聊天。

完成條件：記錄已驗證與受阻能力。若穩定身分不可取得、租戶不允許登入或協定能力不足，先修正設計，不把假資料測試當作實際 Teams 可用證據。

## Phase 1 — 一次工作完整往返

- 建立獨立 Electron/TypeScript 專案，移植必要瀏覽器模組並保留授權。
- 桌面端登記一個專案、自己的對話與一個指定群組；支援群組成員 allowlist 與每項工作的發起人權限。
- 實作 inbox、基本 router、app-server adapter、job store 與 outbox。
- 提供 help、projects、run、status、result；單一執行工作。
- 模擬 Teams fixture 與模擬 Codex 協定，驗證要求傳入與結果回傳。

完成條件：指定手機訊息只建立一項工作；Codex 在指定專案執行；手機能查詢進度並收到完成或失敗結果。

## Phase 2 — 遠端互動控制

- 加入 continue、steer、stop、approve、deny、answer。
- 狀態機、每個 thread 單一執行 turn、排隊與專案鎖。
- 重要階段回報、進度合併、冪等收件、重複批准拒絕與停止競態處理。

完成條件：工作執行中仍能查詢、追加要求、回答問題；錯誤來源／過期批准不能影響工作；停止請求與真正已停止可區分。

## Phase 3 — 重啟、斷線與安裝

- Teams 重新登入、瀏覽器重載與 checkpoint 復原。
- outbox 核對、傳送狀態不明、程序失聯、批准等待與復原測試。
- 桌面狀態頁、通知區與明確退出流程。
- Windows 安裝包、設定文件與精簡診斷匯出。

完成條件：斷線或重啟不重跑歷史指令、不把結果回錯對話；無法恢復的工作清楚標記，使用者有可理解的後續動作。

## 後續可選範圍

- 多專案／多人及 per-project worktree。
- 真正 Terminal 模式：TeamBot 啟動的 PTY / ConPTY + 本機終端畫面 + 同一輸入鎖。
- 自然語言對話模式、附件、產物傳送。
- 若實際需求需要官方 Teams 傳輸，另評估相應身份、部署與組織設定；保留 adapter 介面以便替換。

## 必要驗證案例

| 情境 | 預期 |
|---|---|
| 同一訊息被重讀 | 只派工一次 |
| 同帳號自己的手機要求 | 可辨識為新指令，TeamBot 回報不觸發循環 |
| 群組一般聊天與未授權成員指令 | 不派工 |
| 在群組查詢自己聊天的 jobId | 不回傳私有工作內容 |
| 群組其他成員停止／批准工作 | 依發起人與管理者權限判斷 |
| 自己聊天與群組同時有新指令 | 各自正確入列，結果回到來源對話 |
| Teams 舊歷史重新渲染 | 不派工 |
| 顯示名稱相同但 ID 不同 | 不取得另一位使用者的權限 |
| 手機指定未登記專案 | 不啟動 Codex |
| 執行中查詢 status | 不需模型完成即可回覆已知狀態 |
| 重複或過期批准 | 不再批准、不影響其他 turn |
| 人工切換 Teams 對話 | 不誤送，顯示連線／對話問題 |
| Teams 送出後確認失敗 | 標示不確定並核對，不直接重送 |
| turn/start 後程序失聯 | 查核狀態，不盲目再起一輪 |
| 手機停止時工具仍在結束 | 先 stopping，確認中止後才 cancelled |
| Teams 離線但工作完成 | 結果保留 outbox，恢復後核對並傳送 |
| 桌面與手機同時送出要求 | 同一工作只有一個寫入順序 |

## 建議目錄（尚未建立程式）

```text
launcher/             Electron main、preload、renderer
src/browser/          自有 Teams Browser Host
src/transports/teams/ Playwright Teams 收送與觀測
src/router/           指令語法、配對與權限
src/supervisor/       工作狀態、排隊、鎖與復原
src/codex/            app-server 協定客戶端
src/progress/         事件整理與手機回報
src/storage/          inbox、outbox、jobs、approvals
tests/                fixture、協定測試、整合測試
docs/                 架構、操作與來源移植紀錄
```

## Git 工作方式

使用 `gh` 已登入的 RinRyanJi 帳號，推送到 `https://github.com/RinRyanJi/TeamBot.git`。按照使用者要求，在核對本次修改與相關驗證後 commit/push；不 force-push。文件規劃與未來實作分開提交，不將未完成的功能寫成已可使用。
