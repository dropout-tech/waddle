# 約交集與邀請 — 實作與上線準備

## 實作範圍

新的 RPC-only 邀請資料模型，與既有 `calendar_shares` 配對相接。僅既有共享日曆夥伴可被邀請；一次 1–10 人（重複選取去重，禁止自邀）。主辦人自動 accepted，其餘 pending，可接受、暫定、婉拒；主辦人可取消。邀請不自動寫入 Google Calendar，也不代表 Google OAuth Calendar 權限整合。

待部署 migration：`supabase/migrations/20260920173447_meeting_invitations.sql`，由 Supabase CLI `migration new` 建立。**本次沒有套用遠端資料庫、部署 Edge Function、或寄送任何真實 Email。**

## API

- `create_meeting_invitation(p_title text, p_description text, p_location text, p_start timestamptz, p_end timestamptz, p_time_zone text, p_invitees uuid[], p_request_id uuid) → uuid`
- `get_meeting_invitations(p_from timestamptz, p_to timestamptz) → jsonb[]`
- `get_meeting_invitation(p_meeting_id uuid) → jsonb`
- `get_meeting_invitation_by_request(p_request_id uuid) → jsonb | null`（僅查登入主辦人自己的 request，未找到回 null）
- `respond_meeting_invitation(p_meeting_id uuid, p_response text) → void`
- `cancel_meeting_invitation(p_meeting_id uuid) → void`
- `get_shared_meeting_busy(p_peers uuid[], p_from timestamptz, p_to timestamptz) → [{user_id, starts_at, ends_at}]`

型別見 `lib/meeting-types.ts`。單筆與列表同形，participants 僅顯示 user_id、display_name、response，沒有 Email。列表需參與、時間區間相交；單筆可處理舊邀請連結；第三者/不存在回同一權限錯誤。主辦人可讀 `email_status:{pending,sent,failed}`，受邀者此欄為 null。

已接受的 active 邀請提供 busy 時段，沒有標題/備註。自己的全部會議可讀；目前有共享關係的夥伴僅能讀「自己也是參與人」的共同邀請，不能由共享關係推論對方授權全部私人會議。混入未授權夥伴整個查詢拒絕。這只是會議的 busy 補充，必須與既有共享行程合併，UI 應說明依「已共享」資料找交集，不能宣稱涵蓋對方所有私人行程。

## 資料與權限

`meeting_invitations`、`meeting_attendees`、`meeting_email_outbox` 都啟用 RLS，client 直接讀寫權限全部撤除。public RPC 使用 invoker wrapper，privileged 工作限不對 Data API 暴露的 `meeting_private` schema；每個 helper 自行檢查 auth.uid() / membership，固定空 search_path，撤除 PUBLIC/anon 執行權限。無遞迴 RLS policy。

開始時間必須在未來、結束晚於開始且最長 24 小時；合法 timezone；標題 trim 後 1–200 字、備註最多 2,000、地點最多 500。查詢最長 366 天。主辦+request_id 唯一，transaction advisory lock 協調同一 request 重試；相同正規化內容返回原 ID，內容不同拒絕。時間以 epoch 放入 request payload，避免 session timezone 差異。回覆與取消共用 meeting row lock。create 回應遺失時，UI 先用相同 request_id 查 `get_meeting_invitation_by_request` 恢復原結果，再視需要以原 payload 重試 create；避免重新計算 availability 把剛建立的會議誤當衝突。第三人或受邀者使用相同 request_id 查詢均回 null。

邀請模式容許時間重疊（如一般行事曆邀請），不鎖定全部私人事件，也不保證選擇與送出間其他事件沒變；UI 必須重讀、標示衝突。主辦取消後 accepted 行程不再計入 busy。

## Email 準備

Edge Function：`supabase/functions/send-meeting-invitations/index.ts`，POST `{meeting_id}`，要求登入 JWT，`auth.getUser()` 驗證後再檢查主辦人身分。主辦建立與取消時 enqueue outbox，唯一 meeting/recipient/event_type；呼叫 Edge Function 才嘗試寄信。

必要環境變數：

- Supabase 注入的 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY。
- `RESEND_API_KEY`：server-only。
- `MEETING_EMAIL_FROM`：Resend 已驗證寄件網域的寄件地址。
- `APP_SITE_URL`：正式 HTTPS 官網 origin；站內 `/meetings/invitations?invite=<id>` 連結。

未設定時回 503 `email_not_configured`，outbox 保留 pending，不謊報已寄信。Email 中英並列、時段依指定 timezone 格式化，標題/描述/地點 HTML escape；收件 Email 僅 server 透過 admin user lookup 取得，永不回傳 client。成功回 `{sent,pending,failed}` 是寄件服務接受數，不是開信/送達保證。取消信有獨立事件及 idempotency key。

同 outbox UUID 使用同一 Resend idempotency key；已 sent 不重送。Resend 保留 key 24 小時，因此記錄 first_attempt_at，超過 23 小時的未確定寄送一律標記 `delivery_reconciliation_required`，需人工查 provider 紀錄後處理，避免重複寄信。未建自動 cron/Email 回覆解析、bounce webhook 或 Google Calendar 直寫。供應商設定、寄件網域、正式站 deep link 都要在上線前確認。

