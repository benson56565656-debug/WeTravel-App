# DEVLOG — WeTravel-App（開源版）

## 檔頭常駐區（覆寫式）
- **專案簡介**：WeTravel 的開源發行版（GitHub: benson5566/WeTravel-App）——使用者 fork 後自帶 Firebase 免費自架；MIT 授權。
- **上游**：`../wetravel`（私有版）為功能開發主場，本 repo 為去敏化鏡像，改動採手動同步。
- **長效決策**：
  - `firebase-config.js` 只放 `YOUR_...` 佔位值；**真實金鑰嚴禁 commit**。
  - 安全模型：匿名 Auth＋firestore.rules（僅 trips 路徑可讀寫）；README 明示勿用測試模式規則。
  - CDN 依賴一律 pin 版本（tailwind 3.4.16／phosphor 2.1.1／sortablejs 1.15.6）——比私有版嚴格，同步時勿被 latest 蓋回。
- **風險（未解）**：assets/ 目前含整套 Hello Kitty／Sanrio 素材（splash 圖含「© 2024 Sanrio」字樣），公開 repo 有 IP 風險，需替換成中性素材。

---

## 2026-07-15
- 補建 DEVLOG（依全域規則）。
- 上游（wetravel）啟動 UX 審視；優化定案後由私有版實作再同步過來。
- 待辦：①同步上游 UX 優化 ②替換 Sanrio 素材為中性素材（IP 風險）。

## 2026-07-05（歷史回填）
- 開源初版發佈 (89344c3)：config 抽離＋firestore.rules＋MIT＋自架教學 README；CDN pin 版本；app.js?v=20。
