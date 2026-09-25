# Huddle 完整接手清單（2026-09-26）

## 接手起點與已保存內容

正式基線：`ff4176f35f050345a4dad7784c0992d1867ee217`，PR73 已合併；Zeabur deployment `6665353923` success。正式站 https://waddle.zeabur.app；小工具預覽 /widgets/ 已以 390/1280px 檢查。這是上一輪實際驗收證據，本輪以程式／Git 清點為主，未重新操作正式資料庫或商店後台。

**繼續開發請從 origin/main 開新分支。不要把歷史 WIP 分支整支合併回 main。**

| 保存位置 | 內容 | 接手方式 |
|---|---|---|
| `codex/handoff-wip-snapshot-20260926`，`8a98151` | 原工作目錄全部未提交產品檔、desktop、marketing、白板、72支歷史驗收／探測腳本、去除帳密的舊 HANDOFF 備份 | 僅作恢復檔案與考古，很多內容比 main 舊。來源基底 fc9c149。不得整支發布 |
| `codex/meeting-task-release`，`08c98d7` | 另一個 worktree 遺漏的 `scripts/e2e/meeting-live-read.mjs` | 已 commit/push；使用測試帳號登入，列清單僅印數量，另測未授權拒絕。不要以一般使用者帳號任意執行 |
| `codex/huddle-auth-site-redesign`，`037f1e7`，draft PR55 | Google Calendar、舊推薦、reconciliation、quota、刪帳強化 | 逐功能移植，先比較目前營運後台；不可整支 merge |
| `codex/mobile-widgets`，`d0b6ed0` | 原始小工具設計與原生專案 | 最終修正已在 main，以 main 為準 |
| 本目錄 `branches.json`、`worktrees.json` | 所有本機分支 SHA、是否 main 祖先／等價 patch、所有 worktree 的清點 | patch 不同不等於未發布；目錄消失不等於 commit 消失 |
| snapshot 分支 `docs/handoff/2026-09-26/generated-next-env.json` | detached worktree 唯一 generated route import 差異 | 已保存差異後還原 generated 檔，非未完成產品功能 |

測試帳密已從本次保存的歷史腳本及交接副本移除，改用 `E2E_SECONDARY_EMAIL`／`E2E_SECONDARY_PASSWORD`。歷史 tmp-* 腳本有正式網址及新增／刪除資料行為，**不得整批執行**；先換隔離測試環境逐支閱讀。語法檢查全部通過，不代表整批功能測試通過。原始 ignored HANDOFF.md 與 .env*.local 留在原機，不交到 Git，接手者以正式帳號授權取得所需設定。

## 尚未完成、未啟用與待驗收（逐項）

狀態定義：**待部署**＝程式已完成但 backend 未更新；**待整合**＝只在草稿；**待外部設定**＝需要帳號／金鑰／商店；**待實機驗收**＝本機測試不能證明真實裝置；**未實作**＝已有明確文件但尚無完整行為。

