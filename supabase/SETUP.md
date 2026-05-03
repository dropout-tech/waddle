# Supabase 設定步驟

按順序執行以下步驟。預估時間 10-15 分鐘。

---

## 步驟 1：建立 Supabase 專案

1. 到 <https://supabase.com/dashboard> 登入
2. 點 **New Project**
3. 填寫：
   - **Name**: `waddle` (或任何你喜歡的名字)
   - **Database Password**: 自動產生即可，點旁邊的 copy 存到密碼管理員備用
   - **Region**: 選 `Northeast Asia (Tokyo)` 或 `Southeast Asia (Singapore)` (台灣最快)
   - **Pricing Plan**: Free
4. 點 **Create new project**，等 2-3 分鐘讓資料庫初始化

---

## 步驟 2：取得 API 金鑰

1. 等待初始化完成後，左側選單點 **Project Settings (齒輪)** → **API**
2. 複製這兩個值：
   - **Project URL** (例如 `https://abcdefg.supabase.co`)
   - **anon public** key (一長串 JWT)
3. 在專案根目錄建立 `.env.local` (不要 commit 進 git)：

   ```bash
   cp .env.local.example .env.local
   ```

4. 編輯 `.env.local`，填入剛才複製的兩個值：

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefg.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

---

## 步驟 3：執行資料庫 schema

1. 左側選單點 **SQL Editor** → **+ New query**
2. 開啟 `supabase/migrations/0001_initial_schema.sql`，全選複製到 SQL Editor
3. 點右下角 **Run** (或 Cmd+Enter)
4. 應該看到 `Success. No rows returned`
5. 重複以上步驟，這次貼上 `supabase/migrations/0002_rls_policies.sql`
6. 確認左側 **Table Editor** 看得到 `workspaces`, `categories`, `tasks` 等資料表

---

## 步驟 4：開啟 Email 認證

1. **Authentication** → **Providers** → **Email**
2. 確認 **Enable Email provider** 是開啟的
3. **建議開發階段**：把 **Confirm email** 關掉 (註冊後直接登入，不用驗證信件)
   - 上線前再打開
4. 點 **Save**

---

## 步驟 5：開啟 Google OAuth

### 5.1 在 Google Cloud Console 建立 OAuth Client

> 介面如果是中文，按括號裡的中文選項即可。

1. 到 <https://console.cloud.google.com/>
2. 上方藍色標題列點專案名稱 → **新增專案 (NEW PROJECT)** 建立一個新 Project，名稱填 `waddle` 即可。建好後切換到這個 Project。

3. 左側選單（漢堡選單）→ **APIs 和服務 (APIs & Services)** → **OAuth 同意畫面 (OAuth consent screen)**
   - **使用者類型 (User Type)**：選 **外部 (External)** → 點 **建立 (CREATE)**
   - **應用程式名稱 (App name)**：`Waddle`
   - **使用者支援電子郵件 (User support email)**：選你的 Email
   - **應用程式標誌 (App logo)**：可略過
   - 下面 **應用程式網域 (Application home page / Authorized domains)** 全部留空也沒關係
   - **開發人員聯絡資訊 (Developer contact information)**：填你的 Email
   - 點 **儲存並繼續 (SAVE AND CONTINUE)** 一路到底（中間 Scopes / Test users 兩步直接 SAVE AND CONTINUE 跳過即可）
   - 最後回到 Dashboard

4. 左側選單 → **APIs 和服務 (APIs & Services)** → **憑證 (Credentials)**
   - 上方點 **+ 建立憑證 (CREATE CREDENTIALS)** → 下拉選 **OAuth 用戶端 ID (OAuth client ID)**
   - **應用程式類型 (Application type)**：選 **網頁應用程式 (Web application)**
   - **名稱 (Name)**：`Waddle Web`
   - 滾到下面 **已授權的重新導向 URI (Authorized redirect URIs)**，點 **+ 新增 URI (ADD URI)**，填入：
     ```
     https://jnikcndiexjojgvicohf.supabase.co/auth/v1/callback
     ```
     （這是你的 Supabase 專案 callback URL，已經幫你填好專案 ID）

5. 點 **建立 (CREATE)**，會跳出 **用戶端 ID (Client ID)** 和 **用戶端密鑰 (Client Secret)**，**兩個都複製起來** 貼到記事本暫存。
   - 如果視窗關掉了，可以隨時回到 **憑證 (Credentials)** 頁面，點剛建好的那筆 OAuth client，右上角有 **下載 JSON** 或重新查看。

### 5.2 在 Supabase 啟用 Google Provider

1. 回 Supabase Dashboard → **Authentication** → **Providers** → 找到 **Google**
2. 把 **Enable Sign in with Google** 開關打開
3. **Client ID (for OAuth)**：貼上剛才複製的 Client ID
4. **Client Secret (for OAuth)**：貼上剛才複製的 Client Secret
5. 上方那欄 **Callback URL (for OAuth)** 應該是 `https://jnikcndiexjojgvicohf.supabase.co/auth/v1/callback`，跟步驟 5.1 第 4 點填的 redirect URI **完全相同**才會通
6. 點下方 **Save**

---

## 步驟 6：設定 Site URL

1. **Authentication** → **URL Configuration**
2. **Site URL** 填 `http://localhost:3000`
3. **Redirect URLs** 加入：
   ```
   http://localhost:3000/**
   ```
4. 點 **Save**

> 上線後：Site URL 改成正式網域，Redirect URLs 加上正式網域 `/**`

---

## 步驟 7：驗證設定

啟動 dev server：

```bash
npm run dev
```

打開 <http://localhost:3000>，應該會被導到 `/login`。
試試註冊一個新帳號，看 Supabase Dashboard 的 **Authentication → Users** 是否出現新使用者。
然後到 **Table Editor → profiles**，確認自動建立了 profile 資料列。

---

## 疑難排解

| 症狀 | 解法 |
| --- | --- |
| `Invalid API key` | 確認 `.env.local` 內 anon key 沒有換行/空白，重啟 dev server |
| 註冊後沒收到驗證信 | 暫時關閉 **Confirm email** (步驟 4)，或檢查垃圾信 |
| Google 登入跳轉後 404 | 步驟 5.1 的 redirect URI 必須**完全等於** Supabase 顯示的 callback URL |
| 登入成功但 RLS 拒絕讀取 | 確認 0002_rls_policies.sql 有跑過、auth.uid() 有正確抓到使用者 |

---

## 下一步

設定都完成後告訴我，我會繼續做：
- `app/(auth)/login/page.tsx` 登入頁
- `app/(auth)/signup/page.tsx` 註冊頁
- `middleware.ts` 路由保護
- 把 `app/page.tsx` 的 useState 改用 Supabase
