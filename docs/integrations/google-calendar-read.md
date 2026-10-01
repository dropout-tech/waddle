# Google 日曆（唯讀）上線交接

分支：`feat/google-calendar-read`｜狀態：本機完成與驗證，**尚未部署、尚未套正式庫**。

## 這個功能做什麼
別人寄 Google 會議邀請給你 → 會議出現在你的 Google 主日曆 → Huddle 行事曆（週／日／月）自動顯示。
只讀、不寫回 Google、不從 Huddle 發邀請。共享夥伴看不到這些會議。
另外（2026-09-29 老闆拍板）：「約交集」會把 Google 會議算成忙碌——自己約別人、共享夥伴約我，兩種都算；夥伴只得到「幾點到幾點忙」，看不到標題。

## 架構
```
瀏覽器 / iOS App
  ├─ /settings/google-calendar           連結、解除連結、狀態（原生 App 只顯示「請到網頁版連結」）
  ├─ /settings/google-calendar/callback  Google 授權返回頁（此路徑排除在 Supabase detectSessionInUrl 之外）
  └─ hooks/use-google-calendar-events.ts 行事曆資料：status → events（兩段 ≤62 天）→ 疊加到 peerEvents（唯讀）
        │  supabase.functions.invoke('google-calendar')
        ▼
Edge Function supabase/functions/google-calendar（index.ts + core.mjs）
  actions: status / start / finish / disconnect / set_share_busy / events / busy
  ├─ OAuth：PKCE S256；state 只存 hash、10 分鐘有效、一次性；綁 user id 與 JWT session_id
  ├─ refresh token：AES-GCM 加密（金鑰 GOOGLE_CALENDAR_TOKEN_KEY，不進 DB），additionalData 綁 user id
  └─ events：GET calendars/primary/events?singleEvents=true&orderBy=startTime（完整分頁、401 refresh、
             invalid_grant → 標 reauth_required 並回 200），濾掉 cancelled / 自己 declined / workingLocation，
             只回 id、title、start、end、all_day、location、response_status、html_link。**事件內容不落 DB。**
  └─ busy（約交集）：peer_ids（可含自己，最多 11 人）＋ time_min/time_max，嚴格窗口（core.mjs parseBusyRange）：
             time_min ≥ 現在−1 天、time_max ≤ 現在＋92 天（前端上限 90 天＋緩衝）、窗寬 ≤ 16 天（前端 14 天＋前一天＋緩衝）
             → 夥伴無法一段段翻出對方多年的忙碌時段。events（自己看自己）仍是 120 天規則
             ① 用「呼叫者自己的 JWT」呼叫 get_share_peers ＋讀 calendar_share_grants（RLS 下），
                只留「有共享、且對方在這個共享上有開放項目」的人——與前端約交集的 sharing_required 規則相同；其他 id 一律忽略
             ② 對每位有 Google 連線的人：自己一律納入；夥伴只在 share_busy=true 時納入
             ③ 用「那個人自己的」refresh token 讀他的 primary（Google 那端連標題都不請求），
                排除 cancelled、本人 declined、transparency=transparent、workingLocation
             ④ 只回 [{user_id, start, end}]（全天事件 start/end 為日期）；某人授權失效 → 列進 unavailable、標 reauth_required，整體仍 200
        ▼
Postgres（migration 20260929180000_google_calendar_read.sql）
  google_calendar_connections（user_id、refresh_cipher、scope、status、share_busy（預設 true）、last_error、時間戳）
  google_calendar_oauth_states（state_hash、user_id、session_id、verifier_cipher、expires_at）
  兩表 RLS on、anon/authenticated 全部 revoke、只給 service_role；auth.users on delete cascade（刪帳號即清）
```
隱私界線：Google 事件只進行事曆畫面的唯讀疊加層；不進 `get_shared_calendar`、不進匯出（calendar-export 吃 workspaces/timeBlocks）。
「約交集」只拿 busy 的忙碌區間（hooks/use-meeting-invitations.ts → lib/google-calendar.ts `fetchGoogleBusy`），夥伴的 Google 會議**不會**出現在我的行事曆上。
busy 呼叫失敗或有人 unavailable → 空檔照算，對話框顯示「部分 Google 行程未納入」（不靜默算錯）；整合未設定（503 not_configured）或函式未部署（404）→ 視為沒有 Google，不顯示提示。

⚠️ **給 Google 審核的用途說明必須寫到這點**：`busy` 會用 A 的授權，替 B（A 的共享夥伴）的請求讀取 A 的主日曆，但只輸出忙碌區間（開始／結束時間），不含標題、地點、連結、事件 ID；A 可在設定頁關掉「讓共享夥伴約時間時避開我的 Google 會議」。

## 環境變數（Supabase Edge Function secrets）
| 名稱 | 內容 |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud OAuth「網頁應用程式」用戶端 ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | 同上的用戶端密鑰 |
| `GOOGLE_CALENDAR_TOKEN_KEY` | 32 bytes 隨機值，base64url。產生：`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `https://<正式站網域>/settings/google-calendar/callback`（必須 https，且與 Google Cloud 設定逐字相同） |

四個缺任何一個 → `status` 回 `configured:false`，設定頁顯示「尚未啟用」，行事曆不發任何 events 請求。**這就是功能開關。**
`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 由平台自動提供。
⚠️ `GOOGLE_CALENDAR_TOKEN_KEY` 設定後不可更換：換了就解不開既有連線，所有人要重新連結。

## 老闆要在 Google Cloud 做的事
1. Google Cloud Console → 選（或新建）專案 → 「API 和服務」→「程式庫」→ 啟用 **Google Calendar API**。
2. 「OAuth 同意畫面」：User type 選「外部」；填應用程式名稱（Huddle）、支援信箱、隱私權政策網址（正式站 /privacy）。
3. 「範圍」加入 `https://www.googleapis.com/auth/calendar.events.owned.readonly`（顯示為「查看你擁有的 Google 日曆中的活動」）。不要加其他日曆範圍。
4. 「測試使用者」加入老闆自己與要試用的 Google 帳號（Testing 模式只有列在這裡的帳號能授權）。
   驗 busy（約交集）至少要兩個互為共享夥伴、且都連了 Google 的測試帳號。
