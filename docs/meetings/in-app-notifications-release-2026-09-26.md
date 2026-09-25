# 會議站內通知部署驗收 — 2026-09-26

使用者決策：只做 Huddle 站內通知，不寄 Email。

## 已實作與發布

- 收到邀請時通知受邀者；接受、暫定、婉拒有實際變更時通知主辦人；取消時通知受邀者。
- 通知鈴鐺合併未讀數，可標為已讀或開啟對應邀請。已讀存於資料庫，重新整理或換裝置仍有效。
- 登入與請求結果按帳號隔離。可見頁面每 30 秒更新，切回視窗或開啟鈴鐺時更新。
- 最新 50 則未讀分批顯示，總未讀數涵蓋全部。讀取失敗保留通知並提示重試。
- 移除建立／取消時的寄信呼叫、Email 狀態及重寄按鈕；資料庫停止新增寄信佇列。
- 不補造既有邀請的歷史通知；既有邀請仍可從會議邀請列表查看。歷史 Email audit table 保留。

程式提交 `5353185bef29b2c02c265f0f7e6c33868bb3927a`；[PR #72](https://github.com/dropout-tech/waddle/pull/72) 已合併。正式 merge SHA `83f7cf2fe808f55b0aef60910ee26ff4d97d741f`，Zeabur deployment `6664989968` 為 success，環境 https://waddle.zeabur.app。

Migration `20260925155252_meeting_in_app_notifications.sql` 已以交易套用並記錄 migration history。三類通知由資料庫 trigger 與邀請變更同交易產生；新表 RLS 啟用且禁止 client 直讀／直寫；RPC 僅登入使用者可執行，資料依 recipient_id 隔離。

## 驗收證據

- 72 項中英文桌面／手機 mock UI 檢查通過：邀請、回覆、取消、三種通知、已讀保存、失敗不誤清除、正確開啟邀請、建立與取消皆無寄信網路呼叫。
- 隔離本機 PostgreSQL 通過：匿名／第三者拒絕、通知不可偽造、已讀冪等、建立／回覆／取消重試不重複通知、沒有新增 Email queue。
- 本機退休 Email handler：POST／GET 回 410、OPTIONS 支援 CORS，不讀金鑰、資料庫或呼叫網路。
- TypeScript、範圍 ESLint、production build 通過；PR Cursor Security Reviewer 通過。Vercel preview 失敗，正式 provider 是 Zeabur 且部署成功。
- 正式測試帳號：通知 RPC 200、直接讀通知表 403、匿名 RPC 401、操作不存在通知 403。未向真實使用者發送測試邀請或 Email。

## 未完成項目

- 程式庫已將舊 `send-meeting-invitations` 改成 410 no-op，但正式 Edge Function 更新仍因 Chrome 控制連線失敗而未完成；對不存在邀請的正式探測仍回舊版 403。新版 UI 不再呼叫它，資料庫也不再為新邀請排 Email。
- 正式瀏覽器視覺驗收與重新執行 Security Advisor 尚待控制連線恢復。不得將本機 mock 當成真人雙帳號通知驗收。

後續接續：在 Supabase 函式 Code 頁用 repository 中 no-op handler 更新部署，驗證登入請求回 410 email_disabled，再用正式瀏覽器確認新版鈴鐺及邀請頁。瀏覽器已停在該函式頁；勿動其他工作分頁或共享權限。
