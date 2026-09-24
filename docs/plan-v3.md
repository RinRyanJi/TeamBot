# TeamBot 實作計畫 v3(從 PRD v3 推導)

日期:2026-09-25。來源:[PRD.md](PRD.md)(v3)+ 五角色評審會議(`w600vkbah`)。
本計畫**取代** [implementation-plan.md](implementation-plan.md)(v2 era)。關係鏈:
**PRD.md(為什麼/要什麼)→ 本計畫(階段/閘門)→ [Tasklist.md](../Tasklist.md)(可勾選項目)→ `tasks/taskNNN/`(證據)。**

---

## 0. 這份計畫的前提:先承認現況

評審已用 `file:line` 核實:多個舊 task 標 DONE,但那是**管線通、引擎存在**,不等於 PRD 承諾的體驗成立(見 PRD §0.5)。因此本計畫的第一原則是:

> **不再新增功能承諾,先把已宣稱的東西接線、加證據、補地基。** 每個 task 的完成定義 = **真實證據**(測試綠燈 / 實測 evidence),不是「引擎存在」。

---

## 1. 閘門式階段(不是瀑布,是有依賴的閘門)

```
G0 閘門(R0)──GO──► G2 串流(H)
   │                    ▲
   │ 可平行、不等 G0     │ 需 G0 GO
   ▼                    │
G1 安全地基(R7/R8/R9 + 治理)──────┘
                    │
                    ▼
              G3 便利(P1:R1/R2/R3/R4/R5/R6)
                    │
                    ▼
              G4 延後(P2:群組、I/K/N/O)
```

- **G0 是 gate**:R0 未給出 GO/PIVOT 前,H(串流)不開工(PRD §0 明訂)。
- **G1 不等 G0**:安全地基與 R0 無關,應**立即平行開工**——它是「敢用」的前提,也是目前最大的地基缺口。
- **G3 大多依賴 G1/G2** 的接線;**G4 明確延後**。

---

## 2. G0 — 推播經濟學閘門(R0)

**目的**:決定整個 §3.2/§5 的「編輯不推播」骨架成不成立。**在此之前 H 不開工。**

| 步驟 | 內容 | env |
|---|---|---|
| R0a | **editMessage 可行性 spike**:CDP 對自己剛發的訊息(`data-mid`)程式化編輯並回讀確認;驗編輯後 `data-mid` 是否穩定(不穩→心跳定位鍵漂移) | live |
| R0b | **推播量測**:①發新訊息→手機是否推播;②同一則編輯 3 次→是否再推;③60s 內高頻編輯(模擬心跳)→是否累積成推播/觸發降頻 | live |
| R0c | **決策**:GO(編輯不推播)→ 走 §3.2/§5;PIVOT(編輯也推)→ 走 PRD §0 的 fallback(進度不主動推、`?`/`s` 拉取) | — |

**出口條件**:evidence 存於 `tasks/taskNNN/evidence/`;GO/PIVOT 明確記錄於 PRD §0 與本計畫。

---

## 3. G1 — 安全地基(R7 / R8 / R9 + 治理)可立即開工

這是目前**最該先做**的一塊:PRD 承諾的硬牆/稽核/急停多數是空頭或未接線。

### 3.1 治理(先做,擋住假 ✅ 復發)
- **§4 對帳 + traceability 表**:每個 P0 需求 → architecture 章節 → code 證據(`檔:行`)→ 測試,四格有一格空即不准標 ✅。把 stop/kill/steer 等假 ✅ 全面改標。

### 3.2 R9 稽核(其他安全宣稱的地基)
- **append-only audit 表**(禁 UPDATE/DELETE),記錄 `{時間, senderId, 對話, 指令原文去識別, 決策 deny/allow/whitelist-add, 命中規則}`;每個 deny/allow/whitelist 路徑補測試確保寫入且不可竄改。

