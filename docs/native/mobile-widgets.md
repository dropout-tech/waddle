# Huddle 手機小工具實作

2026-09-25。使用者已確認前面全部規劃保留，iPhone 與 Android 都做；正式角色只能直接使用 `public/huddle-mascot.png` 原圖。兩個原生副本以 SHA-256 測試確認一致，示意圖中的重繪角色不得當作正式素材。

## 已實作的程式

- `/widgets/`：11 款小工具的互動預覽，小／中／大尺寸、示範資料與登入後實際資料。
- 類型：月曆＋今日任務、可視化小月曆、近期行程、任務清單、今天三件事、白板、記事本、專注記事、專注計時、喝水提醒、三合一隨手記入口。
- App 內操作：任務勾選、新增任務、編輯既有白板、開啟與新增筆記、每日／主題專注記事、計時開始／暫停／繼續／結束、喝水／延後提醒。
- WidgetKit extension：可選 11 種內容、三種主畫面尺寸、分類文字篩選與筆記 ID 釘選。鎖定畫面僅顯示入口。專注 Live Activity 顯示通用專注狀態與倒數，不洩漏私密任務標題。
- Android AppWidget / RemoteViews：11 種內容選擇、可重新設定與調整尺寸、主畫面日期格、內容與開啟入口。使用 RemoteViews 而非 Glance，減少新增依賴。
- Native bridge：App Group（iOS）／app-private SharedPreferences（Android）快照、帳號 epoch、有限且可重試的完成任務佇列；不傳送 OAuth token、圖片網址或完整筆記。
- 原生「完成任務」先顯示待同步，App 前景執行時以目前登入者、任務 user_id、updated_at 比對後寫入；只設定完成，不做 toggle。重複、刪除、封存、版本衝突與換帳號動作不覆寫資料。重複任務在 App 中處理，避免誤改整組。
- 原有會議通知改為只取消 meeting 命名空間，保留專注／喝水提醒；使用者按「啟用背景提醒」取得通知權限後才排程。提醒使用通用文案。
- 專注 session／待寫入紀錄新增帳號隔離。舊版沒有帳號資訊的本機 timer keys 保留但不自動歸屬新帳號。

## 尚未完成或不得視為已驗證

這份程式還不是完整交付或商店可發布版本：

1. iPhone 原生完整 build／安裝與 WidgetKit 實機驗收受本機 Xcode 缺 iOS 26.5 平台元件阻擋。Swift extension 與 Capacitor bridge 可做獨立 typecheck，但不能代替完整建置。
2. Android SDK API 36 與 Build Tools 36 安裝需要 Google SDK License；等待使用者同意後才能繼續 APK 建置。不能把只產生 android/ 稱為已通過編譯。
3. iOS App Group `group.com.lazylazy.huddle`、extension bundle `com.lazylazy.huddle.widgets` 需開發者帳號註冊與簽署；尚未修改 Apple 帳號。
4. 原生小工具的計時控制、喝水動作、文字編輯透過安全入口開啟 App。除了非重複任務完成外，尚非所有操作都能在不開 App 時完成。
5. Android 計時顯示最後快照的時間，尚需換成原生持續倒數／ongoing notification。Android 鎖定畫面不在本輪宣稱支援。
6. 月曆目前是日期格＋安排標記；尚未實作示意圖的跨日色帶、原生月曆翻月與逐日清單切換。資料以 App 上次開啟快照為準，沒有背景雲端同步。
7. 白板原生預覽是從實際文字項目產生的安全摘要縮圖，不是完整自由畫布的像素一致縮圖；圖片與連結內容不帶入。
8. 尚需完善每個 widget instance 的白板／記事本選取 UI、記事 checklist 直接勾選、Android 分類篩選、雙語、Dynamic Type／各 OEM 尺寸與暗色模式驗收。
9. 真實帳號的整條同步路徑、離線恢復、換帳號、鎖屏隱私與通知顯示仍需實機驗收；未新增正式測試資料。

## 入口與資料邊界

`huddle://widget/<kind>?id=...&date=...&accountId=...&epoch=...` 僅接受白名單 kind／ID／日期。OAuth callback 保持獨立。冷啟動暫存目的地，登入後檢查來源帳號再打開 `/widgets/`，資源只從登入者可讀資料中選取。

今日任務與日曆沿用 `taskOccursOnDate`，支援 recurrence/exdates；非重複未排程／到期未完成任務也可出現。小工具最多保留 20 筆任務與近期行程、8 則筆記、7 張每日白板，摘要上限 160 字。原生待同步佇列最多 50 筆。

## 驗證指令

```sh
pnpm exec tsc --noEmit
node --test scripts/tests/widgets.test.mjs
pnpm build:cap
pnpm exec cap sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
cd android && ./gradlew assembleDebug
```

`/widgets/` 互動預覽可不登入測試；它不等於 WidgetKit／Android launcher 的像素或行為驗證。每個平台必須另外記錄安裝包、裝置、OS、實際截圖與通過項目。

## 本輪驗證紀錄

- TypeScript 通過；靜態 App build 通過；Capacitor iOS／Android sync 通過。
- 7/7 Node 測試通過：日期格、重複任務、封存與摘要邊界、深連結、摘要上限、兩平台原始角色資產 SHA、當日主題專注記事內容。
- Swift extension／shared store／Live Activity 與 bridge 獨立 typecheck 通過。完整 xcodebuild 未通過，原因是缺平台元件。
- ESLint 0 errors，18 warnings（包含既有 timer effect 與新增 effect dependency 提示）；不宣稱 lint 零警告。
- Web 示範操作已檢查任務完成、記事編輯、計時、種類切換；390px 與1440px 無水平 overflow。截圖只代表網頁預覽。
- Finish review 已修正原生前三件事保留完成項目，以及專注記事取錯摘要的兩項問題；桌面與手機 Web viewport 的最終覆核通過；原生安裝與視覺驗收未完成。
- 沒有推送、發布、修改正式資料或接受 Google SDK 授權。

預覽：`http://127.0.0.1:4318/widgets/`（這台電腦的本機服務）。截圖：`widget-preview/mobile.png`、`widget-preview/desktop.png`。

## 設計還原修正

依使用者反映，將等寬卡片清單改回核准設計圖的三組構圖：月曆與今日任務／隨手記、白板、記事本／專注記事與任務。補回鼠尾草標題帶、暖米紙面、彩色便條與全寬記事動作；其餘五款保留於下方。原版角色未更換。1440px與390px皆無水平溢出，11款仍存在，專注記事入口可操作。Web fidelity review通過；仍有月曆翻月箭頭與白板連接箭頭的細節差異，原生未納入此次視覺修正。
