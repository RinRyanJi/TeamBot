# TeamBot 設定與安裝

> 狀態：實作中。可執行核心已完成並附測試（見 `tasks/`）。

## 設定項目

| 類別 | 項目 | 說明 |
|---|---|---|
| 專案 | 別名 → 絕對路徑 | 桌面端登記；手機只能指定別名，不能提交 cwd（`normalizeProjectPath` 強制絕對路徑）。 |
| 配對 | tenant/account、chatId、kind(self/group) | 桌面端完成配對後才接單；建立基線（`createBaseline`），歷史不執行。 |
| 權限 | allowlist、per-job 發起人、admins | §5 權限表：啟動／查詢／控制／批准。 |
| 保留 | approvals/cache/jobs TTL | 見 `DEFAULT_RETENTION`（30/14/30 天），可調整。 |
| Codex | 釘選版本 0.156.1、sandbox/approval policy | 由既有 Codex 設定決定實際執行權限。 |

## 資料位置

設定、Teams profile、SQLite、日誌置於使用者資料目錄；Git 只收原始碼／文件／去識別 fixture。

## 診斷匯出

`writeDiagnostics(path, input)` 產生**去識別**的 JSON：不含 token／cookie／完整環境變數
（`src/util/redact.ts`）。可安全分享。

## Windows 封裝

- 目前：`npm run package:win` 產生可攜式 ZIP（`release/TeamBot-<version>-win.zip`），
  內含建置輸出、Electron launcher 與 manifest。
- 後續：以 electron-builder 產生具簽章的 NSIS 安裝檔（需簽章憑證與 CI；介面契約已就緒）。

## 執行

```powershell
npm install
npm run build
npm run package:win   # 產生 release/ 下的 ZIP 產物
```
