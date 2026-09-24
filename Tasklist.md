# TeamBot Tasklist(PRD v3 / plan-v3)

來源:[docs/PRD.md](docs/PRD.md) · [docs/plan-v3.md](docs/plan-v3.md)。
task001–027 見 [tasks/README.md](tasks/README.md)(多為管線完成;PRD §0.5 指出部分是引擎存在/假 ✅,由本清單的治理與接線任務補實)。

**完成定義**:每項需**真實證據**(測試綠燈或 live evidence)存於 `tasks/taskNNN/evidence/`,單獨 commit + push。狀態:☐ 待辦 / ◐ 進行 / ☑ 完成(附證據)。
**優先序**:P0 = 出貨前置;P1 = 達到 PRD 體驗;P2 = 延後。
**env**:local = 本機可驗;live = 需真機 Teams 配合。

---

## G0 — 推播經濟學閘門(gate,H 的前置)

- ☐ **task028 · R0a editMessage 可行性 spike** — P0 · live
  CDP 對自己 `data-mid` 訊息程式化編輯 + 回讀;驗 `data-mid` 編輯後是否穩定。
  證據:編輯前後 DOM 內容對照 + data-mid 追蹤紀錄。
- ☐ **task029 · R0b 推播量測 + GO/PIVOT 決策** — P0 · live · 依賴 task028
  ①發新訊息推播?②編輯 3 次是否再推?③60s 高頻編輯是否累積成推播/降頻。
  證據:真機觀察紀錄;GO/PIVOT 結論寫回 PRD §0。

## G1 — 安全地基(可立即平行開工,不等 G0)

- ☐ **task030 · 治理:§4 對帳 + traceability 表** — P0 · local
  每個 P0 需求 → architecture 章節 → `檔:行` → 測試;stop/kill/steer 等假 ✅ 全面改標。
  證據:traceability 表 + tasks/README 狀態校正。
- ☐ **task031 · R9 稽核 schema(append-only)** — P0 · local
  audit 表(禁 UPDATE/DELETE)+ 每個 deny/allow/whitelist 路徑寫入;不可竄改測試。
  證據:schema + 寫入測試 + 竄改被拒測試。
