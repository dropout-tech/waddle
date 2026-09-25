# Huddle 未發布功能整合盤點（2026-09-26）

## 本次整合

基底 origin/main：83f7cf2。使用者已授權整理、commit、push、部署。

| 功能 | 本次處理 | 實際界線 |
|---|---|---|
| 每日簽到匿名排行榜 | 整合 e4cfa46，SQL 與 UI 一起提交 | migration 尚待正式套用；RPC 不存在時隱藏排行榜，原簽到照常使用 |
| 帳號註冊日期 | 整合並發布 | 使用登入者自己的 created_at，台北日期 |
| 11 種小工具 | 整合 c71e61f、d0b6ed0，發布 /widgets/ | Web 互動預覽；登入後可使用本人資料 |
| iOS / Android 原生小工具 | 原始碼一併推送 | 缺 SDK、簽署、實機驗收；無可安裝商店版本 |
| 站內會議通知 | PR72 已在 main 並部署 | 正式 DB 已套用；舊寄信 Edge 端點停用仍待完成，新的 UI 不呼叫寄信 |
| 會議交集時間、會議任務、每日簽到、白板、記事本、桌面版 | 已由既有 PR 上線 | 本機舊工作目錄大多是同內容或更舊版本，不重複覆蓋 main |
| Google 日曆單向同步 | 原碼已 push，保留 draft PR55 | 正式 OAuth、migration/function、真實授權與增改刪驗收未完成 |
| 付款、推薦獎勵、額度、reconciliation | 原碼已 push，保留 draft PR55 | 商店商品、RevenueCat、優惠兌換、後端排程與驗收未完成，維持關閉 |
| 帳號刪除強化 | 舊草稿 PR55 保留供後續逐項整合 | 與目前 main 有差異，不能整支覆蓋；Apple 重新驗證／完整刪除驗收未完成 |

## 工作目錄保留

主工作目錄 codex/scratchpad-free-canvas 的未提交檔案不直接覆蓋 main。floating-scratchpad、note-editor、note-icon-picker、slash-command、focus-scratchpad、whiteboard-detail、focus-board、兩份 i18n、types、whiteboard-document、兩份驗收腳本與 main 相同；page/layout/platform/desktop/marketing/package 等是較舊副本。

HANDOFF 備份、PIMI PDF、tmp 驗收／清理腳本不屬於產品發布；保留本機，不混入正式程式。使用獨立 worktree 保留所有原工作內容。

## 覆核修正

- 小工具資料變更改用專屬、750ms debounce 事件，避免偽造 window focus 造成全站 API 刷新。
- 小工具完成任務採用同一份伺服器內容與 revision，並保留更新衝突拒絕與帳號 epoch 隔離。
- 每秒專注計時不重算 49 天掃描；基礎快照依資料與日期 memo。
- iOS Live Activity 暫限番茄鐘，碼表不再錯誤顯示倒數。
- 原生版本未提供安裝包的限制直接寫在預覽頁。

## 驗收與待補

已通過 TypeScript、7 個 widget model 測試、隔離 PostgreSQL 每日簽到與排行榜測試（同分、前50、榜外本人、零分、匿名、RLS、授權）。本機 Next.js build 通過。

正式環境 backend blocker：Mac 鎖定，Supabase 管理頁不能操作；現有 management token 無效、connector 不含此專案。已請使用者解鎖。未執行正式資料修補、未寄測試邀請。

排行榜 migration：supabase/migrations/20260925120000_check_in_leaderboard.sql。完成後用登入者 RPC、匿名拒絕與正式 UI 驗收。舊 send-meeting-invitations 應部署 repo 的 HTTP 410 email_disabled no-op，再以無效 invitation id 驗證。

部署 SHA、provider 結果與 live route 證據於本文件後續追加。
