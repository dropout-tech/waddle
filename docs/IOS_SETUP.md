# Huddle iOS（Capacitor）上架 Runbook

本文件是把 Huddle 包成 iOS App Store app 的「照著做」清單。程式碼層（auth、原生通知、分享、殼體、改名、刪帳號）都已在 codebase 完成；以下是**需要本機 Xcode / Apple 帳號 / 各家主控台**才能完成的步驟。

架構：一套 Next.js codebase → `BUILD_TARGET=capacitor` 產出離線靜態檔 `out/` → 包進 Capacitor iOS 殼。web 版照常用 `next build`。web 與 iOS **共用同一個 Supabase 專案/DB**。

> 識別碼集中在 [lib/native-config.ts](../lib/native-config.ts) 與 [capacitor.config.ts](../capacitor.config.ts)。目前 `appId` 是佔位 `com.huddle.app`、URL scheme `huddle`。**換成你自己的反向網域時，這兩個檔 + Xcode + 各主控台要一起改。**

---

## 0. 前置安裝（並行辦）

- **Xcode**（Mac App Store，約 7GB+）。裝完跑一次 `sudo xcode-select --switch /Applications/Xcode.app` 並開啟同意授權。
- **CocoaPods**：`sudo gem install cocoapods`（或 `brew install cocoapods`）。
- **Apple Developer Program**（$99/年）—— 簽章、Sign in with Apple、TestFlight、送審都需要。
- **Supabase CLI**（部署刪帳號 Edge Function 用）：`brew install supabase/tap/supabase`。

---

## 1. 產生 iOS 原生專案（裝好 Xcode 後）

```bash
pnpm build:cap          # 產出 out/（靜態匯出）
npx cap add ios         # 建立 ios/ 原生專案並 pod install
pnpm cap:sync           # = build:cap + cap sync ios（之後每次改完前端都跑這個）
pnpm cap:open           # 用 Xcode 開啟
```

> `ios/` 要 commit（裡面有手改的 Info.plist / capabilities）。

---

## 2. Xcode 設定

在 Xcode 開啟後（`App` target）：

1. **Signing & Capabilities → Team**：選你的 Apple Developer team；確認 Bundle Identifier = `com.huddle.app`（或你改的）。
2. **+ Capability** 加入：
   - **Sign in with Apple**
   - **Push Notifications**（本地通知雖不需 APNs，但加上不會錯；若只用本地通知可略）
3. **URL Types**（Info → URL Types，或編輯 `ios/App/App/Info.plist`）：新增一個 URL Scheme = `huddle`（對應 deep-link OAuth callback `huddle://auth/callback`）。

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>huddle</string></array>
  </dict>
</array>
```

---

## 3. App 圖示與啟動畫面

來源圖：`public/apple-icon.png`（或企鵝吉祥物高解析圖）。用 Capacitor 官方工具產生整套：

```bash
pnpm add -D @capacitor/assets
# 放一張 1024x1024 的 icon.png 與 splash 圖到 assets/ 後：
npx capacitor-assets generate --ios
```

啟動畫面底色已在 `capacitor.config.ts` 設為品牌奶油色 `#fdf8ec`。

---

## 4. Supabase 主控台

1. **Authentication → URL Configuration → Redirect URLs** 加入：
   - `huddle://auth/callback`（iOS deep link）
   - 既有的 web callback（`https://<你的網域>/auth/callback`）保留
2. **Authentication → Providers → Apple**：啟用，填入 Services ID、Team ID、Key ID、Apple 私鑰 `.p8`（見下一節產生）。
3. Google provider 維持現狀即可（Supabase 代理 OAuth round-trip，iOS 不需另開 Google client）。

### 部署刪帳號 Edge Function（App Store 5.1.1 必需）

```bash
supabase link --project-ref <你的 project ref>
supabase functions deploy delete-account
```

`SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY` 由平台自動注入，**service-role key 只存在於 function、絕不進前端**。所有資料表對 `auth.users` 都有 `on delete cascade`，刪 auth user 會連帶刪光資料。

---

## 5. Apple Developer 主控台（Sign in with Apple，4.8 必需）

1. **Identifiers → App IDs**：用 `com.huddle.app` 建立，勾選 **Sign in with Apple**。
2. **Identifiers → Services IDs**：建立一個 Services ID（例如 `com.huddle.signin`），設定回呼網域與 return URL 指向 Supabase 的 callback。把這個 Services ID 填回 `lib/native-config.ts` 的 `APPLE_SERVICES_ID` 與 Supabase Apple provider。
3. **Keys**：建立一把 **Sign in with Apple** key，下載 `.p8`，記下 Key ID，填到 Supabase Apple provider。

---

## 6. 跑起來驗證（模擬器即可，免 Apple 帳號）

```bash
pnpm cap:sync
pnpm cap:open   # Xcode 選一台 iPhone 模擬器 → Run
```

逐項確認：

1. 冷啟 → 登入頁（client auth guard 生效，無空畫面閃現）。
2. Email 登入 → 從共用 Supabase 載入資料。
3. 殺掉 app 重開 → 仍登入（@capacitor/preferences 持久化 session）。
4. 設定裡開「會議提醒 5 分鐘」→ 排一個 6 分鐘後的會議 → app 退到背景 → 本地通知準時響、點擊可開會議連結。
5. 日曆「匯出 PNG」→ 跳出 iOS 分享 sheet。
6. 設定 → 刪除帳號 → 確認框 → Edge Function 成功 → 自動登出回登入頁。
7. 登出 → 回登入頁。
8. web 版未受影響：`pnpm dev` 與 `pnpm build:web` 正常。

> Sign in with Apple / Google 的**端到端**測試需要真機 + Apple Developer 簽章 + 第 4、5 節主控台設定完成。

---

## 7. 送審前合規清單

- [ ] **Sign in with Apple** 已加（因為提供 Google 登入 → Guideline 4.8）。
- [ ] **App 內刪除帳號** 已可用（Guideline 5.1.1(v)）。
- [ ] **離線可開**（已離線打包，非套網站 → Guideline 4.2）。
- [ ] **真原生功能**：本地背景通知、觸覺、啟動畫面、安全區。
- [ ] **隱私政策 URL**（可放在 web 版的一個靜態頁）。
- [ ] **App Privacy「nutrition labels」**：收集 Email（Supabase Auth）、使用者內容（任務/日記）。
- [ ] 各尺寸**截圖**（用模擬器拍）。
- [ ] App 圖示 / 啟動畫面（第 3 節）。

---

## 8. 換 Bundle ID 時要改的地方（之後拿到自有網域）

1. [lib/native-config.ts](../lib/native-config.ts) → `APP_ID`
2. [capacitor.config.ts](../capacitor.config.ts) → `appId`
3. Xcode → Bundle Identifier
4. Apple Developer App ID / Services ID
5. Supabase redirect URL 的 scheme（若連 scheme 一起換）

改完跑 `pnpm cap:sync`。