| ID | 功能／狀態 | 已有內容與位置 | 接手下一步／完成標準 |
|---|---|---|---|
| H01 | 簽到排行榜：待部署 | main `supabase/migrations/20260925120000_check_in_leaderboard.sql`、`components/growth/check-in-leaderboard.tsx`；前50／同分／榜外本人／RLS 本機驗收完成 | 套正式 migration、登記 history，測 authenticated RPC、匿名拒絕與正式UI。RPC缺少時前端目前隱藏。註冊日期已發布 |
| H02 | 舊 Email 邀請端點：待部署停用 | main `supabase/functions/send-meeting-invitations/index.ts` 為 HTTP410 no-op；正式端點仍是舊版403 invitation_unavailable | 部署 no-op 後測410 email_disabled、OPTIONS200；不要寄真實信。站內 notification DB／UI 已上線且新UI不呼叫寄信 |
| H03 | Google Calendar：待整合／外部設定 | PR55 `docs/integrations/google-calendar-sync.md`、`supabase/functions/google-calendar/`、migration `20260920182257_google_calendar_sync.sql`、`app/settings/google-calendar/` | 比較main再移植；OAuth client/scopes/callback/server secrets、migration/function；真實授權、取消、撤銷、增改刪、重複同步、時區、重試驗收。原生跨session返回亦未完成 |
| H04 | 原生訂閱購買／恢复：待設定／驗收 | main `lib/billing/`、`supabase/functions/revenuecat-webhook/`、`docs/billing/launch-checklist.md`；billing資料結構已隨營運後台套用 | 商店商品、RevenueCat offering／keys／權益ID，staging sandbox策略及真機購買、pending、恢復、退款、轉移。未完成前購買旗標維持關閉；不要重跑已套migration |
| H05 | 購買後權益校準：待整合／部署 | PR55 `supabase/functions/billing-reconcile/` | 移植到現有營運贈送ledger架構；部署、驗JWT帳號歸屬、重複／亂序／退款後結果 |
| H06 | 定時權益校準：待整合／排程 | PR55 `billing-reconcile-scheduled/`、`20260920182638_billing_reconciliation_queue.sql`；lease／重試／限量處理已寫 | server secret、migration/function、cron、監控／告警；測租約逾時與重试。尚無啟用排程證據 |
| H07 | 舊「推薦三個月」商店優惠：未完成／保持關閉 | PR55 `20260920182230_referral_foundation.sql`、`docs/billing/referral-backend-readiness.md`；只reserved/pending | 先決定與現在營運推薦活動的關係；補商店offer、兌換/交易關聯、稽核撤銷、防重註冊／限流、條款／日期；不得把pending寫成已得Pro或承諾延後扣款 |
| H08 | Free/Pro 額度：待決策／整合 | PR55 `20260920182613_meeting_plan_limits.sql`、`20260920183303_sharing_plan_limits.sql` | 與现行免費核心及營運權益比較；定義方案、既有帳號保留、後端enforcement、超額新增與到期可讀/匯出/刪除；不能只開前端限制 |
| H09 | 帳號刪除強化：待整合／完整驗收 | PR55 `docs/account-deletion-readiness.md`、`supabase/functions/delete-account/`、`20260920184344_account_deletion_write_guard.sql`、`app/account/` | 移植Storage清理／寫入防護，Apple token撤銷／重新驗證，權限與失敗恢復；用可拋棄staging帳號驗DB、Storage、第三方token；刪帳不等於取消商店訂閱 |
| H10 | iOS完整安裝包：待SDK／簽署／實機 | main `ios/`、`docs/native/mobile-widgets.md`；bridge/extension獨立typecheck證據 | 補Xcode平台元件、Developer capability、App Group與extension簽署；完整build、安裝、Archive/TestFlight；不可用Swift單檔typecheck代替 |
| H11 | Android完整安裝包：待SDK授權／建置 | main `android/`、Capacitor scaffold | 帳號持有人處理SDK條款、安裝平台/BuildTools，assembleDebug與release AAB、upload key／Play簽署，真機安裝。未有已驗收APK/AAB |
| H12 | 原生小工具資料路徑：待實機驗收 | main WidgetSync、native bridge、account epoch、server revision、任務完成佇列 | 真機驗新增/改任務後完成一次、衝突拒絕、離線重試、換帳號、冷啟動、鎖屏隱私、通知實際顯示；Web demo不代表原生通過 |
| H13 | Android持續計時：未實作 | 目前使用最後快照 | 原生持續倒數或ongoing notification；Android鎖屏未宣稱支援 |
| H14 | 小工具原生行事曆互動：未實作 | 月曆格＋標記已有 | 跨日色帶、翻月、逐日清單切換；目前只App開啟時快照，背景雲端同步未做 |
| H15 | 小工具個別內容選取：未完整 | 安全摘要、部分篩選／記事ID釘選已有 | 各instance白板／記事選擇UI、checklist直接勾選、Android分類篩選；白板縮圖不是完整畫布像素一致 |
| H16 | 小工具語言／適配：未完整驗收 | Web中文版預覽已發布 | 雙語、Dynamic Type、各OEM尺寸、暗色、原生設計對照；部分視覺箭頭細節仍有差異 |
| H17 | iOS碼表Live Activity：刻意未提供 | main修正只讓番茄鐘顯示Live Activity | 如要碼表上鎖屏，補向上計時、暫停／恢復／帳號epoch實機測試；避免把elapsed顯示倒數 |
| H18 | Mac／Windows通知與登入：待真實裝置驗收 | 桌面beta已發布；Windows安裝runner、16項mock測試通過；`docs/native/desktop-notifications.md` | 真實Google/Apple consent、OS通知顯示、勿擾／拒絕、換帳號、睡眠恢復；mock不能證明OS投遞 |
| H19 | 桌面正式發行品質：未完成 | Mac/Windows beta可下載，`docs/releases/2026-09-25-windows-desktop.md` | 正式簽章／mac公證、互動安裝全流程；Windows ARM64未提供，更新目前需重裝。不要把beta稱商店或已簽署正式版 |
| H20 | 商店提交與隱私資料：待帳號／資料／驗收 | PR55 `docs/releases/2026-09-21-launch-readiness.md`、main法律頁 | 核對開發者角色／合約、商店app record、隱私manifest、真實資料流表單、截圖／審核帳號、測試軌與送審。外部規則請接手時查官方最新版，不沿用舊文件日期門檻 |
| H21 | 法律／客服營運資料：待確認 | `docs/legal/2026-09-20-release-readiness.md` | 法定營運者、公開客服／必要地址、保存刪除期限、Google日曆／推薦資料使用說明；不能把頁面存在當資料已核實 |
| H22 | 營運活動：功能已發布，開關待營運決策 | main `/admin`、`/membership`、`docs/operations/README.md`；正式migration已套，當時促銷開關全關 | 有權限管理員核對目前開關／活動條件再啟用；**這不是PR55舊三個月商店優惠**。贈送天數不改商店扣款日 |
| H23 | 營運完整金流報表／事件分析：未提供 | 現有權益快照／來源／活躍等統計已實作 | 真實付款、退款、金額營收、取消原因、完整事件追蹤須待金流事件整合；不得把快照數當訂單、贈送當營收 |
| H24 | 歷史待辦重新判定：待核對 | `historical-pending-index.md`，舊HANDOFF提到分類前綴migration等 | 程式中已有 `0013_show_category_prefix.sql`；本輪未查其正式history，不宣稱仍缺或已補。所有舊待辦逐條對照現行main／正式history，避免照舊文重做 |