5. 「憑證」→ 建立 OAuth 用戶端 ID → 類型「網頁應用程式」→「已授權的重新導向 URI」填
   `https://<正式站網域>/settings/google-calendar/callback`（目前 repo 內已知正式站為 `https://waddle.zeabur.app`，若有自訂網域以實際網域為準）。
   本機測試可另加 `http://localhost:3000/settings/google-calendar/callback`（但 Edge Function 目前只接受 https 的 redirect，本機要真跑 OAuth 需另議）。
6. 把用戶端 ID／密鑰交給工程端（不要貼在聊天或 commit 裡）。
7. 之後要開放給所有使用者：送 Google 驗證（此範圍屬敏感範圍，通常需要說明用途與示範影片）。

## 設定 secret（值用佔位符，實際值不要進版控）
```bash
supabase secrets set --project-ref <已確認的專案 ref> \
  GOOGLE_CALENDAR_CLIENT_ID='<client-id>.apps.googleusercontent.com' \
  GOOGLE_CALENDAR_CLIENT_SECRET='<client-secret>' \
  GOOGLE_CALENDAR_TOKEN_KEY='<32-byte-base64url>' \
  GOOGLE_CALENDAR_REDIRECT_URI='https://<正式站網域>/settings/google-calendar/callback'
supabase secrets list --project-ref <已確認的專案 ref>   # 只確認名稱存在
```

## 部署順序（每步都要老闆同意；照 lessons：套 migration 前先印連線目標核對身分）
1. **套 migration**（正式庫）：`supabase db push --dry-run` 先確認只多 `20260929180000_google_calendar_read.sql` 一支 → 再 `supabase db push`。
2. **部署函式**：`supabase functions deploy google-calendar --project-ref <ref>`（預設 verify_jwt，與 delete-account 相同）。
   此時還沒設 secret → 函式回 `configured:false`，前端顯示「尚未啟用」，對使用者無影響。
3. **合併前端**（PR → main → Zeabur 自動部署）。沒設 secret 前，行事曆每次載入只多一個 status 請求，不顯示任何東西。
4. **設 secret**（上一節）→ 功能即開啟。
5. 驗收：老闆用測試使用者帳號在網頁版設定頁連結 → 行事曆看到 Google 會議 → iPhone App 登入同帳號也看到 → 解除連結後消失。
   約交集：A、B 互為共享夥伴且都連了 Google → B 在 Google 放一個會議 → A 約交集找不到那段空檔；B 關掉設定頁開關 → 再找就出現。
   本機回歸：`node scripts/test/google-calendar-core-verify.mjs`、`-handler-verify.mjs`、`-map-verify.mjs`、`bash scripts/test/google-calendar-db-verify.sh`、`BASE_URL=http://localhost:<port> node scripts/e2e/google-calendar-read-verify.mjs`。

## 回滾
- **最快（關功能）**：`supabase secrets unset GOOGLE_CALENDAR_CLIENT_ID --project-ref <ref>` → 立刻 `configured:false`，行事曆不再抓 Google。連線資料保留，重新 set 就恢復。
- **撤前端**：revert 前端 PR（Zeabur 重新部署）。函式與表留著無害。
- **完全移除**：`supabase functions delete google-calendar`；需要清資料再另寫 migration drop 兩張表（會丟掉所有人的連線，要先問）。
- 使用者端：Google 帳戶 →「第三方應用程式與服務」可自行移除 Huddle 權限；之後 Huddle 會顯示「需要重新授權」。

## 已知限制
- **原生 App 內不能連結**：App／桌面版只顯示「請到網頁版連結，連好後 App 也會顯示」。原生 OAuth 返回（deep link）本次未做。
- **Testing 模式 refresh token 約 7 天到期**：到期後設定頁顯示「需要重新授權」，行事曆暫時不顯示 Google 會議，重新連結即恢復。要長期使用需把同意畫面發布為 Production（並通過驗證）。
- **未驗證 app**：使用者會看到「Google 尚未驗證這個應用程式」警告畫面，且新使用者上限 100 人；發布 + 通過驗證後解除。
- 只讀主日曆（primary）；其他日曆（訂閱、共用日曆）不顯示。
- 每次 events 請求都用 refresh token 換一次 access token（不快取 access token）；量大時可改快取。
- 視窗是「選取月前一個月到後兩個月」，前端拆兩段 ≤62 天請求（函式上限 120 天）；單次最多 20 頁×250 筆。
- 不在行事曆可見時段內（例如設定從 06:00 開始）的片段不畫；點其他片段的詳情仍顯示完整時間。
- `workingLocation`（上班地點標記）不顯示，因為它不是會議。
- busy 每次約交集搜尋會替每位納入的人各換一次 access token、讀一次 Google（最多 11 人，平行）；夥伴多、事件多時搜尋會變慢。
- 約交集搜尋日期上限改為「今天起 90 天內」（前端 date input max＋findSlots 檢查，後端同步限制）；原本前端沒有上限。
- 約交集對話框既有說明文字已改為「已連結 Google 日曆的人，其 Google 會議會算成忙碌；未共享的行事曆不包含。」（中英，待老闆審）。
