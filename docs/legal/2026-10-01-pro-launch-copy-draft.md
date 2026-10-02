# Huddle Pro 開賣版法務文案草稿（2026-10-01 初稿／2026-10-02 修訂）

> **本文件為法遵風險盤點與文案草稿，非法律意見。** 紅／黃級項目建議諮詢執業律師確認；稅籍與發票請會計師確認。
> 草稿由 legal-advisor 產出，尚未經老闆審閱。工程師請勿在老闆核可前放進程式；核可後**開賣當天才切換**（開關現況見第 2 節：目前沒有能管網頁文案的開關，要另建）。
> 修訂查核日：2026-10-02。所有「現有」引文與 `檔案:行號` 已對 main `9513e45`（本 worktree）逐檔重讀核對。初稿備份：同目錄 `.bak-20261002b`。
> 第一波開賣＝**iOS App 內購（Apple）**。網站信用卡（SHOPLINE）購買不早於 App 內購開賣，那部分文案已以 `<WebOnly>` 上線、標「網站購買開放後適用」，**本稿不動它**，另見 `2026-10-01-shopline-website-disclosures-draft.md`。

---

## 第 00 節：老闆拍板清單（只列真正要你決定的事，共 8 條）

**1. 你的本名和聯絡地址，要不要放上網站？**【不決定＝不能開賣】
- 要決定：法律要求網路賣東西要寫出「經營者名稱」和「事務所或營業所地址」（消保法§18 I(1)）。目前網站只寫「個人經營者」＋電話，名稱和地址都沒有。
- 選項：(a) 本名＋住家地址；(b) 本名＋可收信的工作室或共享辦公室地址（**建議**）；(c) 先辦行號（見第 7 條），放行號名稱與登記地址。郵政信箱算不算「事務所」，我查不到見解，要用的話請先問律師。
- 補充：你用個人身分註冊 Apple 開發者，App Store 頁面本來就會顯示你的本名（Apple 註冊頁明載），所以網站不放本名，隱私上幾乎省不到。
- 不決定的後果：iOS 開賣後立刻違反消保法§18 I(1)（主管機關可要求改正；罰則條文本次未查）。

**2. 要不要開一個客服 Email？**
- 要決定：法律只要求「電話或電子郵件」擇一，你的電話已公開，所以 **iOS 開賣法律上可以只靠電話**。
- 選項：(a) 開一個專用客服信箱（**建議**：退款、個資申請都能留下書面紀錄；網站刷卡開賣前 SHOPLINE 條款本來就要求電話＋Email）；(b) 先只用電話。
- 不決定的後果：iOS 首波可以開賣，但電話必須真的有人接；網站刷卡開賣前一定要補。

**3. 用 Apple 買的人 7 天內想退款、但 Apple 不退時，我們要不要自己退？**
- 要決定：網站購買你已經承諾「首次扣款 7 天內全額退」。Apple 那邊是 Apple 審核退款，但 Apple 條款寫它只是「代理商」，契約對象是你（我的判斷，信心約 7 成）。
- 選項：(a) 要，規則比照網站：試用結束後第一次扣款起 7 天內、年繳續訂扣款後 7 天內，Apple 不退就由我們匯款退（**建議**，文案見 R4 版本 A）；(b) 不寫承諾，用 R4 版本 B 的模糊寫法。
- 代價：每件最多自掏 NT$150 或 NT$990，Apple 已抽的分潤拿不回。
- 不決定的後果：預設用版本 B；但若真有人依法主張，消保法§19-2 II「收到通知隔天起 15 天內返還」的義務仍在你身上（我的判斷）。

**4. Pro 的「任務、筆記不設數量上限」要這樣寫死嗎？**
- 要決定：程式裡 Pro 的任務、筆記上限是「無」。寫進條款就是承諾，日後想加上限，依你自己條款要提前 30 天通知。
- 選項：(a) 照寫「不設數量上限」（**建議**；條款已有禁止濫用、干擾服務的規定可以擋惡意使用）；(b) 改寫具體大數字（例如 10,000 個）。
- 不決定的後果：預設用 (a)。

**5. 新企鵝造型／音樂包，要不要寫進 Pro 介紹？**
- 要決定：程式裡目前沒有這兩樣東西（設計文件寫明本次不做）。寫進去就變成你欠客人的（消保法§22）。
- 選項：(a) 先不寫，推出那天再加（**建議**）；(b) 寫「日後推出」。
- 不決定的後果：預設 (a)，本稿已把它刪掉。Apple Watch 依你的決定也已刪除。

**6. 「免費版用量上限」哪天打開？怎麼通知老用戶？**
- 要決定：上限是另一個開關（資料庫的 `limits_enforced`），打開時老用戶會自動多 60 天 Pro。但你的服務條款已承諾「影響既有權益要提前 30 天通知」（`app/terms/page.tsx:26`）。
- 選項：(a) **開賣同一天打開**，當天在 App 內公告「免費版上限從你的 Pro 到期後才會影響你」（**建議**：老用戶至少有 60 天緩衝，滿足 30 天承諾）；(b) 晚於開賣再打開——那麼本稿標「綁用量上限開關」的句子也要晚一起上。
- 不決定的後果：沒通知就打開＝違反自家條款的承諾（契約責任，不是法條）。

**7. 要不要現在就辦稅籍登記／行號？**
- 要決定：財政部說明個人網路銷售當月達起徵點（勞務 5 萬元）要辦稅籍；超過時可能也要辦獨資行號（我的推論，信心約 7 成）。辦了以後網站與 App 要放統一編號。
- 選項：(a) 先問會計師，銷售額接近 5 萬時再辦（**建議**）；(b) 現在就辦（可同時解決第 1 條的地址問題）。
- 不決定的後果：達門檻沒辦有補稅與罰鍰風險（罰則本次未查）。統編欄位在辦好前整句不放。

**8. 開賣日、客服回覆時效填什麼？**
- 開賣日：頁面「更新日期」要用，**不填不能開賣**。
- 回覆時效（例如「3 個工作天內」）：選填，寫了就是承諾，**不填就整句刪除**。

---

## 0. 一頁看懂（相對 10-01 初稿改了什麼）

- 初稿 24 個段落（B1–2、T1–6、R1–7、S1–4、P1–5）中，**10 段已全部或部分被 PR #126 等上線改動涵蓋**（T3、T4 前句、T5、R6、S1、S2、S4、P1、P3、P4：營運者區塊、電話客服、Apple 取消提醒、刪帳號提醒、個資權利聯絡方式），各節末「初稿段落處置」表標明刪除或改為差異。
- 剩下要在開賣日切換的有 **5 頁＋官網行銷頁**，每段都給了繁中與英文完整文字（第 3–8 節）。
- Pro 額度數字已從程式查出並填入（紅 2 解除）；Apple Watch、企鵝造型／音樂包已刪；歐盟相關黃牌改列「延後（不上歐盟）」。
- 仍擋開賣的紅牌剩 2 張：營運者名稱與地址（第 00 節第 1 條）、官網「尚未開放購買」字樣（文案已備好，但**沒有開關可以綁**，工程要先建，見第 2 節）。

---

## 1. 已拍板事實、剩下的佔位符、工程確認項

### 1-A 已拍板（直接寫進文案，不再列為待決）

| 項目 | 定案內容 | 程式依據 |
|---|---|---|
| 價格 | 月繳 NT$150、年繳 NT$990 | `lib/billing/plans.ts:3`（已是 150／990） |
| 試用 | 14 天（畫面寫「2 週」），需綁付款方式，每人限一次（iOS 由 Apple 以 Apple 帳號判定） | — |
| 免費版上限 | 進行中任務 150、筆記 100、圖片 200MB、AI 會議整理每月 5 次 | `supabase/migrations/20261001200000_pro_limits.sql:56` |
| Pro 上限 | 任務、筆記不設上限（null）、圖片 20GB、AI 會議整理每月 20 次 | 同上 `:54` |
| 開關關閉時 | 所有人不受上限、AI 每月 20 次、誰都能連 Google 日曆與建組織 | 同上 `:49-51`、`:5-8` |
| Pro 內容 | AI 會議整理額度、建立組織、Google 日曆串接、更大圖片容量、任務筆記不設上限；**不含 Apple Watch**；造型／音樂包未實作（建議不寫，第 00 節第 5 條） | 設計文件 `docs/billing/2026-10-01-pro-limits-design.md:13` |
| Google 日曆老用戶 | 開關打開前已連結者永久免費保留 | `pro_limits.sql:396-399` |
| 贈送 Pro | 開關打開時舊用戶補足 60 天；現有用戶已送到 2026-12-31；後台可發優惠碼；贈送時間接在付費期之後 | `pro_limits.sql:377`、`components/operations/membership.tsx:142` |
| 營運名義 | 個人；客服電話 0988-493-026；管轄 臺灣新北地方法院 | `lib/legal/operator.ts:8-11`（已上線） |
| 上架地區 | 全世界扣掉歐盟 27 國 | 初稿 1-B-3 → **已決** |
| 開賣順序 | 第一波 iOS App 內購；網站刷卡不早於 App 內購 | — |