## 文件矛盾與優先序

1. `docs/IOS_SETUP.md` 舊文字寫 com.huddle.app／未建立專案；現行識別碼以 `lib/native-config.ts`、Capacitor、Xcode專案為準（com.lazylazy.huddle）。
2. billing舊清單寫「reconciliation未實作」：實作其實在PR55，尚未整合/部署。billing schema已隨營運功能正式套用；不要把付款未啟用誤讀成DB全部未套。
3. mobile-widgets文件「沒有推送／發布」是當輪歷史；原碼及Web已由PR73上線，原生安裝包仍未完成。
4. desktop-notifications舊文稱Windows安裝未驗證；2026-09-25新文件已有runner安裝證據，真實OAuth／OS通知仍未驗證。
5. operations文件前後混有發布前狀態；最後追加的正式DB驗證優先，但活動目前實際開關須再讀後台。
6. 舊HANDOFF大量「未commit」已被後續分支發布取代；以branches.json、現行main與發布證據為準，不能照搬成開發待辦。

## 必要帳號／設定交接

- GitHub dropout-tech/waddle 寫入權限、Zeabur 正式專案部署權限。
- Supabase project `jnikcndiexjojgvicohf`（penguinflow）。目前connector不含此專案、舊management token失效；原電腦Chrome有登入，但Mac鎖定阻擋操作。請用接手者正式授權登入，不複製session。
- Apple Developer／App Store Connect、Google Play Console、Google Cloud OAuth、RevenueCat 分別確認權限；server secrets只放平台secret store。
- repo不含 .env*.local、簽署private key、真實測試帳密。測試帳號另以安全管道提供，勿寫入交接文件。
- 不需要申請寄信服務：使用者已決定會議通知只做站內。H02是停用相容舊端點，不是補寄信設定。

## 建議接手順序與驗收

1. 先clone/fetch main，讀本表、branch/worktree清單；不要開舊snapshot直接發布。
2. 解Supabase權限，完成H01/H02並記錄migration、function版本、權限與正式UI證據。
3. 選Google日曆／金流／原生其中一條逐功能整合PR55；不要整支merge重覆或過期的會員UI及原生scaffold。
4. Web驗證：`pnpm install --frozen-lockfile`、`pnpm exec tsc --noEmit`、`pnpm build`、`node --test scripts/tests/widgets.test.mjs`。DB tests僅用全新隔離PostgreSQL。`scripts/e2e/daily-check-in-verify.mjs` 用測試登入與mock DB；E2E_BASE_URL必須是完整login網址。
5. 原生照 `docs/native/mobile-widgets.md` 分平台建置及實機驗收；記裝置／OS／build hash。商店付款使用隔離sandbox政策，不放寬正式端點sandbox限制。
6. 每次完成留下 commit → push → main SHA → Zeabur部署 → migration/function → 真實行為，各項分別證明。

本次只保存與整理，未開啟商業活動、未寄信、未補寫正式資料；既有半成品都有明確位置和下一步，並未把它們宣稱成已完工。
