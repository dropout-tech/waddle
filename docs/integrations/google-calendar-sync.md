# Google Calendar 同步設計

2026-09-21。使用者要求同步到 Google Calendar；已詢問單向／雙向，尚未收到回答。本稿先以 Huddle → Google Calendar 為建議第一版，雙向不視為已確認。這是整合規格，不是已完成的串接；沒有存取或改動真實 Google 日曆。

## 產品行為

使用者在設定 → 行事曆整合點「連結 Google Calendar」，用系統瀏覽器選 Google 帳號並另外授權。Google 登入 Huddle 不代表同意讀寫日曆。連結後建立獨立 Huddle 日曆，首次確認要同步的本人工作區與時區，顯示資料範圍後才開始。

同步包含自己的已排程任務，以及自己主辦／已接受的站內會議。未排時間待辦不變成假全天事件。更新標題／時間／地點更新同一 Google 事件；取消排程／刪除移除對應事件；完成任務保留其歷史日曆紀錄。共享夥伴的私人資料與他人日曆覆蓋不匯出。任務 attendees 是自由文字，不能當 Google 收件地址；不自動發送 Google 邀請信，以免與 Huddle Email 重複。

第一版 Google 端修改不回寫 Huddle，UI 顯示以 Huddle 為主。若偵測對應事件在 Google 被修改，顯示差異並提供「以 Huddle 更新」操作；不默默覆寫。取消連結停止工作、撤銷授權並刪除伺服器憑證，預設保留 Google 上已建立的日曆。刪除遠端日曆須使用者另行選擇，不和解除連結綁定。

狀態：未連結／待首次同步／同步中／已同步（時間）／部分失敗／需要重新授權／暫停。提供重試與手動立即同步；不能只因加入 queue 就顯示成功。目標正常情況 1 分鐘內同步，這是設計目標，非已驗證 SLA。

## 方案建議

建議免費與 Pro 均包含 1 個 Google 帳號及 1 個 Huddle 專屬日曆的基本單向同步；同步正確性、更新與刪除、重新授權不能分成付費可靠與免費不可靠。Pro 延續多人協作額度。多 Google 帳號、雙向同步可作後續評估，但未實作前不列可購買權益。需使用者核定功能歸屬，現有定價頁不改成已支援。

## Google 授權與上架

單向專屬日曆採最小範圍 calendar.app.created，可建立次要日曆並管理其中事件。不要求完整日曆讀寫，也不把既有私人 Google 日曆當成共同空檔來源。若使用者選雙向或要用 Google 行程排除忙碌，需要另外確認讀取範圍、增量同步及授權。

使用獨立 OAuth flow，server 以一次性有期限 state 綁定 Huddle user/session、精確 redirect URI 與 PKCE。callback 原子消耗 state 防重播；拒絕授權保持原狀。refresh token 僅存伺服器加密欄位，金鑰用 server secret；禁止 client 查讀、console 輸出或放在 localStorage。不要更換目前 Google 登入 scope 以免破壞登入流程。

正式前需 Google Cloud 專案啟用 Calendar API、OAuth client、正確 redirect URI、品牌與已驗證網域、公開隱私政策、需要時的 OAuth 驗證。Testing 狀態取得含 Calendar scope 的 refresh token 一般 7 天到期，不能宣稱可長期使用。還要分別驗證 web、Electron 外部瀏覽器、iOS／Android 授權返回。

## 與現有資料對接

現有 tasks.google_event_id 只是未使用欄位，不足以表示每個帳號、日曆、重複實例與刪除同步。建立獨立 connection、event_mapping、sync_outbox、oauth_state 模型。資料庫 mutation/outbox 可覆蓋 use-waddle-data 的新增、更新、排程、取消、批次刪除、匯入覆蓋、工作區／分類 cascade 與 recurrence detached child；不要只在單一拖曳 handler 呼叫 Google。

mapping 至少包含 Huddle user、connection generation、source kind/id/occurrence date、Google calendar/event ID、etag、source revision、payload hash、last synced time。刪除 source 不得 cascade 清掉未送出的刪除紀錄；保留 tombstone，Google 確認後才清理。相同 operation/source revision 去重；worker 對 connection 串行，舊 generation 的工作不能在重連後寫入新帳號。DB 與 Google 不能共同 transaction，須依穩定 Google event ID 和重試對帳避免重複。

