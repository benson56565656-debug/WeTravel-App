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

## 2026-07-16（同步上游 UX 全量改動 ✅）
- 上游 wetravel 真機驗收通過（至 7cbabab／sw v32），全量同步：index.html＋sw.js 整檔覆蓋；app.js 覆蓋後重做去敏化三件套（vue pin 回 3.5.13、config 改 import './firebase-config.js'、errorMap 補 not-configured＋onMounted 佔位守衛）。
- 內容含：原生對話框退場（sheet/undo toast）、編輯全面彈窗化（draft 制）、iOS 鍵盤 visualViewport 修正、口袋類型＋⠿ 把手拖曳（真根因：transition out-in 使 Sortable 從未初始化，改輪詢掛載）、記帳簡化＋成員預設清空、對比 AA。
- 驗證：`node --check` 過；密鑰掃描零殘留（AIzaSy／etravel-benson／sender id）；CDN pin 全保留（tailwind 3.4.16／phosphor 2.1.1／sortablejs 1.15.6）；無頭實測佔位 config 正常顯示 not-configured 指引。
- README 功能描述更新（行程自動排序／記帳無結算／口袋分類＋拖曳）。
- 待辦：替換 Sanrio 素材為中性素材（IP 風險，未解）。

## 2026-07-15
- 補建 DEVLOG（依全域規則）。
- 上游（wetravel）啟動 UX 審視；優化定案後由私有版實作再同步過來。
- 待辦：①同步上游 UX 優化 ②替換 Sanrio 素材為中性素材（IP 風險）。

## 2026-07-05（歷史回填）
- 開源初版發佈 (89344c3)：config 抽離＋firestore.rules＋MIT＋自架教學 README；CDN pin 版本；app.js?v=20。