### 1-B 剩下的佔位符（只留真正未決的）

| 佔位符 | 用在哪 | 不填怎麼辦 |
|---|---|---|
| 【本名】 | T5、橫幅頁尾、隱私 P1 | **不填不能開賣**（消保法§18 I(1)） |
| 【聯絡地址】 | T5 | **不填不能開賣**（同上） |
| 【客服 Email】 | T5、R4、S、P4 | 不填就整句刪除（電話已滿足法定最低要求） |
| 【統一編號】 | T5 | 未辦稅籍就整句刪除 |
| 【開賣日】 | B2 | **不填不能開賣** |
| 【回覆時效】 | T5 | 不填就整句刪除 |

### 1-C 文案寫了就要做得到——工程確認項（2026-10-02 重查）

| # | 文案寫了什麼 | 現況（證據） | 處理 |
|---|---|---|---|
| 1 | 到期後仍可「匯出」 | 仍只有行事曆圖檔匯出（`components/calendar/calendar-export-modal.tsx`）。**App 內 `components/operations/membership.tsx:151` 已經寫「照常查看、編輯與匯出」** | 本稿已拿掉「匯出」；App 內那句也要改成「查看、編輯與刪除」，或補做匯出 |
| 2 | Pro 權益跨網頁／桌面生效 | ✅ 伺服器端以帳號判斷（`pro_limits.sql:42、53`，`has_pro(user)`） | 照寫 |
| 3 | 何時傳資料給 RevenueCat | ✅ 不是登入時。SDK 只在第一次「讀方案／購買／恢復購買」才初始化（`lib/billing/native-adapter.ts:26-28`） | P4 已改成「開啟訂閱畫面、購買或恢復購買時」 |
| 4 | 刪帳號時 RevenueCat 紀錄 | 仍未見刪除呼叫（RevenueCat API 只出現在 `supabase/functions/revenuecat-webhook/index.ts`）；本站權益紀錄 `on delete cascade`（`supabase/migrations/20260920082633_billing_entitlements.sql:3`） | 照寫「不在立即刪除範圍」 |
| 5 | iOS 取消路徑繁中字樣 | 未實機核對 | 請對實機 |
| 6 | 購買畫面與「恢復購買」 | driver 有 restore（`lib/billing/revenuecat-driver.ts:40-42`），但**購買畫面尚未實作**：`loadNativeBillingSession` 在 app／components 沒有任何呼叫端 | 開賣前必做；畫面必備字樣見第 11 節第 2 點 |
| 7 | 傳給 RevenueCat 的是隨機 UUID、不含 Email | ✅ `native-adapter.ts:10、23` 只收 UUID；driver 只用 configure／logIn／logOut／getOfferings／purchasePackage／restorePurchases（`revenuecat-driver.ts:4`），沒有 setEmail／setAttributes | 照寫 |
| 8 | 購買後 Pro 會生效 | 依專案記憶（2026-10-02 夜間審查）`revenuecat-webhook` 尚未部署——本稿未獨立驗證 | 開賣前必部署，否則收了錢不開通 |
| 9 | 網站「試用每人一次，不論 iOS 或網站」（已上線於 `app/terms/page.tsx:17`） | 網站端要能知道該帳號是否在 iOS 用過試用 | 網站刷卡開賣前確認 |

---

## 2. 開賣開關：現況與建議（驗收第 3 點）

**結論：目前沒有任何開關能管網頁上的法務／行銷文案。** 查到三個相關的東西：

| 名稱 | 位置 | 實際作用範圍 |
|---|---|---|
| `NEXT_PUBLIC_BILLING_ENABLED` | 只在 `lib/billing/load-native-session.ts:8` 被讀 | 只決定 iOS／Android 是否載入 RevenueCat SDK（`:12`）；而這支函式目前**沒有任何呼叫端**。屬「建置時寫死」的環境變數，改值要重新 build／部署 |
| `huddle_ops.settings.limits_enforced` | `supabase/migrations/20261001200000_pro_limits.sql:30-38` | 資料庫即時開關：管免費上限、AI 5／20 次、Google 日曆與建組織是否需要 Pro；用 `enable_pro_limits()` 打開（同時送 60 天）。**不管任何文案** |
| `BILLING_PLAN.livePurchasesEnabled: false` | `lib/billing/plans.ts:4` | 常數，沒有任何程式讀它 |

建議（給工程師）：
1. 新增一個文案用旗標（例如 `lib/billing/launch.ts` 匯出 `PRO_ON_SALE = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'`），沿用同一個環境變數，讓「SDK 開」與「文案切」不會一邊開一邊沒開。第 3–8 節標【綁開賣開關】的段落都讀它。
2. 因為是建置時寫死：開賣當天**網站要重新部署一次**；iOS 送審的那個 build 就要帶 `true`（審查員在 App 內看到的條款才會和購買畫面一致）。
3. 標【綁用量上限開關】的段落（免費版數字）要跟 `limits_enforced` 同步。最簡單是第 00 節第 6 條選 (a) 同日打開；否則要在網頁讀 `my_plan_usage.enforced` 決定顯示與否。
4. 送審日 vs 開賣日：App Store Connect 填的隱私權網址指向官網。**P3、P4（RevenueCat 揭露）建議在送審當天就先上線**（文字寫成「在 iOS App 購買時…」，開賣前上線也不失真），否則審查員看到官網寫「目前沒有啟用 Pro 付款流程」卻在 App 內看到購買畫面，與 Apple 準則 5.1.1(i) 不一致，有被退件風險（推測，非 Apple 明文）。

---

## 3. 法務頁共用元件

### B1｜`components/legal/legal-page.tsx:28`（橫幅，繁中英文同一行）【綁開賣開關】

現有：「Huddle 目前提供免費使用。Pro 訂閱尚未開放，註冊帳號、下載或登入都不會自動收費。」／“Huddle is currently free to use. Pro subscriptions are not available for purchase. Creating an account, downloading the app or signing in will not automatically charge you.”

改成（繁中）：
> Huddle 的核心功能目前免費使用。Huddle Pro 是選購的自動續訂訂閱，目前只在 iOS App 內透過 Apple 購買；註冊帳號、下載或登入都不會自動收費。

改成（English）：
> Huddle’s core features are currently free to use. Huddle Pro is an optional auto-renewing subscription, currently sold only in the iOS app through Apple. Creating an account, downloading the app or signing in will not automatically charge you.

### B2｜`lib/legal/operator.ts:10`（頁面更新日期，顯示於 `legal-page.tsx:25`）【綁開賣開關】

現有：`LEGAL_UPDATED = { zh: '2026 年 10 月 2 日', en: 'October 2, 2026' }`
開賣日改成：`{ zh: '【開賣日】', en: '【launch date】' }`（不填不能開賣）。

### B3｜頁尾營運者一行：`components/legal/legal-page.tsx:37`、`components/marketing/marketing-page.tsx:52、79`【第 00 節第 1 條定案後才改，不綁開關】

現有：「Huddle 由個人經營者提供。客服電話：」／“Huddle is operated by an individual in Taiwan. Customer service phone: ”
改成：
> 繁中：Huddle 由【本名】（個人經營）提供。客服電話：
> English：Huddle is operated by 【name】, an individual in Taiwan. Customer service phone: 

---

## 4. 服務條款 `/terms`

### T1｜`app/terms/page.tsx:10`、`app/en/terms/page.tsx:10`（選擇性，非法遵必要）【綁開賣開關】

> 繁中：把「網頁版與桌面版使用同一個帳號同步資料」改為「網頁版、桌面版與 iOS App 使用同一個帳號同步資料」。
> English：把 “The web and desktop apps sync through the same account.” 改為 “The web, desktop and iOS apps sync through the same account.”

