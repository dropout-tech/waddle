# Windows 桌面測試版 0.1.2

Windows x64 安裝檔：`Huddle-0.1.2-win-x64.exe`，加入既有 `v0.1.2-beta.1` release；Mac 檔案保持原樣。桌面程式碼與該版本相同，新增 Windows 建置及安裝驗證流程，以及官網中英文下載入口。

## 使用

下載 EXE，依安裝精靈選擇路徑，從桌面或開始功能表啟動 Huddle。需要網路，使用既有帳號登入。此版沒有 Windows 程式碼簽章，Windows 可能顯示安全提示。未提供 Windows ARM64 原生安裝檔。更新時需重新下載安裝。

## 驗證證據

- Windows runner：https://github.com/dropout-tech/waddle/actions/runs/36114996328
- 16 項桌面測試通過，涵蓋 OAuth、通知帳號隔離、導覽安全。
- NSIS 安裝程式在 Windows runner 靜默安裝成功，測試啟動的是安裝目錄中的 EXE。
- 實際 Electron renderer/preload IPC、OAuth begin/cancel、主視窗最小化／還原與置頂浮動視窗通過；runner 保存視窗截圖。
- 已產生 `WINDOWS-SHA256SUMS.txt`，下載 CI artifact 後另行比對。
- 網頁 TypeScript、production build、中英文官網 Windows 下載連結瀏覽器檢查通過。

## 驗證限制

Runner 使用本機測試頁驗證原生容器，沒有以真實帳號完成 Google/Apple consent，也沒有證明使用者 Windows 通知中心實際顯示通知。通知 API 支援狀態不代表權限或實際送達。未驗證互動式安裝每個精靈畫面或 Windows ARM 裝置。

## 重跑

執行 GitHub Actions 的 `Windows desktop beta` workflow，或在 Windows 執行 `pnpm install --frozen-lockfile`、`node --test desktop/*.test.cjs`、`pnpm desktop:dist:win --publish never`。安裝後以 `node scripts/tests/windows-desktop-smoke.cjs <已安裝的Huddle.exe路徑>` 驗證。