時區：現有任務日期＋時間沒有 IANA zone。連結時明確選擇並保存，例如 Asia/Taipei，不能依 Edge Function 伺服器 UTC 解讀。事件 end 為 exclusive，處理午夜／跨日、DST、重複規則、例外日期及移動的單次實例。映射應依現有 taskOccursOnDate 語意，不直接假設任何 RRULE 與目前 custom/monthly 相同。可先以有明示範圍的實例物化並每日延展，範圍需在 UI 公告；在選定方案前不承諾無限未來事件全部同步。

worker 從權威資料讀取，完整分頁；讀取失敗不能當成「所有事件已刪除」。Google 429／5xx exponential backoff+jitter；401 refresh 一次，invalid_grant 標記重新授權；403 不盲目重試；404/410 刪除視為已不存在，更新則進入修復。insert 回應遺失先查相同 stable ID，不能另建隨機 ID。409 與 etag 412 需對帳／顯示衝突。

## 若選雙向的追加工作

增量 syncToken、push channel 的驗證／到期續訂、410 完整重同步、兩邊穩定識別、來源標記避免回圈、刪除與同時修改衝突介面。Google 原有行程匯入為獨立來源，不全部變成 Huddle 待辦。Google 私人行程只在帳號本人授權範圍計算忙碌；共享給其他人仍須独立同意，不因 API 取得資料就公開。雙向必須在單向之外另做驗收。

## 驗收與發布順序

1. 確認方向、免費／Pro 歸屬與同步範圍。
2. 實作加密授權、權限與 outbox、worker、可見狀態及斷線流程。
3. 本機 mock：重複／亂序工作、授權拒絕、token 過期、403/429、回應遺失、刪除、批次刪除、分頁、換帳號、跨日與重複例外、Google 修改衝突。
4. 在隔離測試日曆實測新增／更新／刪除與取消連結，確認不影響原日曆；禁止測試發信給真實朋友。
5. 正式部署、OAuth 發布／所需驗證、實際帳號授權與跨平台驗收後，才更新官網為已提供。

## 官方來源（2026-09-21 查核）

- Scope：https://developers.google.com/workspace/calendar/api/auth
- Server OAuth：https://developers.google.com/identity/protocols/oauth2/web-server
- Token/testing：https://developers.google.com/identity/protocols/oauth2
- 建立事件：https://developers.google.com/workspace/calendar/api/guides/create-events
- Supabase Edge auth：https://supabase.com/docs/guides/functions/auth

## 2026-09-21 本機實作與上線交接

已實作 `supabase/functions/google-calendar`、伺服器專用 connection／一次性 OAuth state／event mapping 表，以及實際本機 PostgreSQL 與 Google API mock 驗證。這不代表已在 Google 或正式 Supabase 啟用。

第一版可使用的邊界：單向、每人一個帳號與獨立 Huddle 日曆。連結前選本人工作區及 IANA 時區；同步過去 30 天至未來 365 天的已排程任務（含重複與排除日期）和本人主辦／已接受會議。先前同步過的較早事件保留並繼續對帳；取消排程、封存、刪除及 cascade 刪除會移除遠端對應事件。完成任務不會刪除歷史。未排程待辦、其他人的共享覆蓋、time blocks、Google 私人行程不在匯出範圍。DST 不存在或重複的無 offset 任務時間會停止並提示，不能猜測時刻。

同步由登入使用者呼叫，支持手動與開啟 App 時觸發；尚無關閉 App 後的獨立背景 worker，沒有一分鐘 SLA。每次最多處理 80 筆或 40 秒，回傳 `partial` 與剩餘筆數，後續呼叫沿持久化游標接續；只有完整跑完且沒有衝突才更新成功時間。沒有資料庫讀取失敗即刪光的路徑。mapping 不依賴 source FK，因此來源刪除不會丟失待刪除遠端識別。Google 事件 ID 可重試且穩定；回應遺失後按同一 ID 查回。

### 呼叫契約

所有動作為帶有效 Huddle JWT 的 `google-calendar` Edge Function POST：