## 驗證

- `python3 scripts/test/meeting-backend-verify.py`：全新 Unix socket-only 本機 Postgres 16 temporary cluster，建立 auth/profile/share 最小 fixture，執行 migration；驗證匿名/第三者拒絕、禁止直接讀寫、共享成員、重試去重及不同 payload 拒絕、多人回覆、取消、busy 隱私、outbox 與單筆 deep link。完成後關閉/刪除 cluster。通過。
- `node scripts/test/meeting-email-verify.mjs`：實際 handler transpile 後注入 mock，9 組驗證 JWT、主辦、缺設定、HTML escaping、站內 URL、不洩漏 Email、成功/失敗/超期重試/已寄送/取消。無網路。通過。
- `supabase db advisors --db-url <temporary local Unix socket>` 已嘗試，但此 CLI 對 socket URL 解析錯誤，未能執行 advisors。未因此連線遠端。可在正式 release 的 Supabase 環境再跑 security advisors；本機已驗證實際角色權限。

## 參考

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)：invoker/definer 與固定 search_path。
- [Supabase changelog](https://supabase.com/changelog.md)：2026-09-21 查閱，未看到影響此 SQL RPC 設計的近期 breaking change。
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)：24 小時重試範圍。

## 前端與空檔計算

桌面日曆工具列在記事本／跳窗旁加入入口，手機收在日曆工具選單。中英文介面支援選擇共享夥伴、最多 14 天的日期範圍、每日時段與會議長度，突出可選空檔；接受的邀請顯示於日曆，會議不可當作一般任務拖曳或完成。跨日會議依當地日期拆成顯示區段。

空檔讀取有完整分頁與總筆數檢查；缺少共享權限、缺少筆數或分頁異常均停止計算，不把未知行程當成空閒。既有任務、共享事件、午休、時間區塊與已接受會議一起計算，包含重複事件、跨午夜及夏令時間。送出前重查；這不是鎖定時段的預訂系統。

Email 連結可經過登入返回指定邀請。回傳路徑限定 UUID，不接受任意外站跳轉；登入後清除暫存邀請。下載的 ICS 是獨立日曆匯入檔，不會自動同步後續更新。

`node scripts/e2e/meeting-availability-verify.mjs` 的 59 項檢查通過，含台北與紐約時區。瀏覽器測試 `node scripts/e2e/meeting-ui-verify.mjs` 中英文桌面／手機 54 項通過，包含伺服器每頁僅 2 筆、第二頁忙碌資料、登入回邀請、回應遺失後重試、Email 失敗與重試、回覆、取消及唯讀日曆。測試使用完整本機 mock，不發送真實邀請。另有既有 OAuth callback 9 項回歸、TypeScript、目標 ESLint 與 production build 通過。

## 正式啟用順序

1. 確認寄件名稱、已驗證網域信箱與正式站 HTTPS origin。
2. 對正式資料庫審查／套用 migration，核對角色權限與現有共享模型。
3. 在伺服器設定 Resend 金鑰與寄件環境變數，部署 Email Edge Function。
4. 發布前端並以指定測試帳號驗證邀請、Email 連結、回覆、取消與重試；真實寄信測試需指定收件者。

目前本機實作與整合驗收完成；正式資料庫、寄信服務與發布尚未執行。


## 2026-09-25 整合驗收

從 `382c21c` 獨立移植到目前工作分支基底 `a907da0`，未攜入舊分支的會員方案、官網或 Google Calendar 設定。日曆保留桌面入口與手機更多選單入口。

- 邀請路徑改為 `/meetings/invitations?invite=<uuid>`；Email、登入後返回與測試同步更新。保留正在開發的 `/meetings` 錄音／文字會議紀錄頁。
- 讀取自己的任務、時間區塊與夥伴共享行程時保留秒數，避免資料映射提前截斷，將仍被占用的時段列為可用。
- 修正 Hook 在 render 期間寫入 ref；保留帳號隔離與舊請求結果檢查。新增程式已整理格式。
- 空檔／ICS：台北 28 項、紐約 31 項通過。
- 瀏覽器：中英文桌面與 390px 手機共 60 項，包含三種來源的秒數精度、分頁完整性、登入返回、建立回應遺失、寄信失敗／重試、回覆、取消、唯讀行程與無橫向溢出。使用 mock；沒有寄出真實 Email。
- 本機 Postgres：migration、匿名／第三者拒絕、禁止 client 直寫、重試去重、回覆、取消與忙碌隱私通過。
- Email handler：9 組 mock 測試通過。
- TypeScript 與 production build 通過；變更檔案 ESLint 無 error，既有檔案仍有 12 項 warning。

限制：只涵蓋已共享資料；未整合外部日曆；帶 recurrenceRule 的時間區塊會停止計算並提示失敗，不會當作空閒。查詢／送出之間沒有時段鎖定。正式 migration、寄件網域與金鑰、Edge Function 發布及真實帳號測試屬後續上線工作。