### T2｜`app/terms/page.tsx:13`、`app/en/terms/page.tsx:13`（〈免費使用與未來訂閱〉整節替換；該節最後的 `<WebOnly>` 網站試用句保留不動）【綁開賣開關；第 2 段綁用量上限開關】

現有：標題「免費使用與未來訂閱」，內文「目前沒有可購買的 Pro 訂閱。官網顯示的 NT$150／月與 NT$990／年為台灣預定方案，不是已開放的交易。…」＋「預定方案以新台幣計價，已含稅（如適用），沒有其他手續費。」

改成（繁中）：
> **標題：免費功能與 Huddle Pro 訂閱**
>
> 任務、行事曆、專注計時、記事本、白板等核心功能目前免費，不需要訂閱。原有的免費帳號不會自動轉成付費訂閱；只有你在購買畫面主動確認後，訂閱才會成立。
>
> 免費方案的用量上限：進行中（未完成且未封存）的任務 150 個、記事本筆記 100 則、上傳圖片合計 200MB、AI 會議整理每月 5 次。達到上限時只會暫停「新增」，既有內容仍可查看、編輯與刪除。在 Huddle Pro 推出前已連結 Google 日曆的帳號，可以繼續免費使用這項連結。【綁用量上限開關】
>
> Huddle Pro 是選購的加值方案，目前包含：AI 會議整理每月 20 次；進行中任務與記事本筆記不設數量上限；上傳圖片合計 20GB；建立組織；串接 Google 日曆。購買當時包含的內容，以購買畫面顯示的為準。
>
> 台灣 App Store 的價格為月繳 NT$150、年繳 NT$990，以新台幣計價並已含稅，沒有其他手續費。其他國家或地區由 Apple 以當地幣別顯示價格，可能因匯率與當地稅制而不同；實際收取的金額與幣別，以你確認購買前 App Store 畫面顯示的為準。
>
> 目前只能在 Huddle 的 iOS App 內，透過 Apple 的 App 內購買訂閱，款項由 Apple 向你 Apple 帳號的付款方式收取；Huddle 不會取得你的卡號。Pro 權益綁定你的 Huddle 帳號，登入同一個帳號，在網頁版與桌面版也能使用。
>
> 第一次訂閱 Huddle Pro 可享 2 週（14 天）免費試用，每個 Apple 帳號限一次。開始試用時需要以 Apple 帳號的付款方式確認，試用期間不收費。如果沒有在試用結束前至少 24 小時取消，試用結束時會自動轉為你選擇的方案，並依購買畫面顯示的價格扣款。
>
> 訂閱會在每個計費週期結束時自動續訂並扣款，直到你取消為止。要取消，請在 iPhone 或 iPad 開啟「設定」→ 點你的名字 →「訂閱」→ Huddle →「取消訂閱」。Apple 可能在新一期開始前 24 小時內扣款，請至少在續訂日前 24 小時取消。取消後，Pro 仍可使用到已付費期間結束。移除 App 或刪除 Huddle 帳號不會取消訂閱。
>
> 訂閱到期後，帳號會回到免費方案，Pro 專屬功能與較高額度會停止。你的資料不會因此被刪除；超過免費上限的內容也會保留，仍可查看、編輯與刪除，只是在低於上限前不能再新增。
>
> 贈送的 Pro 時間：我們可能透過活動、優惠碼或推薦送你 Pro 使用時間。贈送時間不需付款，到期後自動回到免費方案，不會自動轉為付費訂閱，也不能折換現金；如果你同時有付費訂閱，贈送時間會接在付費期間之後。
>
> 如果日後調整訂閱價格，會透過 Apple 事先通知你。依 Apple 規定需要你同意的調漲，若你沒有同意，訂閱會在當期結束後停止續訂，不會以新價格扣款。取消、退款與解除契約的方式，請見〈取消與退款〉（連結 `/refunds`）。

改成（English）：
> **Title: Free features and Huddle Pro subscriptions**
>
> Core features — tasks, calendar, focus timer, notebook and whiteboard — are currently free and do not require a subscription. An existing free account will not automatically become a paid subscription; a subscription starts only after you actively confirm it on the purchase screen.
>
> Free plan limits: 150 active (not completed and not archived) tasks, 100 notebook notes, 200 MB of uploaded images in total, and 5 AI meeting summaries per month. When you reach a limit, only adding new items is paused; you can still view, edit and delete existing content. Accounts that connected Google Calendar before Huddle Pro launched can keep using that connection for free. [tied to the usage-limit switch]
>
> Huddle Pro is an optional paid plan. It currently includes: 20 AI meeting summaries per month; no limit on the number of active tasks or notebook notes; 20 GB of uploaded images in total; creating organizations; and Google Calendar connection. What is included at the time of purchase is shown on the purchase screen.
>
> On the Taiwan App Store, Huddle Pro costs TWD 150 per month or TWD 990 per year, in New Taiwan dollars including tax, with no additional fees. In other countries and regions, Apple shows the price in the local currency; it may differ because of exchange rates and local taxes. The amount and currency you are actually charged are those shown on the App Store screen before you confirm your purchase.
>
> Huddle Pro can currently be purchased only inside the Huddle iOS app, through Apple’s In-App Purchase. Apple charges the payment method on your Apple Account; Huddle never receives your card number. Pro is linked to your Huddle account, so it is also available when you sign in to the same account on the web or desktop.
>
> New subscribers get a 2-week (14-day) free trial of Huddle Pro, once per Apple Account. Starting the trial requires confirming with the payment method on your Apple Account; you are not charged during the trial. Unless you cancel at least 24 hours before the trial ends, the trial automatically converts to the plan you selected and you are charged the price shown on the purchase screen.
>
> The subscription renews automatically at the end of each billing period, and you are charged again, until you cancel. To cancel, open Settings on your iPhone or iPad, tap your name, tap Subscriptions, select Huddle and tap Cancel Subscription. Apple may charge the renewal up to 24 hours before the new period begins, so cancel at least 24 hours before your renewal date. After you cancel, Pro stays available until the end of the period you have already paid for. Uninstalling the app or deleting your Huddle account does not cancel the subscription.
>
> When a subscription ends, your account returns to the free plan, and Pro-only features and higher allowances stop. Your data is not deleted; content above the free limits is kept and you can still view, edit and delete it, but you cannot add more until you are below the limit.
>
> Gifted Pro time: we may give you Pro time through promotions, promo codes or referrals. Gifted time requires no payment, returns to the free plan when it ends, never turns into a paid subscription automatically, and cannot be exchanged for cash. If you also have a paid subscription, gifted time is added after the paid period.
>
> If the subscription price changes, you will be notified in advance through Apple. Where Apple requires your consent to an increase and you do not agree, the subscription stops renewing at the end of the current period and you are not charged the new price. For cancellation, refunds and withdrawal rights, see our Cancellation and refunds page (link `/en/refunds`).

依據：消保法§18 I(2)(3)、§22；Apple 訂閱頁與準則 3.1.2(c)（付錢得到什麼要講清楚，例如容量）；Apple 台灣條款（24 小時、自動續訂）；Apple 取消說明 118428。數字出處見 1-A。

### T3｜`app/terms/page.tsx:27`、`app/en/terms/page.tsx:27`（只刪最後一段）【綁開賣開關】

現有：「本頁不代表 Huddle 已開放收費、取得商店上架核准或金流審核通過。」／“This page does not mean that Huddle has enabled billing, received app store approval or passed a payment provider’s review.”
改成：**整段刪除**。（不要改寫成「網站購買尚未開放」：這頁也會出現在 iOS App 內，提到其他購買方式有 Apple 準則 3.1.1(a) 風險；網站購買的狀態已由 `<WebOnly>` 段落交代。）

### T4｜`app/en/terms/page.tsx:7`（英文 metadata description）【綁開賣開關】

現有：“…and how Huddle Pro subscriptions will be billed, renewed, cancelled and refunded once website purchases open.”
改成：
> How Huddle works, how to manage your account and content, and how Huddle Pro subscriptions are billed, renewed, cancelled and refunded.

（繁中版 `app/terms/page.tsx:7` 沒有 description，不用改。）

### T5｜營運者區塊 `components/legal/legal-page.tsx:52-76`（`OperatorBlock`，條款 `#operator` 與使用協助共用）【第 00 節第 1、2、7、8 條定案後才改，不綁開關】