### 3.3 R7 硬牆 + 名單(拆為可獨立驗收子項)
- **R7a 路徑牆歸屬**:承認牆 = Codex sandbox `writableRoots`;對 sandbox 做 `..`/UNC/junction/`%VAR%` 繞道實測(CI 實建 junction 指向 `C:\` 驗證被拒)。拿到證據前 §8/§9「AgentHub 外存取=0」不得宣稱。
- **R7b 黑名單重定位**:從「宣稱攔住」改成「命中即升級必問/隔離」;補齊缺漏樣式(`diskpart`/`Set-ExecutionPolicy`/`takeown`/`fsutil`/`wmic`/`certutil -decode`);每類正例 + 對抗性負例(大小寫/空白/引號拼接/PS 別名/`-EncodedCommand`/反引號)。
- **R7c 讀寫不對稱(Q5 決議)**:寫入限 AgentHub;讀取預設限 AgentHub + **唯讀參考白名單**;機密路徑即使登記也硬拒(黑名單優先)、桌面端設定 + 重啟、realpath 判定。
- **R7d 白名單資料流**:per-project(以 `projectId` 為鍵,即使單值)白名單 schema + store CRUD;**判斷順序單元測試**(路徑越界即使指令在白名單也要被拒)。
- **R7e 名單指令**:`ok 永遠` 寫入 + 就地回顯 pattern + TTL(到期主動問);`!tb 名單` 讀取 / `移除 <n>`。

### 3.4 R8 執行中控制(引擎多有,接線到 coordinator)
- **R8a 急停**:`stop`(收尾停,`turn/interrupt`)/ `kill`(硬停)接線到指令層;停後狀態卡不再掛 `⏳`;喊停不受推播節流影響。
- **R8b 追加/另開**:執行中純文字 → `turn/steer` 併入當前輪;帶附件排下一件;歧義時問 `併`/`新`。
- **R8c 佇列**:再交辦 → 排隊回報位置;`!tb 取消 <n>` / `取消 全部`(不動正在跑的)。
- **注意**:steer 文字**永不當批准**(與 §3.3 批准佇列分開);裸 `ok` 綁**版本化 pending 佇列**(見 R1)。

### 3.5 斷線復原(大多已實作,補強 + 補測)
- `recovery.ts` 已有 in-flight→unknown 不盲跑、outbox 重連補送、離線窗告知。補:離線一律回落 read-only + 停止接單;`?`/`status` 在 runner 離線時明確回「遙控鏈中斷」。

---

## 4. G2 — 串流回報(H,需 G0 GO)

- **H1**:`transport.editMessage()` 介面 + CDP 就地編輯實作(依 R0a spike 結果)。
- **H2**:一則訊息就地變形的狀態卡;**心跳由 Codex app-server 事件驅動**(非 `setInterval`),區分三態(前進/閒置/斷線);卡住警告 N 預設 3 分、可設。
- **H3**:推播預算落地——debounce 900ms、chunk 3500、`retry_after` 退避;§5 每列有對應驗收方法。
- **若 PIVOT**:H 不做串流,改實作 §0 fallback(進度不推、`?`/`s` 拉取)。

---

## 5. G3 — 便利(P1)

| 代號 | 內容 | 依賴 |
|---|---|---|
| R1 | 裸 `ok`/`no` 綁版本化 pending 佇列(修競態:狀態變動即失效退化為回報) | R8/批准註冊表 |
| R2 | 自己聊天前綴 + **逃脫方向反轉**(預設當筆記、要送才加標記);首次 opt-in | parser |
| R5 | `!tb 交接`:印 thread id + cwd + 本輪改了哪些檔 | session |
| R6 | `!tb login`/`logout`;未登入不啟動 turn、不靜默失敗 | adapter |
| R3 | 語音 STT **spike**(CDP 能否取音檔/轉錄)+ 回顯確認才進 parser;含破壞性字樣強制確認;未過降 P2 | live spike |
| R4 | 附件 in(`.teambot/inbox`,標 data-only 不當指令)/ out(`turns/out` 產物自動回傳) | transport |

---

## 6. G4 — 延後(P2,明確不在首版)

- **群組**:自 architecture.md §5「首版必要」正式降級 P2(PRD §8 已記錄);architecture §5/§9 群組章節標 deferred。開啟時才做:前綴強制、批准碼 `crypto.randomBytes`、批准碼不外曝(導 DM)、只回摘要。
- **I** 多會話 / `use latest` / `sessions`;**K** 歷史匯入;**N** ACL 角色;**O** 設定檔驅動。

---

## 7. 跨階段:成功指標量測(PRD §9)

每條指標補「怎麼量」並接 CI 可行者:輸入字元數(parser 統計)、批准次數(稽核日誌,依賴 R9)、心跳間隔(status-model 以 Codex 事件斷言)、AgentHub 外存取(對 sandbox 繞道實測,依賴 R7a)。定義 3–5 個代表性 benchmark 任務作為「一般開發任務」分母。無量測方法者降為「目標」。

---

## 8. 排程建議(給 owner 參考)

1. **並行起手**:G0(R0 spike,需你在真機配合)+ G1 治理/R9/R7(純本機,可全速做)。
2. R0 出 GO/PIVOT → 決定 G2 走串流或 fallback。
3. G1 安全地基完成(硬牆證據 + 稽核 + 急停)= **可安全 dogfood 的最小線**。
4. G2 + G3 P1 = **達到 PRD 體驗**。
5. G4 視實際需求再開。

**出貨最小線(MVP-safe)** = G0 決策 + G1 全部 + G2(H 或 fallback)+ R1。其餘 P1 可增量。
