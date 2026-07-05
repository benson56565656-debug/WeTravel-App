// ============================================================
// WeTravel Firebase 設定（自架必填）
// ------------------------------------------------------------
// 1. 到 https://console.firebase.google.com 建立自己的專案（免費 Spark 方案即可）
// 2. 專案設定 → 一般 → 你的應用程式 → 新增網頁應用程式 → 複製 SDK 設定
// 3. 把下方的值換成你自己專案的值，存檔後重新部署
// 詳細步驟請見 README.md「自行架設教學」
// ============================================================
export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