已上線（PR #126）：個人經營者、營運者型態、客服電話、可來電事項。**缺：名稱、地址**（擋開賣），以及選填的 Email、統編、回覆時效。

改成（繁中，取代 `:66-71`）：
> Huddle 由台灣的個人經營者【本名】營運並提供服務。
> - 營運者：【本名】（個人）
> - 聯絡地址：【聯絡地址】
> - 客服電話：{SUPPORT_PHONE}
> - 電子郵件：【客服 Email】（不填就整行刪除）
> - 統一編號：【統一編號】（未辦稅籍就整行刪除）
>
> 訂閱、扣款、取消、退款、解除契約、消費申訴與個人資料請求，都可以來電（或寫信）洽詢，我們通常在【回覆時效】內回覆（不填就整句刪除）。來電時請準備好你的 Huddle 帳號 Email，並請不要告知完整卡號、密碼或驗證碼。一般技術問題也可以到使用協助頁所列的 GitHub 公開問題回報頁提交。

改成（English，取代 `:57-62`）：
> Huddle is operated and provided by 【name】, an individual in Taiwan.
> - Operator: 【name】 (individual)
> - Address: 【address】
> - Customer service phone: {SUPPORT_PHONE}
> - Email: 【support email】 (delete the line if not provided)
> - Taiwan tax ID (Unified Business Number): 【tax ID】 (delete the line if not registered)
>
> Call (or email) us about subscriptions, charges, cancellation, refunds, withdrawal from a contract, complaints and personal data requests. We usually reply within 【response time】 (delete the sentence if not provided). Please have the email address of your Huddle account ready, and never tell us your full card number, password or verification codes. Technical problems can also be reported on the public GitHub issue page described on our help page.

連帶：`lib/legal/operator.ts:5-7` 註解要更新；本名、地址、Email 加進同一檔當常數，所有頁面引用同一來源。

### 初稿段落處置（/terms）

| 初稿段 | 處置 |
|---|---|
| T3（不排除法定權利） | 已上線（`app/terms/page.tsx:26` 末句、`:29`），刪除 |
| T4 第一句（刪帳號不等於取消 App Store 訂閱） | 已上線（`:27`），刪除；第二句改為本稿 T3 |
| T5（營運者新節） | 已上線為 `OperatorBlock`，改為本稿 T5 的差異 |
| T6（英文 metadata） | 改為本稿 T4（行號 5→7） |

---

## 5. 取消訂閱與退款 `/refunds`

`<WebOnly>` 網站購買三節（`app/refunds/page.tsx:11-27`）**不動**，開賣日仍正確（網站購買尚未開放）。

### R1｜`app/refunds/page.tsx:10`、`app/en/refunds/page.tsx:10`（整節替換）【綁開賣開關】

現有：標題「目前沒有 Huddle 訂閱扣款」，內文「Pro 尚未開放購買，所以現在不會有任何 Huddle 訂閱，也沒有試用結束後的自動扣款。…來電 {SUPPORT_PHONE} 詢問…」

改成（繁中）：
> **標題：Huddle Pro 怎麼扣款**
>
> Huddle Pro 是自動續訂的訂閱，目前只在 iOS App 內透過 Apple 購買，由 Apple 向你 Apple 帳號的付款方式扣款，收據也由 Apple 寄發。月繳方案每月扣款一次，年繳方案每年扣款一次。台灣價格為月繳 NT$150、年繳 NT$990；其他地區以 App Store 顯示的當地價格為準。
>
> 第一次訂閱有 2 週（14 天）免費試用，每個 Apple 帳號限一次。試用期間不收費；如果沒有在試用結束前至少 24 小時取消，試用結束時會自動扣第一期費用。註冊或登入 Huddle 不需要提供信用卡資料。
>
> 若你看到不認得的 Huddle 扣款，請先確認 Apple 收據上的商品與購買帳號，再來電 {SUPPORT_PHONE} 詢問；不要在公開問題回報頁貼出收據、卡號或個人資料。

改成（English）：
> **Title: How Huddle Pro is billed**
>
> Huddle Pro is an auto-renewing subscription, currently sold only in the iOS app through Apple. Apple charges the payment method on your Apple Account and sends the receipt. The monthly plan is charged once a month and the annual plan once a year. In Taiwan the price is TWD 150 per month or TWD 990 per year; elsewhere, the local price shown on the App Store applies.
>
> New subscribers get a 2-week (14-day) free trial, once per Apple Account. You are not charged during the trial; unless you cancel at least 24 hours before it ends, the first period is charged automatically when the trial ends. You do not need to provide a credit card to create a Huddle account or sign in.
>
> If you see a Huddle charge you do not recognize, first check the item and purchasing account on your Apple receipt, then call {SUPPORT_PHONE}. Do not post receipts, card numbers or personal information on a public issue page.

### R2｜`app/refunds/page.tsx:28`、`app/en/refunds/page.tsx:28`（整節替換）【綁開賣開關】

現有：標題「日後透過 Apple 購買時」／“If you purchase through Apple in the future”，內文「若未來從 App Store 訂閱…」

改成（繁中）：
> **標題：取消續訂與申請退款（Apple）**
>
> 取消續訂：在 iPhone 或 iPad 開啟「設定」→ 點你的名字 →「訂閱」→ Huddle →「取消訂閱」，也可以參考 Apple 的取消訂閱說明（連結 https://support.apple.com/118428）。請至少在續訂日或試用結束前 24 小時取消。取消後不會再續扣，Pro 可以使用到已付費期間結束；取消續訂本身不會退還已經扣的款項。Apple 的訂閱無法在 Huddle 網站取消或退款。
>
> 申請退款：退款由 Apple 審核，並退回原付款方式。請到 reportaproblem.apple.com 登入，選擇「申請退款」，選擇原因與 Huddle Pro 後送出，也可以參考 Apple 官方退款流程（連結 https://support.apple.com/118223）。扣款還在待處理狀態時，暫時無法申請。台灣消費者的七日解除權，另見下方〈解除契約與你的權利〉。

