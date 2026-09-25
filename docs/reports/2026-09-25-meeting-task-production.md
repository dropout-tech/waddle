# 會議逐字稿轉任務：正式部署驗證

日期：2026-09-25（台北時間）

## 已部署

- PR：https://github.com/dropout-tech/waddle/pull/71（已合併）。
- 正式 merge SHA：1455f58bbf7efb5729e62a213e73f0b5ae538dc3。
- Zeabur deployment：6ab63b00e92e928954ad0fe6；GitHub deployment：6657523099，production success。
- 新容器已於 17:16:56 啟動，Next.js Ready；之後兩個正式路由皆 HTTP 200，已登入瀏覽器確認功能畫面。
- 正式網址：https://waddle.zeabur.app/meetings；https://waddle.zeabur.app/assignments。
- Supabase 專案 jnikcndiexjojgvicohf：20260925081959_meeting_imports、20260925083539_meeting_assignments 已在單一交易套用並登錄 migration history。
- Edge Function meeting-import 已部署；CLI 憑證失效，因此使用已登入 Dashboard，從部署分支原文合併 contract.ts、prompt.ts、index.ts 到單一 entrypoint，未改變邏輯。Legacy JWT verification 保持開啟，內部仍 getUser 驗證。

## 驗證證據

- 最新主線上的獨立部署分支，只帶入本功能兩個提交，保留其他已發布功能及原工作區 WIP。
- 本機 webpack production build、7 項 Deno tests、本機 PostgreSQL 整合測試、桌面及 390px mock API E2E 全數通過。本機 Turbopack 曾因 Google 字體下載失敗；Zeabur 正式建置通過。
- PR Cursor Security Reviewer 通過。Vercel 非正式環境 integration 失敗；正式供應商 Zeabur 已獨立驗證。
- 實際測試帳號呼叫 list/directory/inbox 均 HTTP 200；list 回傳 limit=20、enabled=false。
- 未登入 Edge 請求 HTTP 401；authenticated 直接呼叫 respond_meeting_assignment 被拒絕（42501）。
- 兩張新表 RLS=true；四個新 RPC 均 SECURITY INVOKER 且 authenticated 無 EXECUTE。
- Supabase Security Advisor 重新執行後 0 errors，10 項既有 warnings，沒有新 meeting-import RPC 相關警告。既有建議可於 https://supabase.com/dashboard/project/jnikcndiexjojgvicohf/advisors/security 查看。

## 尚未啟用與未驗證

正式 OPENAI_API_KEY 尚未設定，頁面正確顯示「AI 整理尚未啟用」並停用生成。請在 Supabase → Edge Functions → Secrets 設定後，再進行真實模型品質測試。沒有將私人逐字稿送給實際 AI API、沒有建立或送出真實指派。

接受／拒絕、自動建立、每月額度競爭及重送防重複已在本機 SQL 與 mock UI 驗證；本次正式環境只做讀取及拒絕非法請求測試，未執行真實使用者間的任務接受／拒絕。
