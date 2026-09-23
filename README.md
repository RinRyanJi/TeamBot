# TeamBot

從手機 Microsoft Teams 向電腦上的 Codex CLI 下達工作要求，並接收進度、問題與結果。

**目前階段：架構規劃，尚未實作可執行程式。**

TeamBot 預計使用自己的 Electron 瀏覽器登入 Teams，由 Playwright 收發指定對話中的訊息；本機常駐服務管理 Codex 工作階段，將要求送入 Codex，並將執行事件整理後回傳 Teams。

首版包含同一帳號的「與自己聊天」以及指定群組聊天；群組按成員與專案設定操作權限。

```text
手機 Teams ↔ Teams 雲端 ↔ TeamBot 內嵌 Teams 網頁
                              ↕ Playwright
                         本機任務管理服務
                              ↕ stdio
                         Codex app-server
                              ↕
                       專案檔案、工具與命令
```

- [架構與操作設計](docs/architecture.md)
- [分階段實作與驗收計畫](docs/implementation-plan.md)

參考相鄰專案 `codex-chatgpt-web` 的瀏覽器與程序生命週期設計，在本儲存庫建立獨立原始碼。後續若移植其 MIT 授權程式，保留原始版權及授權聲明。

GitHub：<https://github.com/RinRyanJi/TeamBot>