改成（English）：
> **Title: Cancelling renewal and requesting a refund (Apple)**
>
> To cancel renewal: open Settings on your iPhone or iPad, tap your name, tap Subscriptions, select Huddle and tap Cancel Subscription. You can also follow Apple’s cancellation instructions (link https://support.apple.com/118428). Cancel at least 24 hours before your renewal date or the end of your trial. After you cancel, you will not be charged again and Pro stays available until the end of the period you have paid for. Cancelling renewal does not itself refund a charge that has already been made. Apple subscriptions cannot be cancelled or refunded on the Huddle website.
>
> To request a refund: Apple reviews refund requests and returns approved refunds to the original payment method. Sign in at reportaproblem.apple.com, choose “Request a refund”, select the reason and Huddle Pro, and submit. You can also follow Apple’s official refund process (link https://support.apple.com/118223). A refund cannot be requested while the charge is still pending. For the seven-day withdrawal right of consumers in Taiwan, see “Withdrawal and your rights” below.

### R3｜`app/refunds/page.tsx:29`（Google Play）

不動。

### R4｜`app/refunds/page.tsx:30`、`app/en/refunds/page.tsx:30`（只換「透過 Apple 購買」那一條 `<li>`，並在 `</ul>` 後加一段）【綁開賣開關；版本由第 00 節第 3 條決定】

已上線（不動）：第一段七日解除權說明、「沒有一律不退」、網站購買 `<li>`、法條連結。

現有 `<li>`：「**透過 Apple 購買**（開放後）：款項由 Apple 收取，請依上方流程向 Apple 申請退款；需要協助時可來電 {SUPPORT_PHONE}。」

**版本 A（建議；第 00 節第 3 條選「要」）** 繁中：
> **透過 Apple 購買**：款項由 Apple 收取，請先依上方流程向 Apple 申請退款。台灣的消費者在試用結束後第一次扣款起 7 天內（年繳方案續訂扣款後 7 天內亦同）想解除契約時，也請來電 {SUPPORT_PHONE}【或寫信到【客服 Email】】告訴我們，並準備好 Huddle 帳號 Email 與 Apple 收據上的訂單編號。我們會在收到你通知的隔天起 15 天內完成退款：Apple 已核准的，以 Apple 退款為準；期限內 Apple 沒有核准的，由我們以匯款退還該期款項（需要你提供收款帳戶），不會以 Apple 的決定作為拒絕的理由。

版本 A English：
> **Purchases through Apple**: Apple collects the payment, so first request a refund from Apple as described above. If you are a consumer in Taiwan and want to withdraw within 7 days after the first charge following your trial (or within 7 days after an annual plan renewal charge), also call {SUPPORT_PHONE} [or email 【support email】] and have your Huddle account email and the order ID on your Apple receipt ready. We will complete the refund within 15 days starting the day after we receive your notice: if Apple approves it, Apple’s refund applies; if Apple has not approved it within that time, we will refund that period’s payment by bank transfer (you will need to give us account details), and we will not rely on Apple’s decision as a reason to refuse.

**版本 B（不承諾）** 繁中：
> **透過 Apple 購買**：款項由 Apple 收取，請依上方流程向 Apple 申請退款。若你是台灣的消費者、想在 7 天內解除契約而 Apple 沒有核准，請來電 {SUPPORT_PHONE} 告訴我們，我們會依適用法律與你確認處理方式。

版本 B English：
> **Purchases through Apple**: Apple collects the payment, so request a refund from Apple as described above. If you are a consumer in Taiwan who wants to withdraw within 7 days and Apple does not approve the refund, call {SUPPORT_PHONE} and we will work out how to handle it with you under the applicable law.

（版本 B 文字本身不違法，但實際仍要履行§19-2 II 的返還義務，只是沒寫出來。）

`</ul>` 後新增一段（兩版本共用）：
> 繁中：在台灣以外購買時，退款資格依當地法律與 Apple 在當地的條款而定；本頁不限制你依居住地法律享有、且不得以約定排除的消費者權利。
> English：For purchases outside Taiwan, refund eligibility depends on local law and Apple’s terms for your region. Nothing on this page limits consumer rights that you have under the law of your place of residence and that cannot be excluded by agreement.

（初稿的歐盟 14 天撤回權段**刪除**：不在歐盟上架。）

### R5｜新增一節，放在 `app/refunds/page.tsx:30` 之後、`:31` 之前【綁開賣開關】

繁中：
> **標題：訂閱到期或取消後**
>
> 訂閱到期後，帳號會回到免費方案，Pro 專屬功能與較高額度會停止。你的資料不會因此被刪除；超過免費上限的內容也會保留，仍可查看、編輯與刪除。之後想再使用 Pro，可以在 iOS App 重新訂閱；換手機或重新安裝後，可以在訂閱畫面點「恢復購買」。

English：
> **Title: After a subscription ends or is cancelled**
>
> When a subscription ends, your account returns to the free plan, and Pro-only features and higher allowances stop. Your data is not deleted; content above the free limits is kept and you can still view, edit and delete it. To use Pro again, subscribe again in the iOS app. After changing phones or reinstalling, tap “Restore purchases” on the subscription screen.

（「恢復購買」要等 1-C #6 購買畫面做好才成立。）

### R6｜`app/en/refunds/page.tsx:7`（英文 metadata description）【綁開賣開關】

現有：“Current billing status, how cancellation, the free trial and refunds will work once website purchases open, and official app store refund resources.”
改成：
> How Huddle Pro is billed through Apple, how to cancel renewal and request a refund, your withdrawal rights, and how website purchases will work once they open.

### 初稿段落處置（/refunds）

| 初稿段 | 處置 |
|---|---|
| R4 歐盟段 | 刪除（不上歐盟） |
| R6（刪帳號前先取消 Apple 續訂） | 已上線（`app/refunds/page.tsx:31`），刪除 |
| R7（英文 metadata） | 改為本稿 R6（行號 4→7） |

---

## 6. 使用協助 `/support`

### S1｜`app/support/page.tsx:13`、`app/en/support/page.tsx:13`（〈訂閱與帳務問題〉：換第一個 `<p>`、改最後一個 `<p>` 一句；中間 `<WebOnly>` 不動）【綁開賣開關】

現有第一個 `<p>`：「Huddle 尚未開放 Pro 訂閱。未來訂閱的管理入口與退款資訊整理於取消與退款；目前不用為了註冊或登入提供信用卡資料。」／“Pro subscriptions are not available yet. Guidance for future subscription management is on the cancellation and refunds page. You do not currently need to provide a credit card to create an account or sign in.”

改成：
> 繁中：Huddle Pro 目前在 iOS App 內透過 Apple 訂閱。取消續訂、申請退款、免費試用與解除契約的說明，整理於〈取消與退款〉（連結 `/refunds`）。註冊或登入不需要提供信用卡資料。
> English：Huddle Pro is currently available in the iOS app through Apple. Guidance on cancelling renewal, requesting a refund, the free trial and withdrawal rights is on the cancellation and refunds page (link `/en/refunds`). You do not need to provide a credit card to create an account or sign in.

現有最後一個 `<p>` 中段：「購買後 Pro 沒有生效時，請確認登入的是購買時使用的 Huddle 帳號，仍然沒有生效請來電…」
改成：
> 繁中：購買後 Pro 沒有生效時，請確認登入的是購買時使用的 Huddle 帳號，並在訂閱畫面點「恢復購買」；仍然沒有生效請來電…（其後原文不動）
> English：If Pro is not active after a purchase, check that you are signed in to the Huddle account you used to buy, then tap “Restore purchases” on the subscription screen; if it is still not active, call…（rest unchanged）

### 初稿段落處置（/support）

| 初稿段 | 處置 |
|---|---|
| S1（帳務改用私人管道） | 已上線為電話（`app/support/page.tsx:11`），刪除；Email 定案後在同句加「或寫信到【客服 Email】」 |
| S2（無法登入時刪帳號） | 已上線為電話（`:12`），刪除 |
| S4（聯絡我們） | 已上線為 `OperatorBlock title="聯絡我們"`（`:14`），併入本稿 T5 |

---

## 7. 資料與隱私說明 `/privacy`

### P1｜`app/privacy/page.tsx:9`、`app/en/privacy/page.tsx:9`（第一句）【第 00 節第 1 條定案後才改，不綁開關】

已上線：「Huddle 由個人經營者提供，並由其蒐集與處理本頁所列的個人資料…」
改成：
> 繁中：Huddle 由【本名】（個人經營者）提供，並由其蒐集與處理本頁所列的個人資料（營運者資訊與聯絡方式見服務條款）。
> English：Huddle is operated by 【name】, an individual, who collects and processes the personal data described in this notice (contact details are in the operator section of our terms).

### P2｜`app/privacy/page.tsx:11`、`app/en/privacy/page.tsx:11`（只改一個子句）【綁用量上限開關】

**協調提醒**：同一段的「store: false」歸因由另一條工作線修正；本條只動下面這個子句，合併時以對方修好的版本為底再套本條。

現有：「這項功能每人每月有次數上限」／“This feature has a monthly per-person limit”
改成：
> 繁中：這項功能每人每月有次數上限（免費方案 5 次、Huddle Pro 20 次）
> English：This feature has a monthly per-person limit (5 on the free plan, 20 with Huddle Pro)

（開關關閉時所有人都是 20 次，現有的不寫數字版本正確，所以這句只跟用量上限開關一起換。）

### P3｜`app/privacy/page.tsx:10`、`app/en/privacy/page.tsx:10`（在 `<WebOnly>` 之後插入一個 `<p>`）【建議送審日上線，見第 2 節第 4 點】

> 繁中：在 iOS App 購買 Huddle Pro 時，付款由 Apple 處理，訂閱狀態透過 RevenueCat 同步，詳見下方〈訂閱與付款資料〉。
> English：When you buy Huddle Pro in the iOS app, Apple processes the payment and your subscription status is synced through RevenueCat; see “Subscriptions and payment data” below.

### P4｜`app/privacy/page.tsx:16`、`app/en/privacy/page.tsx:16`（〈訂閱與付款資料〉換第一個 `<p>`；`<WebOnly>` 與最後一個 `<p>` 不動）【建議送審日上線】

現有：「目前沒有啟用 Pro 付款流程。日後開放 Apple、Google Play 或訂閱管理服務時，會在啟用前補充交易、訂閱識別資訊及相關供應商的處理方式。註冊帳號不會自動產生訂閱。」／“Pro payment flows are not currently enabled. …”

改成（繁中，數個 `<p>`）：
> **在 iOS App 購買（Apple）**
>
> 在 iOS App 內購買 Huddle Pro 時，付款由 Apple 處理：你的卡號與 Apple 帳號的付款資料只在 Apple 端，Huddle 不會取得，也不會儲存。Apple 依其隱私權政策處理這些資料。
>
> 為了確認你的帳號是否有 Pro、同步訂閱狀態並處理帳務問題，Huddle 使用訂閱管理服務 RevenueCat（RevenueCat, Inc.，美國）。當你在 iOS App 開啟訂閱畫面、購買或恢復購買時，會傳送給 RevenueCat 的資料包括：你的 Huddle 帳號識別碼（一組隨機代碼，不是你的電子郵件）、Apple 提供的交易資訊（商品、購買與到期時間、續訂與試用狀態、交易識別碼、商店地區），以及裝置類型與作業系統等技術資訊。RevenueCat 代表 Huddle 處理這些資料，並儲存在美國的伺服器。
>
> Huddle 自己的伺服器只保存訂閱結果：你的帳號是否有 Pro、到期時間，以及用來避免重複處理的事件編號。這些資料用於提供 Pro 功能、客服與對帳，不會用於廣告，也不會出售。【第 00 節第 3 條選「要」才加這句：】若依〈取消與退款〉由我們直接退款，我們會請你提供收款帳戶資訊，只用於該筆退款與帳務紀錄。
>
> 訂閱權益紀錄在帳號存續期間保存，刪除帳號時一併移除；Apple 與 RevenueCat 依其規定保存的交易紀錄，以及我們依稅務、會計法令必須保存的帳務紀錄，不在立即刪除的範圍內。這些資料可能在台灣以外的地區（包括美國）處理。註冊帳號不會自動產生訂閱。

改成（English）：
> **Purchases in the iOS app (Apple)**
>
> When you buy Huddle Pro in the iOS app, Apple processes the payment: your card number and the payment details on your Apple Account stay with Apple. Huddle does not receive or store them. Apple handles that data under its own privacy policy.
>
> To confirm whether your account has Pro, keep your subscription status in sync and handle billing questions, Huddle uses RevenueCat (RevenueCat, Inc., United States), a subscription management service. When you open the subscription screen in the iOS app, purchase or restore a purchase, the following is sent to RevenueCat: your Huddle account identifier (a random ID, not your email address); transaction information provided by Apple (product, purchase and expiry times, renewal and trial status, transaction identifiers and storefront region); and technical information such as device type and operating system. RevenueCat processes this data on Huddle’s behalf and stores it on servers in the United States.
>
> Huddle’s own servers keep only the result: whether your account has Pro, when it expires, and event IDs used to avoid processing the same update twice. This data is used to provide Pro features, support and reconciliation. It is not used for advertising and is not sold. [Only if owner decision 3 is “yes”:] If we refund you directly as described on the Cancellation and refunds page, we will ask for your bank account details and use them only for that refund and our billing records.
>
> The entitlement record is kept while your account exists and is removed when you delete your account. Transaction records kept by Apple and RevenueCat under their own rules, and billing records we are required to keep under tax and accounting laws, are not covered by immediate deletion. This data may be processed outside Taiwan, including in the United States. Creating an account does not create a subscription.

依據：個資法§8 I(1)–(5)；Apple 準則 5.1.1(i)；RevenueCat 隱私權政策與 DPA（受託處理、存美國 AWS）。程式依據見 1-C #3、#4、#7。

### 初稿段落處置（/privacy）

| 初稿段 | 處置 |
|---|---|
| P1（營運者一句） | 已上線（`app/privacy/page.tsx:9`），改為本稿 P1 的換名差異 |
| P3（刪帳號不取消 App Store 訂閱） | 已上線（`:14`）；RevenueCat 部分併入本稿 P4 |
| P4（其他請求的聯絡方式） | 已上線為電話（`:15`），刪除；Email 定案後同句加「或寫信到【客服 Email】」 |
| P5 的 GDPR／當地主管機關申訴句 | 刪除（不上歐盟） |

---

## 8. 官網行銷頁（紅 3 的完整替換文字）

檔案：`components/marketing/marketing-page.tsx`。價格 `NT$150`（`:230`）與 `year: 'NT$990／年'`（`:41`、`:68`）已正確，**不用改**。`lib/billing/plans.ts:3` 參考價已是 150／990，不用改；`:4` `livePurchasesEnabled` 沒人讀，對外不顯示，不影響法遵。以下全部【綁開賣開關】，M2 另【綁用量上限開關】。

| # | 位置 | 現有 | 開賣日改成（繁中） | 開賣日改成（English，對應 `:66-78`） |
|---|---|---|---|---|
| M1 | `priceIntro` `:39`／`:66` | 目前核心功能免費開放。Pro 訂閱尚未開放購買，不會自動收費。 | 核心功能免費使用。想要更多，可以在 iOS App 內訂閱 Pro；註冊不會自動收費。 | Core features are free to use. For more, subscribe to Pro in the iOS app. Signing up never starts a charge automatically. |
| M2 | `freeBody` `:40`／`:67` | 任務、行程、專注計時、記事本與白板。同一個帳號，在不同裝置查看與同步。 | 任務、行程、專注計時、記事本與白板，同一個帳號跨裝置同步。免費版可有 150 個進行中任務、100 則筆記、200MB 圖片空間，AI 會議整理每月 5 次。 | Tasks, calendars, focus timers, notebooks and the whiteboard, synced across devices with one account. The free plan includes 150 active tasks, 100 notes, 200 MB of image storage and 5 AI meeting summaries a month. |
| M3 | `soon` `:41`／`:68`（顯示在 `:230` 的 Pro 標籤） | 準備中／Coming later | iOS App 內購買 | In the iOS app |
| M4 | `proBody` `:41`／`:68` | 這是已規劃的台灣價格。付費功能與額度會在正式開放前說明，目前沒有訂閱或付款按鈕。 | AI 會議整理每月 20 次、任務與筆記不設數量上限、20GB 圖片空間、建立組織、串接 Google 日曆。首次訂閱享 2 週免費試用（每個 Apple 帳號限一次），之後每月或每年自動續訂，可隨時在 Apple 帳號取消。 | 20 AI meeting summaries a month, no limit on tasks or notes, 20 GB of image storage, organizations and Google Calendar connection. New subscribers get a 2-week free trial (once per Apple Account); after that it renews monthly or yearly until you cancel in your Apple Account. |
| M5 | FAQ 第 1 題答案 `:45`／`:72` | 可以。目前核心功能免費開放，註冊帳號不會自動收費。Pro 尚未開放購買，正式推出前會公布完整功能與計費方式。 | 可以。核心功能免費使用，註冊帳號不會自動收費。免費版有用量上限；需要更多時，可以在 iOS App 內訂閱 Pro（月繳 NT$150、年繳 NT$990），完整說明見服務條款與取消與退款。 | Yes. Core features are free, and creating an account does not start a paid subscription. The free plan has usage limits; for more, you can subscribe to Pro in the iOS app (TWD 150 a month or TWD 990 a year). See our terms and the cancellation and refunds page for details. |
| M6 | `priceNote` `:51`／`:78`（只在網站顯示，`:231`） | 價格以新台幣計…Pro 開放購買後，預計提供 2 週免費試用…首次扣款後 7 天內可申請全額退款。目前尚未開放購買。 | 價格以新台幣計，已含稅，沒有其他費用。Pro 目前在 iOS App 內透過 Apple 購買：首次訂閱可享 2 週免費試用（每個 Apple 帳號限一次；如果沒有在試用結束前至少 24 小時取消，會自動扣第一期），之後每月或每年自動續訂，可隨時在 Apple 帳號的訂閱設定取消。網站信用卡購買尚未開放。 | Prices are in New Taiwan dollars and include tax, with no additional fees. Pro is currently sold in the iOS app through Apple: new subscribers get a 2-week free trial (once per Apple Account; unless you cancel at least 24 hours before it ends, the first period is charged automatically), and it then renews monthly or yearly until you cancel in your Apple Account’s subscription settings. Website card purchases are not available yet. |

註：M2 若用量上限開關晚於開賣才打開，M2 先維持原文。M5「免費版有用量上限」同樣綁用量上限開關；開關未開時刪掉那半句。M6 只在網站顯示，所以可以提「網站信用卡購買尚未開放」；M1–M5 會出現在 App 內，不提網站購買。

---

## 9. 法規依據（法規明文 vs 我的判斷）

### 9-1 台灣（2026-10-01 開啟全國法規資料庫核對；2026-10-02 重開消保法、個資法沿革頁確認無新修正）

| 法規・條號 | 白話重點（法規明文） | 修正／施行日期 | 來源 |
|---|---|---|---|
| 消費者保護法§2(10) | 用網路等方式、消費者沒辦法先檢視服務就訂的契約，是「通訊交易」 | 104-06-17 修正（2026-10-02 沿革頁確認仍為最新）；§2(10)(11)、§18–19-2 自 105-01-01 施行 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=2 |
| 消費者保護法§18 I | 通訊交易要提供：(1) 企業經營者名稱、代表人、事務所或營業所、電話或電子郵件 (2) 服務內容、對價、付款期日及方式 (3) 解除契約的期限及方式 (4) 是否排除解除權 (5) 消費申訴受理方式 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=18 |
| 消費者保護法§18 II | 網路交易的上述資訊要能讓消費者完整查閱、儲存 | 同上 | 同上 |
| 消費者保護法§19 I | 接受服務後七日內可解除契約，免說明理由、免負擔費用；有合理例外者不在此限 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=19 |
| 消費者保護法§19 III | 沒提供解除契約資訊，七日從提供的次日才起算，最長四個月 | 同上 | 同上 |
| 消費者保護法§19 V | 違反本條的約定無效 | 同上 | 同上 |
| 消費者保護法§19-2 II | 收到解除服務契約通知的次日起 15 日內，返還已付對價 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=19-2 |
| 消費者保護法§22 | 廣告要真實，對消費者的義務不得低於廣告內容 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=22 |
| 通訊交易解除權合理例外情事適用準則§2(5) | 數位內容或「一經提供即為完成之線上服務」，經消費者事先同意且經告知，才排除七日解除權 | 104-12-31 發布，105-01-01 施行 | https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170012 |
| 行政院 109-06-19 院臺消保字第 1090092557 號 | 判準是「即時提供後即已履行完畢，性質上不易返還」；舉例電子書、線上掃毒、轉帳或匯兌 | 109-06-19 | https://www.ey.gov.tw/Page/349B76CABB867CA0/2adfb384-a5b1-4521-9907-3eb629b4bbfe |
| 個人資料保護法§3、§8 I | 五項權利不得預先拋棄或特約限制；蒐集時要告知名稱、目的、類別、利用期間地區對象方式、權利與行使方式、不提供的影響 | 最近修正 114-11-11，施行日由行政院定之；**2026-10-02 沿革頁確認仍未定施行日**；§3、§8 不在該次修正之列 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=8 ；沿革 https://law.moj.gov.tw/LawClass/LawHistory.aspx?pcode=I0050021 |
| 個人資料保護法§21 | 國際傳輸在四種情形下主管機關「得限制」 | 同上（頁面顯示修正後條文） | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=21 |
| 公平交易法§21 I、II | 不得對價格、內容等足以影響交易決定的事項為虛偽不實或引人錯誤的表示 | 106-06-14 修正 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0150002&flno=21 |
| 稅籍登記規則§4-1 | 用網路或 App 銷售的營業人，要在頁面與 App 明顯位置揭露統編與營業人名稱 | 111-08-08 修正 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340087&flno=4-1 |

### 9-2 本次新引用（沿用同顧問 2026-10-01 於 SHOPLINE 草稿開過原文的查證，本次未重開）

| 來源 | 重點 | 日期 | URL |
|---|---|---|---|
| 財政部稅務入口網：網路交易課徵營業稅 Q&A | 勞務起徵點 5 萬元，達起徵點應即稅籍登記 | 頁面 114-02-05 更新 | https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/q-and-a |
| 商業登記法§5 | 每月銷售額未達營業稅起徵點者得免辦商業登記（反面推論超過可能要辦行號＝我的推論） | 頁面顯示最新修正 114-12-26 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0080004&flno=5 |
| 零售業等網路交易定型化契約應記載及不得記載事項 | 適用經濟部主管零售業之網路交易，條文針對商品；我判斷不直接適用線上服務（信心約 7 成） | 105-07-15 公告修正、105-10-01 生效 | https://www.ey.gov.tw/File/2D44FB65E5FF31C9 |
| SHOPLINE Payments 支付服務條款 §5-1(2)4 | 網站須揭露客服電話及 Email | v3-20260323 | https://www.shoplinepayments.com/zh-hant-tw/terms |

### 9-3 Apple（平台規範，不是法律；沿用初稿查證，2026-10-01）

| 規範 | 重點 | 來源 |
|---|---|---|
| App Review Guidelines 3.1.1／3.1.1(a) | 解鎖 App 內功能要用 App 內購；非美國 storefront 的 App 不得導向其他購買方式 | https://developer.apple.com/app-store/review/guidelines/ |
| App Review Guidelines 3.1.2(c) | 訂閱前要清楚說明付錢得到什麼（例如多少雲端空間） | 同上 |
| App Review Guidelines 1.5、5.1.1(i) | 要能容易聯絡開發者；隱私權政策要寫明蒐集什麼、給誰、保存與刪除 | 同上 |
| Auto-renewable Subscriptions | 訂閱畫面要有名稱與期間、內容、完整續訂價、恢復購買；試用寫明長度與試用後價格；要有條款與隱私連結 | https://developer.apple.com/app-store/subscriptions/ |
| Introductory offers | 每位顧客在同一訂閱群組只能用一次 | https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/ |
| App Privacy Details | 第三方夥伴蒐集的也要申報（Purchases、User ID） | https://developer.apple.com/app-store/app-privacy-details/ |
| 稅務資訊（台灣） | 台灣開發者要填稅表；Apple 在台灣代收代繳，金額依是否提供稅籍編號而不同 | https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/ |
| 註冊身分 | 個人註冊，App Store 賣家名稱顯示個人姓名 | https://developer.apple.com/programs/enroll/ |
| Apple 媒體服務條款（台灣，2026-09-14 版） | B 節：Apple 自稱內容符合合理例外、扣款不早於新一期前 24 小時；O 節：Apple 是 App 供應商的代理商，不是銷售合約當事人 | https://www.apple.com/legal/internet-services/itunes/tw/terms.html |
| 取消訂閱（2026-09-29）／申請退款（2026-09-17） | 設定 → 名字 → 訂閱；reportaproblem.apple.com，待處理扣款不能申請 | https://support.apple.com/118428 ／ https://support.apple.com/118223 |

### 9-4 RevenueCat（廠商文件，沿用初稿）

- 隱私權政策（2026-06）：資料處理者；儲存於美國 AWS。https://www.revenuecat.com/privacy/
- DPA（2026-08 生效）：客戶為控管者、RevenueCat 為處理者。https://www.revenuecat.com/dpa/
- App Privacy 申報指引：必報 Purchases；自訂 App User ID 要報 User ID。https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy

### 9-5 美國（沿用初稿；歐盟各列因不上架移到 10-D）

| 項目 | 重點 | 來源 |
|---|---|---|
| ROSCA，15 U.S.C. §8403 | 自動續訂要：取得付款資料前揭露重要條款、明示同意、簡單取消 | https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap110-sec8403.htm |
| 加州 Bus. & Prof. Code §17602 | 清楚揭露、明確同意、含取消方式的確認、年約續訂前 15–45 天提醒、可線上取消；AB 2863 自 2025-07-01 適用 | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602 |
| FTC Negative Option Rule | 2024 修正版 2025-07-08 被第八巡迴法院撤銷；2026-03 重新徵求意見 | https://www.ftc.gov/system/files/ftc_gov/pdf/p064202negativeoptionruleanprm.pdf |

### 9-6 我的判斷（不是法規明文，請律師確認）

1. **台灣的契約當事人是你不是 Apple**：依 Apple 台灣條款 O 節推論。信心約 7 成。
2. **持續性訂閱不適合主張例外準則§2(5)**：不像「即時提供後即履行完畢」。信心約 7 成。
3. **七日起算點**：有免費試用時從試用開始還是首次扣款起算，查無主管機關見解（信心約 5 成）；文案採對消費者較寬、且與網站一致的「試用結束後第一次扣款起 7 天」。
4. **續訂是否重新起算**：傾向不重新起算（信心約 5 成）；文案比照網站只對年繳續訂給 7 天，月繳續訂不給——這是對消費者加碼，不是法定。
5. **開用量上限算不算「影響既有權益」**：老用戶原本 AI 每月 20 次、任務筆記無上限，打開後免費降為 5 次／150／100，我認為算，依自家條款（`app/terms/page.tsx:26`）要提前 30 天通知。這是契約承諾，不是法條；送 60 天 Pro 讓實際影響晚於通知 60 天，我判斷可滿足（信心約 7 成）。
6. **郵政信箱能否當§18 的「事務所或營業所」**：查無見解。

---

## 10. 開賣前法遵風險（紅黃綠）

### 10-A 紅（不補齊不能開賣）— 2 項

1. **營運者名稱與地址仍未揭露。** 已上線：「個人經營者」＋電話（電話已滿足§18 I(1)「電話或電子郵件」）。缺：名稱、事務所或營業所。依據：消保法§18 I(1)、個資法§8 I(1)。動作：第 00 節第 1 條；填 T5、B3、P1。
2. **官網與法務頁的「尚未開放購買」字樣，開賣當天會變成不實表示。** 位置：`components/legal/legal-page.tsx:28`、`app/terms/page.tsx:13、27`、`app/refunds/page.tsx:10、28、30`、`app/support/page.tsx:13`、`app/privacy/page.tsx:16`、`components/marketing/marketing-page.tsx:39、41、45、51`（及各英文對應行）。依據：公平交易法§21、消保法§22。**新狀態：替換文字已全部備好（第 3–8 節），但沒有開關可以綁**（第 2 節）——工程要先建文案旗標，開賣當天網站重新部署。

（初稿紅 2「Pro 額度數字未定」→ **解除**，見綠 6。）

### 10-B 黃（動手前建議先問律師或主管機關）— 9 項

1. **台灣七日解除權的不確定點**（例外適用、起算日、Apple 拒退時由誰返還）。動作：律師確認 9-6 第 1–4 點；第 00 節第 3 條。
2. **打開用量上限＝變更既有權益**：自家條款承諾 30 天前通知。動作：第 00 節第 6 條。
3. **文案承諾與實際功能不一致**：App 內 `membership.tsx:151` 已寫「匯出」但沒有任務／筆記匯出；購買畫面與恢復購買未實作；webhook 未部署（專案記憶）。依據：消保法§22。動作：1-C #1、#6、#8。
4. **「不設數量上限」寫死**：日後加上限要提前 30 天通知。動作：第 00 節第 4 條。
5. **美國自動續訂法**：多數由 Apple 流程滿足；年約提醒是否由 Apple 通知滿足查無官方說明。動作：購買畫面自己寫出價格、週期、自動續訂、取消方式；美國上架前請律師看。
6. **稅籍與發票**：達勞務起徵點 5 萬元應辦稅籍；辦了要揭露統編（稅籍登記規則§4-1）；可能連帶要辦行號。動作：第 00 節第 7 條、會計師。
7. **定型化契約應記載事項**：查無線上訂閱專屬版本；零售業版我判斷不直接適用（信心約 7 成），已比照其不得記載事項當最佳實務（疑義有利消費者、保留§47 管轄已上線）。動作：律師確認。
8. **個資法 114-11-11 修正**：2026-10-02 確認仍未定施行日。動作：施行後重看隱私頁（外洩通報等）。
9. **歐盟以外其他上架國家未查**（例如日本特定商取引法的賣家揭露、韓國、英國）。「全世界扣掉歐盟」包含這些市場。動作：想知道哪些國家有額外揭露義務，請律師或先選定重點市場再查。

### 10-C 綠（查核過，草稿寫法合規）— 9 項

1. 沒有「一律不退」「永遠免費」（已上線 `app/refunds/page.tsx:30`；消保法§19 I、V、§22）。
2. 自動續訂、取消路徑、試用轉付費、24 小時寫法與 Apple 訂閱頁、台灣條款、取消說明一致。
3. 隱私揭露涵蓋 Apple、RevenueCat 的目的、類別、地區、對象（個資法§8 I(2)–(4)、Apple 5.1.1(i)）。
4. 個資五項權利未被限制，並有行使方式（電話，已上線 `app/privacy/page.tsx:15`；個資法§3、§8 I(5)）。
5. 資料傳美國有揭露；個資法§21 為「得限制」。
6. **Pro 與免費版的額度數字已從程式確認並填入**（`pro_limits.sql:54、56`）——初稿紅 2 解除；滿足§18 I(2)、Apple 3.1.2(c)。
7. 管轄法院保留消保法§47 與小額訴訟規定、疑義有利消費者（已上線 `app/terms/page.tsx:29`）。
8. 營運者的聯絡電話已揭露（`lib/legal/operator.ts:8`；§18 I(1) 後段）。
9. 傳給 RevenueCat 的是隨機 UUID、不含 Email（`native-adapter.ts:10、23`、`revenuecat-driver.ts:4`）。

### 10-D 延後（不在歐盟上架，之後要上歐盟時再處理）

- 歐盟 DSA trader：個人地址、電話、Email 會公開在 App Store 頁面（Apple DSA 頁，初稿已查）。
- 歐盟消費者法（Directive (EU) 2023/2673 自 2026-06-19 適用；EUR-Lex 原文未能開啟）。
- GDPR：App 不上歐盟後主要風險消失；但網頁版全球可用，若日後主動經營歐盟用戶，仍可能適用（執委會說明頁，初稿已查）。

---

## 11. 給工程師的放稿注意事項

1. 先建文案旗標（第 2 節），把第 3–8 節標【綁開賣開關】的段落接上；標【綁用量上限開關】的跟 `limits_enforced` 同步。P3、P4 建議送審日先上線。
2. 購買畫面（尚未實作）必備：方案名稱與期間、內容（AI 20 次、20GB、組織、Google 日曆、任務筆記不設上限）、完整價格、「2 週免費試用，試用結束前 24 小時未取消會自動扣款」、自動續訂與取消方式、恢復購買、`/terms`、`/privacy`、`/refunds` 連結。原因：Apple 訂閱頁要求；消保法§19 III（沒提供解除資訊，七日不起算、最長延到四個月）。
3. App 內 `components/operations/membership.tsx:151` 的「匯出」改掉或補做匯出（1-C #1）。
4. App Store Connect 的 App Privacy 申報 Purchases 與 User ID。
5. 佔位符沒填的整句／整行刪除，不要留空欄或「待補」。
6. `/support` 的 GitHub 連結指向 `dropout-tech/waddle`（`app/support/page.tsx:11`）。營運者是你個人、與 dropout 公司無關，對外可能讓人誤認營運主體；建議日後換成個人或 Huddle 名義的 repo。
7. App 內（Capacitor 包進去的頁面）不得出現網站購買字樣：本稿 M1–M5、T、R、S、P 段落都沒有提網站購買；網站購買只留在既有 `<WebOnly>` 與 M6。

---

## 12. 查核紀錄

- 2026-10-02 修訂：重讀 `components/legal/legal-page.tsx`、`web-only.tsx`、`lib/legal/operator.ts`、`app/{terms,refunds,support,privacy}/page.tsx` 與 `app/en/` 四頁、`components/marketing/marketing-page.tsx:30-82、226-232`、`lib/billing/plans.ts`、`load-native-session.ts`、`native-adapter.ts`、`supabase/migrations/20261001200000_pro_limits.sql:1-60、320-399`，grep 確認開關讀取點、購買流程呼叫端、造型／音樂包／匯出實作。行號皆為重讀當下的實際行號。
- 法規：台灣法規 5 部、16 條沿用 10-01 查證；2026-10-02 重開消保法與個資法沿革頁 2 頁（確認無新修正、個資法修正仍未施行）；新引用 4 項沿用同顧問 10-01 SHOPLINE 草稿查證。官方來源本次實際開啟 2 個，沿用 25 個。紅 2、黃 9、綠 9、延後 3。
- **沒做到／不確定：**
  - 消保法、個資法罰則條文未查；日本、韓國、英國等其他上架國家的揭露義務未查。
  - 「郵政信箱可否當事務所」「送審時官網隱私頁與 App 不一致會不會被退件」查無官方見解，屬推測。
  - revenuecat-webhook 未部署是引用專案記憶，本次未自行驗證部署狀態。
  - EUR-Lex、Apple DPLA Schedule 2、StoreKit 文件仍讀不到（延後項目，不影響首波）。
  - 整體信心：台灣文案約 8 成；七日起算與 Apple 拒退責任約 5–7 成；美國約 6 成。

**本報告為法遵風險盤點，非法律意見；紅／黃級項目建議諮詢執業律師確認。**
