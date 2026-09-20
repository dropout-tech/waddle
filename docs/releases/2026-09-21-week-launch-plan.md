# Huddle 本週上線執行表

更新：2026-09-21。本週指 9/21–9/27。網站發布、原生測試版、商店公開銷售分別驗收；商店審查時間與帳號測試資格不保證本週完成。

## 定價結論

採免費＋Pro NT$149／月、NT$1,290／年。年繳一次收費，少 NT$498（約27.85%），月均NT$107.50只作輔助，不讓使用者誤以為每月扣107.50。購買頁實際顯示商店回傳的本地化價格，不以網站參考價送入支付SDK。

免費保留任務、拖曳日曆、專注、記事本/checklist與白板。Pro付費理由是多人協作：主辦每月50場／每場10人；免費每月3場／每場2人。既有活動的查看／回覆／取消不收費、到期不刪資料。共享夥伴2／20與既有用戶保留方案依伺服器開關及生效日實施，沒有開啟前不宣稱已限制。Google基本單向同步建議兩方案各一個帳號，當正式整合可用才列為已提供。

不要把尚未做好的雲端容量、版本還原、Google雙向同步、團隊管理拿來收費。若本週原生金流驗證未完成，先開免費版，保留明確「訂閱準備中」。真正可售Pro必須先完成方案權限、購買/恢復/退款/續訂/帳號轉移實測及客服接手。

推薦草案為雙方各3個月、每推薦人最多4位有效新朋友；每新帳號只兌換一次，不能自推或互推。程式先記錄待商店兌換的獎勵，活動預設關閉。不能把待兌換改寫成已免費延長，也不能只加Huddle到期時間而繼續由商店收費。受益對象先沿用建議方案，正式活動文案/資格/官方優惠商品驗證前不開放。

## 本週順序

| 日期 | 主要工作 | 通過條件 |
|---|---|---|
| 9/21（一） | 完成程式整合、定價與商店帳號缺口確認 | 本地測試通過、發布範圍清楚、必要後台可存取 |
| 9/22（二） | staging migration/Edge設定，Email、Google與訂閱沙盒 | 指定測試帳號完成收信/回邀請、Google新增修改刪除、購買恢復 |
| 9/23（三） | iOS簽章與真機、AndroidSDK/debug及internal track | 實機OAuth、無敏感資料殘留、崩潰/權限/取消恢復測試 |
| 9/24（四） | 定稿雙語商店素材、隱私/DataSafety/付款條款與審核帳號 | 資料揭露吻合實際SDK与後端，reviewer可完整操作 |
| 9/25（五） | 通過的版本提交審查／測試軌、網站正式驗收 | provider成功＋SHA＋實際功能，未通過項不冒充完成 |
| 9/26–27 | 回覆審查、觀察錯誤/寄信/同步/付費指標 | 回滾路徑可用、客服可處理權益與資料問題 |

若Google新個人開發者帳號仍須12位測試者連續14天，改交付封閉測試版；不承諾本週公開上架。Apple與Google公開發售依審查完成時間，不由排程表保證。

## 本次已實作，尚需正式啟用

- 會員/推薦設定頁與原生購買/恢復、商店訂閱管理入口；只用商店包資訊顯示可購買項目。
- 購買後authenticated reconciliation及known entitlement定期校準queue/worker。
- 推薦碼/RPC、唯一綁定、雙方pending獎勵、名額/驗證/重試檢查；正式商店優惠兌換仍未配置。
- 約交集已完成的站內與Email準備，另加伺服器每月/每場方案額度，預設關閉。
- Google專屬日曆OAuth、加密token、工作區選擇、分批手動同步/更新/刪除、外部修改衝突、取消連結。第一版不是双向或關App仍背景同步。
- Android實際專案、API36、Capacitor原生同步。沒有已簽章APK/AAB或真機通過的宣稱。
- 官網影片字幕、活潑企鵝、英文成片與真實英文產品圖；發布狀態另見部署紀錄。

## 必須補齊的外部條件

| 項目 | 目前狀態 | 下一個具體動作 |
|---|---|---|
| Huddle Supabase `jnikcndiexjojgvicohf` | 目前connector實際回覆無權限 | 切換/授權有此專案的帳號；只部署已驗證migration與functions |
| Email | 無已驗證寄件設定可用 | 提供寄件名稱/網域信箱，server設定Resend金鑰，指定測試收件者 |
| Google Cloud | 未證实Calendar API/OAuth正式憑證 | 啟用API、OAuth callback、token加密key，完成使用者同意與所需驗證 |
| Apple/Google商店＋RevenueCat | 未證实正式商品/收款/沙盒完成 | 帳號合約、稅務收款、商品與offering、restore policy、沙盒與官方offer |
| iOS簽章/權限/隱私 | 需實機與憑證確認 | Apple capability、privacy manifest實際資料核對、簽章/打包 |
| AndroidSDK | 本機缺SDKplatform | 安裝對應SDK並完成assembleDebug/bundleRelease、裝置/商店內測 |
| 刪帳 | 既有函式僅刪auth不足以證實完全清除 | 補storage與provider撤銷，先驗證再修改公開承諾 |
| 法律揭露 | 營運者/客服等資料待提供 | 定稿名稱/地址/客服與資料處理、退款條款 |

密鑰只存後台secret或本地忽略檔，不貼聊天、不提交git。

## 發布與回滾

每次紀錄 commit → push → merge → provider deployment → migration → live behavior，各項分別證明。App新整合在正式DB權限與credentials未就緒前不發布為可用；官網素材可獨立發布。不要把訂閱、推薦、額度開關一起自動開啟。

資料庫變更以additive migration為主；回滾前端時保留獎勵與付款審計資料，不刪真實會員/邀請。關閉新增購買不影響已付費權益；關閉推薦不吞已承諾的待兌換獎勵。Google斷線保留現有Google日曆，撤銷不成功須提示使用者手動移除權限。

## 關聯清單與證據

- `2026-09-21-launch-readiness.md`：政策來源、iOS/Android檢查、15%/30%收入情境。
- `../billing/launch-checklist.md`：正式啟用流程。
- `../billing/referral-backend-readiness.md`：推薦/reconcile API与剩餘條件。
- `../integrations/google-calendar-sync.md`：同步設計與官方來源。
- `../native-android-readiness.md`：實際原生建置結果。