- `status`：`configured`, `connected`, `status`, `last_synced_at`, `error`, `calendar_id`, `time_zone`, `workspace_ids`, `range`, `mode`。不返回任何 token。
- `start`：必填 `time_zone`、非空本人 `workspace_ids`；回傳 `url`。授權不改現有 Google 登入。
- `finish`：callback 取得 `code`, `state` 後，由登入 client 傳入。state 綁本人及原 JWT session、十分鐘、一用即失效、PKCE S256。回傳 pending，尚未輸出行程。
- `sync`：回傳 `status`, `processed`, `changed`, `conflicts`, `remaining`, `from`, `to`。Google 端修改／刪除為 `conflict`；只有使用者明確操作才傳 `resolve_conflicts:true` 以 Huddle 覆蓋／重建。
- `disconnect`：移除本機憑證及 mapping，預設保留遠端日曆。`revoked:false` 表示 Google 撤銷請求未確認成功，需引導至 Google 帳號移除應用存取權。

OAuth callback 是 `/settings/google-calendar/callback`，需和起始 Huddle session 相同。原生另開瀏覽器的跨 session 返回尚未完成，不能宣称 iOS／Android OAuth 已驗收；先支援同一登入瀏覽器。重新連結／改帳號先解除連結，保留的舊 Google 日曆不會被自動接管。

### 正式設定（服務端 secret，不放 NEXT_PUBLIC 或 Git）

- `GOOGLE_CALENDAR_CLIENT_ID`、`GOOGLE_CALENDAR_CLIENT_SECRET`：Google Cloud Web OAuth client。
- `GOOGLE_CALENDAR_REDIRECT_URI`：精確 HTTPS callback URL；同一值加入 Google 的授權 redirect URI。
- `GOOGLE_CALENDAR_TOKEN_KEY`：隨機 32 bytes 的 base64url AES-GCM 金鑰，妥善保管；輪替前需有重加密或重新授權計畫。
- 部署 `20260920182257_google_calendar_sync.sql` 及 `google-calendar` Function；依部署平台 JWT 模式確認 gateway 允許由 handler 的 `getUser` 驗證有效 session JWT。
- 啟用 Calendar API、scope `calendar.app.created`，Google OAuth 品牌／網域／政策公開並完成需要的審查。

建立 Google 次要日曆沒有可使用的插入冪等鍵。若建立請求後回應遺失，保留 `calendar_creation_uncertain`，停止自動重建，避免一次重試建立多個日曆；由操作人確認 Google 日曆後清理／解除連結。正式測試須覆蓋此狀況。

### 已跑驗證及未驗證

- `node scripts/test/google-calendar-core-verify.mjs`：4,823 assertions，包含與既有 recurrence 的 4,800 日期比對、加密／篡改／owner 綁定、跨日與 24:00、DST、英文無關的來源範圍及歷史保留。
- `node scripts/test/google-calendar-handler-verify.mjs`：17 mock scenarios，涵蓋未授權、不同 user/session/state、OAuth 一次性、secret 不回傳、穩定 ID 回應遺失、Google 修改衝突、來源刪除、讀取失敗不刪除、重新授權、互斥、撤銷失敗、日曆建立不確定及 85 筆分批接續。
- `python3 scripts/test/google-calendar-db-verify.py`：13 本機 SQL assertions，匿名／authenticated 無權讀憑證與呼叫 server RPC、本人資料／已接受會議、跨 generation claim 拒絕、互斥、來源刪除保留 mapping、解除連結清理。
- `npx --yes deno check --no-lock supabase/functions/google-calendar/index.ts`：型別檢查通過。
- 尚未做：正式 migration／Function 部署、Google 真實授權與隔離日曆新增修改刪除、網域審查、所有原生平台返回、遠端 Supabase advisors。這些列為上線驗收，不以 mock 取代。

### 前景自動同步

設定頁可勾選此裝置開啟 Huddle 時自動同步（預設關閉、每帳號獨立）。在主畫面可見時每分鐘檢查，資料變更後短暫延遲檢查，每次最多三批；遇衝突／重新授權／建立日曆未確認即停止自動處理。每次呼叫重驗當前帳號與勾選狀態，固定相符 JWT。App 關閉或背景不執行，後台 worker 尚未提供。12 項 mock effect 驗證通過。