- ☐ **task032 · R7a 路徑牆歸屬 + sandbox 繞道實測** — P0 · local+live
  承認牆=Codex sandbox;`..`/UNC/junction/`%VAR%` 繞道測(CI 建 junction 指向 `C:\` 驗被拒)。
  證據:繞道測試套件(對 sandbox 實際寫入行為)。
- ☐ **task033 · R7b 黑名單重定位為升級必問 + 對抗性測試** — P0 · local
  補齊缺漏樣式;每類正例+對抗性負例(大小寫/引號/PS 別名/`-EncodedCommand`/反引號)。
  證據:分類測試;§9 威脅表用語校正(不宣稱「可靠攔截」)。
- ☐ **task034 · R7c 讀寫不對稱 + 唯讀參考白名單(Q5)** — P0 · local
  寫入限 AgentHub;讀取限 AgentHub + 唯讀白名單;機密路徑硬拒(黑名單優先)、realpath、桌面端設定。
  證據:讀允許/寫拒/機密即使登記也拒 三類測試。
- ☐ **task035 · R7d 白名單資料流(schema + CRUD + 判斷順序)** — P0 · local
  per-project(`projectId` 為鍵)白名單 store CRUD;**路徑越界即使在白名單也被拒**的順序測試。
  證據:CRUD 測試 + ①②先於③ 的順序測試。
- ☐ **task036 · R7e 名單指令(`ok 永遠` / `!tb 名單` / 移除 / TTL)** — P0 · local · 依賴 task035
  `ok 永遠` 寫入 + 回顯 pattern + TTL 到期主動問;`!tb 名單` 讀取 + `移除 <n>`。
  證據:加入→命中直接跑→移除→回到問 的迴圈測試。
- ☐ **task037 · R8a 急停接線(stop / kill)** — P0 · local+live
  `stop`=`turn/interrupt` 收尾;`kill`=硬停;停後狀態卡不掛 `⏳`;不受推播節流。
  證據:stop 收尾/kill 立斷 測試 + live 實測。
- ☐ **task038 · R8b 追加/另開接線(steer + 併/新)** — P0 · local · 依賴 task037
  執行中純文字→steer 併當前輪;帶附件排下一件;歧義問 `併`/`新`;steer 永不當批准。
  證據:steer 併入測試 + 歧義分流測試 + steer≠批准測試。
- ☐ **task039 · R8c 佇列可見 + 取消** — P0 · local · 依賴 task037
  再交辦→排隊回報位置;`!tb 取消 <n>` / `取消 全部`(不動正在跑的)。
  證據:排隊位置 + 單筆/全清 + 不影響 active 測試。
- ☐ **task040 · 斷線復原補強** — P1 · local+live
  離線一律回落 read-only + 停接單;`?`/`status` 在 runner 離線時回「遙控鏈中斷」。
  證據:離線降級測試 + 離線拉取回報測試(`recovery.ts` 已有基礎)。

## G2 — 串流回報(需 task029 GO;PIVOT 則改做 fallback)

- ☐ **task041 · H1 `transport.editMessage()` + CDP 就地編輯** — P0 · live · 依賴 task028/029
  證據:就地編輯一則訊息並回讀 live evidence。
- ☐ **task042 · H2 就地變形狀態卡 + Codex 事件驅動心跳(三態)** — P0 · local+live · 依賴 task041
  心跳由 app-server 事件驅動、非 setInterval;卡住 N 預設 3 分可設。
  證據:三態切換測試 + 卡住警告假時鐘測試。
- ☐ **task043 · H3 推播預算落地(debounce/chunk/retry_after)** — P0 · local+live · 依賴 task041
  證據:§5 每列對應驗收;限流退避測試。
- ☐ **task041b · (PIVOT 替代)進度拉取 fallback** — P0 · local · 僅 task029=PIVOT 時
  進度不主動推;`?`/`s`=status;只在 完成/失敗/需批准 推。

## G3 — 便利(P1)

- ☐ **task044 · R1 裸 ok 綁版本化 pending 佇列(修競態)** — P1 · local · 依賴 task037/批准註冊表
  新待決進來即 bump,舊裸 `ok` 失效退化為回報;引用只帶資料。
  證據:延遲 ok 命中舊/新待決 的競態測試。
- ☐ **task045 · R2 自己聊天前綴 + 逃脫反轉** — P1 · local+live
  預設當筆記、要送才加標記;首次 opt-in。證據:標記/未標記分流測試。
- ☐ **task046 · R5 `!tb 交接`** — P1 · local
  印 thread id + cwd + 本輪改檔清單。證據:輸出比對測試。
- ☐ **task047 · R6 `!tb login`/`logout` + 未登入不啟 turn** — P1 · local+live
  未登入不靜默失敗、給 login 提示。證據:未登入攔截測試。
- ☐ **task048 · R3 語音 STT spike + 回顯確認** — P1(未過降 P2) · live spike
  CDP 能否取音檔/轉錄;轉錄回顯確認才進 parser;破壞性字樣強制確認。
- ☐ **task049 · R4 附件 in/out + 產物自動回傳** — P1 · local+live
  inbox 標 data-only 不當指令;`turns/out` 產物回傳成附件。
- ☐ **task050 · §9 指標量測接線 + benchmark 任務** — P1 · local · 依賴 task031
  每指標補量測管線;定義 3–5 個 benchmark 任務作分母。

## G4 — 延後(P2,不在首版)

- ☐ **task051 · 群組場景**(前綴強制 / `crypto.randomBytes` 批准碼 / 導 DM / 只回摘要)— P2
- ☐ **task052 · I 多會話**(`use latest`/`sessions`/`new`)— P2
- ☐ **task053 · K 歷史匯入** — P2
- ☐ **task054 · N ACL 角色 + audit_log** — P2(稽核基礎見 task031)
- ☐ **task055 · O 設定檔驅動** — P2

---

## 里程碑

- **M0 閘門通過**:task028–029(GO/PIVOT 定案)。
- **M1 可安全 dogfood**:M0 + task030–040(安全地基全綠)。
- **M2 達到 PRD 體驗**:M1 + task041–044(串流 + 裸 ok)。
- **M3 完整 P1**:M2 + task045–050。
- **出貨最小線(MVP-safe)** = M1 + G2(H 或 fallback)+ R1。
