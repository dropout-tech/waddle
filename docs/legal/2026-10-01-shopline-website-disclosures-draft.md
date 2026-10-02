# Huddle 官網開賣（SHOPLINE Payments 網站刷卡）揭露文案草稿（2026-10-01）

> **本文件為法遵風險盤點與文案草稿，非法律意見。** 紅／黃級項目建議諮詢執業律師；稅籍、行號與發票請會計師或國稅局確認。
> 草稿由 legal-advisor 產出，**尚未經老闆審閱，不可直接上線**。核可後請工程師綁在開賣開關後面，開賣當天才生效。
> 查核日：2026-10-01。行號依本機 repo 檔案核對，與派工單給的 origin/main 行號（legal-page.tsx:24、:27；refunds:10；marketing-page.tsx:28-76、:238）一致；本次沒有執行 `git show origin/main`（工具限制），放稿前請工程師以 origin/main 再對一次行號。
>
> **與既有草稿的關係**：`docs/legal/2026-10-01-pro-launch-copy-draft.md`（以下簡稱「IAP 稿」）寫的是「只在 iOS 透過 Apple 賣」。本稿加上「網站用 SHOPLINE Payments 刷卡」這條路，**以下 IAP 稿段落由本稿取代**：B1、T2、T4 第二段、T5、R1、R4、R6、S1–S4、P1、P3、P5（P5 的 Apple／RevenueCat 段落保留，見本稿 3-3）。IAP 稿其餘段落（R2 Apple 退款流程、R5、P2、P4 等）仍有效，與本稿不衝突。
> 價格與 Pro 內容依 `docs/billing/2026-10-01-pro-scope.md`（月繳 NT$150、年繳 NT$990），用量數字依老闆 2026-10-01 上線決策（免費 AI 5 次／Pro 20 次、積極版門檻 150／100／200 MB、Apple Watch 第一版不帶）。

> **2026-10-03 狀態更新（以此為準，覆蓋下文同項）**——本稿寫於 10-01，之後老闆已拍板，條款頁（`app/terms`、`app/refunds`、`app/support`）多數段落已依新決定上線在開賣開關後面：
> - **D2 已改為「有試用」**：網站首次購買享 **2 週**免費試用、需綁卡、到期自動扣第一期、每人限一次（跨 iOS／網站）。因此本稿所有「首次付款後 7 天」的退款寫法，要改成「**試用結束後第一次扣款（沒有試用資格者為首次付款）後 7 天**」；「今天扣款」要分試用／直購兩版（已在 7-1、7-2 修正）。條款頁現行寫法見 `app/refunds/page.tsx` 的 web-refund 段。
> - **D1 採乙**（首扣＋年繳續扣 7 天全額退），程式一致（`20261003020300_web_billing_transitions.sql:585`）。**D4 採建議值**（寬限 7 天、重試 3 次）。
> - **營運者資訊**：本名 廖思明／Liao Sih-Ming、客服 Email hi@lazy72.com（**不寫回覆時效**）、客服電話 0988-493-026、管轄 **臺灣新北地方法院**（`lib/legal/operator.ts`）。地址：老闆選「工作室可收信地址」，**尚未提供（不填不能開賣）**。截至 10-03 條款頁只顯示電話，本名與 Email 尚未上頁。
> - **0-5 稅務**：老闆已問過會計師，稅籍／行號先不辦、統編句不放。**0-6 黃 2**：老闆已向 SLP 窗口確認個人戶可收 SaaS、每月收款無上限。
> - **2-3 Pro 內容**：「不設數量上限」照寫（老闆決定）；**企鵝造型／音樂包不寫進 Pro 介紹**，推出當天再加——2-3、6-1 的相關句要刪。
> - **第 9 節**：`app/terms` 已無 NT$1,290、`lib/billing/plans.ts` 已是 990；表中行號已過時，以現行檔案為準。
> - 回覆時效佔位【待老闆填：回覆時效】一律刪句，不填。

---

## 0. 給老闆的一頁摘要

### 0-1 一句話

網站要開始刷卡收錢，官網必須讓客人在付款前看得到「你是誰、怎麼聯絡你、買到什麼、多少錢、多久扣一次、怎麼取消、怎麼退款」。這些現在全部缺，而且全站還寫著「尚未開放購買」，開賣當天會變成不實表示。本稿把要貼的字全部寫好了，你只需要**填資料＋做 7 個決定**。

### 0-2 已定案

- **營運名義：個人**（老闆 2026-10-01 拍板）。代價：你的**本名**會公開在官網（法律要求，無法隱藏）；地址、電話可以用「非住家」的方式處理（見 1-3）。
- 上架地區全世界扣掉歐盟（2026-10-01 決策）——這是 App Store 的設定；**網站本身擋不住歐盟的人來刷卡**，見 D5。

### 0-3 要你提供的資料

| 填空 | 要填什麼 | 會公開嗎 | 為什麼需要 |
|---|---|---|---|
| 【待老闆填：本名】 | 身分證上的中文姓名（英文版另填護照英文名） | 公開 | 消保法§18 I(1) 企業經營者名稱與代表人；個資法§8 I(1) |
| 【待老闆填：聯絡地址】 | 建議用商務中心／共享辦公室地址，不要放住家（見 1-3） | 公開 | 消保法§18 I(1)「事務所或營業所」 |
| 【待老闆填：客服電話】 | 建議辦一支專用門號 | 公開 | SHOPLINE 支付服務條款要求網站揭露「客服電話及 Email」 |
| 【待老闆填：客服時間】 | 例：週一至週五 10:00–18:00（國定假日除外） | 公開 | 電話接不到時，客人知道何時打 |
| 【待老闆填：客服 Email】 | 自有網域的專用信箱，例如 support@ 你的網域（要先實測收得到） | 公開 | 消保法§18 I(1)(5)、個資法§8 I(5) |
| 【待老闆填：回覆時效】 | 例：3 個工作天內 | 公開 | 寫了就是承諾（消保法§22），填做得到的 |
| 【待老闆填：英文姓名】 | 英文版頁面用 | 公開 | 同上 |
| 【待老闆填：管轄法院】 | 例：臺灣臺北地方法院（通常選你住的地方） | 公開 | 條款的管轄約定 |
| 【待老闆填：統一編號】 | **目前沒有就不要填、整句刪除**；辦稅籍登記後才補 | 公開 | 稅籍登記規則§4-1 |
| 【工程師填：信用卡帳單上的商家名稱】 | SHOPLINE 開通後在刷卡帳單顯示的名稱 | 公開 | 客人認得扣款，減少爭議款 |
| 【工程師填：可用卡別】 | SHOPLINE 實際開通的卡組織 | 公開 | 消保法§18 I(2) 付款方式 |

### 0-4 要你做的決定（附我的建議）

| # | 決定 | 選項 | 我的建議 |
|---|---|---|---|
| D1 | 網站購買的退款寬鬆度 | **甲（法定底線）**：只有「第一次付款後 7 天內」全額退。**乙（建議）**：甲＋「年繳續訂扣款後 7 天內」也全額退。**丙（最寬）**：每次扣款後 7 天內都全額退，年繳中途不想用了還按比例退。 | **乙**。理由：「續訂扣款是否又有 7 天」法律沒寫清楚（黃燈），年繳一次扣 990 最容易被忘記、最容易被客訴與刷卡爭議；月繳 150 金額小、風險低。丙最安全但最花錢。 |
| D2 | 網站要不要也有 14 天免費試用 | 有／沒有 | **第一版沒有**。試用目前只在 iOS（Apple 試用優惠）。網站綁卡試用要多做「試用到期前提醒、到期自動扣款」，出錯就是對真卡多扣錢。先不做最穩。 |
| D3 | 地址怎麼公開 | (a) 商務中心／共享辦公室地址 (b) 郵政信箱 (c) 住家 | **(a)**。(b) 是否算法條的「事務所或營業所」查無主管機關見解（黃燈）；(c) 隱私風險最大。 |
| D4 | 扣款失敗的寬限期 | 立刻降回免費／寬限幾天 | **寬限 7 天、期間重試扣款最多 3 次**，期間 Pro 照用，失敗就回免費、不追欠款、不刪資料。 |
| D5 | 網站要不要賣給台灣以外的人 | 不限／結帳只收台灣發卡 | **先不限，但全站寫明「以新台幣計價、依中華民國法律」**；外國消費者（尤其歐盟）可能仍受其本國法保護，正式對外國人行銷前請律師看（黃燈）。 |
| D6 | 管轄法院 | 你住的地方的地方法院 | 填你住的地方；條款會同時寫「不排除消保法§47 與小額訴訟規定」，這是法定不能排除的。 |
| D7 | 網站上的 `dropout-tech` 字樣 | 保留／改名 | 官網下載連結與使用協助頁連到 GitHub `dropout-tech/waddle`。營運者是你個人，`dropout` 字樣容易讓人（含 SHOPLINE 審核）誤認是某公司在賣。**建議送件前改成個人帳號或中性名稱**（黃燈）。 |

### 0-5 稅務紅旗（只給你看，不放官網）

> 以下是財政部官方頁面的說法＋我的白話整理。**開賣前請花一次會計師諮詢費**，這部分我信心約 7 成。

1. **每月銷售額還沒到 5 萬元**：個人在網路賣「勞務」，當月銷售額沒到營業稅起徵點（114 年起勞務 5 萬元）可以先不辦稅籍登記、不用開發票；但賺的錢要**併入你每年 5 月的綜合所得稅申報**（財政部稅務入口網「網路交易課徵營業稅 Q&A」與「境內網路交易案例說明」，114-02-05 更新）。這段期間網站不用放統編，給客人 Email 電子收據即可（⚠️ 收據格式沒有查到官方規定）。
2. **某一個月達到 5 萬元**：要「**立即**」向國稅局申請稅籍登記（財政部北區國稅局 2026-02-26 新聞稿）。登記時要填網站網域與會員帳號；登記後，網站與 App 要在明顯位置放「營業人名稱＋統一編號」（稅籍登記規則§4-1）。月銷售額 5 萬～20 萬之間，由國稅局「查定課徵」，**稅率 1%、每 3 個月寄繳款書**，不用開統一發票。
   - ⚠️ **年繳會讓某個月突然衝高**：一個月內 51 個人買年繳（51 × 990 = 50,490）就破 5 萬，即使平常月繳不多。銷售額怎麼算月份（扣款當月一次算，還是可以分攤），請會計師確認。
   - ⚠️ **可能要辦「行號」**：商業登記法§5 規定「每月銷售額未達營業稅起徵點」的小規模商業可以免辦商業登記；**反過來說，超過了可能就要到縣市政府辦獨資行號登記**。這會讓「個人名義」變成「你本人當負責人的行號」，官網的營運者名稱要改成行號名稱＋負責人。我信心約 7 成，請會計師確認。
3. **某一個月達到 20 萬元**：國稅局會核定你「使用統一發票」，**稅率 5%、自己申報**，並要開電子發票。SHOPLINE 不內建電子發票，要另外接加值中心（本稿不涵蓋串接）。屆時 150／990 是否「含 5% 營業稅」要先決定：含稅就是你實收少約 4.76%。
4. **業別分類沒有百分之百確定**：財政部「小規模營業人營業稅起徵點」（113-12-12 修正、114-01-01 施行）把業別分成 10 萬元類與 5 萬元類，表裡**沒有「資訊服務／軟體」**；財政部網路銷售說明一般以「勞務 5 萬」稱之。訂閱制軟體歸哪一類，請國稅局或會計師確認；在確認前，**保守以 5 萬元計算**。
5. **Apple 那邊的收入要不要合併算進 5 萬**：不確定。Apple 在台灣有代收代繳機制（IAP 稿 7-2 有來源），但對「個人未辦稅籍」時的門檻計算方式，我沒有查到官方說明，請會計師一併確認。
6. **SHOPLINE 個人戶**：款項撥到你本人存摺。收款紀錄就是你的銷售額依據，請每月自己記一次帳（網站＋Apple 分開記）。

### 0-6 紅黃綠燈（詳見各節）

- 🔴 紅（不改不能開賣）
  1. 營運者資訊（本名、地址、電話、Email）不在網站上——消保法§18 I(1) 明文要求，SHOPLINE 條款也要求，審核一定過不了。
  2. 網站沒有網站刷卡的價格、續訂、取消、七日解除、退款資訊——消保法§18 I(2)(3)(5)；沒提供的話，七日解除期會延後起算、最長變成四個月（消保法§19 III）。
  3. 全站寫「尚未開放購買」、年繳寫 NT$1,290——開賣後與事實不符（公平交易法§21、消保法§22）。清單見第 9 節。
  4. （平台規則，不是法律）iOS App 內出現官網購買連結或比價——Apple 審查準則 3.1.1(a) 退件。
  5. （平台規則）iOS App 解鎖「網站買的 Pro」時，App 內購必須同時可買——Apple 準則 3.1.3(b)。**網站不能比 App 內購早開賣後就讓 App 解鎖。**
- 🟡 黃（動手前建議問律師／會計師）
  1. 月銷售額過 5 萬後的稅籍、行號、統編揭露（0-5）。
  2. SHOPLINE 個人戶「每月信用卡收款上限 20 萬」只有第三方部落格說法（另有第三方說已無上限），官方條款沒寫；軟體訂閱的可接受度官方也沒寫。
  3. 地址用郵政信箱是否符合「事務所或營業所」。
  4. 續訂扣款是否重新起算七日；年繳超過七日不按比例退是否會被認定「顯失公平」。
  5. 沒有專門給「線上訂閱軟體」的定型化契約應記載事項（第 2-0 節）；最接近的「零售業等網路交易」是針對商品。
  6. 外國消費者（尤其歐盟）在網站購買的當地法規。
  7. `dropout-tech` 字樣造成營運主體混淆（D7）。
  8. 「Pro 無上限」寫法：目前任務超過 1,000 筆會從畫面消失（pro-scope.md 地雷欄），修好前寫「無上限」有不實風險。
- 🟢 綠（查核過，本稿寫法合規）
  1. 不主張七日解除權例外、明寫可全額退（消保法§19 I、V；通訊交易解除權合理例外情事適用準則§2）。
  2. 個資法§8 I 六款都有對應段落（3-2 對照表）。
  3. 管轄條款保留消保法§47 與民事訴訟法§436-9。
  4. 自然人可申請 SHOPLINE Payments（其支付服務條款第四條）。

---

## 1. 營運者資訊區塊

### 1-1 頁尾短版（全站共用）

放置位置：
- 法務頁共用外框 `components/legal/legal-page.tsx` 頁尾 `:30-33`（`<footer>` 內，兩個連結之後加一段 `<p>`）
- 官網 `components/marketing/marketing-page.tsx:238` 頁尾（`footerLine` 之下），文字放進 `:48`（zh）與 `:73`（en）的字典

繁中：
> Huddle 由【待老闆填：本名】個人經營｜客服信箱：【待老闆填：客服 Email】｜客服電話：【待老闆填：客服電話】（【待老闆填：客服時間】）｜聯絡地址：【待老闆填：聯絡地址】

English：
> Huddle is operated by 【待老闆填：英文姓名】, an individual based in Taiwan. Email: 【待老闆填：客服 Email】 · Phone: 【待老闆填：客服電話】 (【待老闆填：客服時間（英文）】, Taiwan time) · Address: 【待老闆填：聯絡地址（英文）】

（辦了稅籍登記之後，兩語各加一段：「統一編號：【待老闆填：統一編號】」／“Taiwan tax ID (Unified Business Number): 【待老闆填：統一編號】”。辦了行號之後，「【本名】個人經營」改為「【行號名稱】（負責人：【本名】）」。）

### 1-2 完整版（服務條款 `#operator` 與使用協助頁共用）

繁中：
> **標題：營運者資訊與聯絡方式**
>
> Huddle 由【待老闆填：本名】以個人身分經營，並負責提供本服務。
>
> - 營運者：【待老闆填：本名】（個人）
> - 聯絡地址：【待老闆填：聯絡地址】
> - 客服電話：【待老闆填：客服電話】（【待老闆填：客服時間】）
> - 客服信箱：【待老闆填：客服 Email】
>
> 訂閱、扣款、取消、退款、解除契約、消費申訴與個人資料請求，都可以寫信或來電，我們通常在【待老闆填：回覆時效】內回覆。寫信時請附上你的 Huddle 帳號 Email；**請不要提供完整卡號、密碼或驗證碼**。

English：
> **Title: Operator and contact information**
>
> Huddle is operated by 【待老闆填：英文姓名】 as an individual, who is responsible for providing the service.
>
> - Operator: 【待老闆填：英文姓名】 (individual)
> - Address: 【待老闆填：聯絡地址（英文）】
> - Phone: 【待老闆填：客服電話】 (【待老闆填：客服時間（英文）】, Taiwan time)
> - Email: 【待老闆填：客服 Email】
>
> Contact us by email or phone about subscriptions, charges, cancellation, refunds, withdrawal from a contract, complaints and personal data requests. We usually reply within 【待老闆填：回覆時效（英文）】. Please include the email address of your Huddle account, and never send your full card number, password or verification codes.

### 1-3 個人身分要公開什麼、怎麼保護隱私

| 項目 | 法律要求 | 金流要求 | 建議做法 | 依據 |
|---|---|---|---|---|
| 姓名 | **必須**：「企業經營者之名稱、代表人」 | KYC 會收（不公開） | 公開本名，**不要**放身分證字號、生日。App Store 個人開發者的賣家名稱本來就會顯示本名。 | 消保法§18 I(1)；SHOPLINE 條款第四條第 11 項（KYC）|
| 地址 | **必須**：「事務所或營業所」 | 條款的網站揭露清單沒列地址；第三方說審核會看 | **首選**：租商務中心／共享辦公室地址當這門生意的營業所（日後辦稅籍、行號可用同一地址，資料一致）。**次選**：郵政信箱。**不建議**：住家。 | 消保法§18 I(1)。⚠️ 不確定：郵政信箱是否算「事務所或營業所」，查無主管機關見解，選 (b) 前請問律師 |
| 電話 | 「電話**或**電子郵件」二擇一即可 | **必須**：網站揭露「客服電話及 Email」 | 辦一支**專用門號**（第二門號、預付卡或網路電話），標示客服時間，非服務時間轉語音信箱 | 消保法§18 I(1)；SHOPLINE 支付服務條款第五條之一第二款第 4 項 |
| Email | 同上 | **必須** | 用自有網域的專用客服信箱，不要用私人 Gmail | 同上 |
| 統一編號 | 辦稅籍登記後**必須**揭露名稱＋統編 | — | 現在沒有就整句刪掉，不要寫「無」或留空 | 稅籍登記規則§4-1 |

⚠️ 不確定：「只公開縣市、完整地址來信索取」的做法不符合§18「應提供」的文字，**不建議**。

### 1-4 送件與日後變更提醒

- SHOPLINE 送件時填的姓名、電話、Email、地址，要和網站上的**一字不差**（第三方說審核會比對，⚠️ 官方未明寫）。
- 辦稅籍或行號後，1-1、1-2、服務條款、隱私頁的營運者名稱要同步改，並同步告知 SHOPLINE 變更特約商店資料。

---

## 2. 服務條款（`app/terms/page.tsx` 與 `app/en/terms/page.tsx`，兩檔行號相同）

### 2-0 有沒有適用的「定型化契約應記載及不得記載事項」

**結論：查無專門針對「線上訂閱軟體／SaaS」的版本。**

- 最接近的是「零售業等網路交易定型化契約應記載及不得記載事項」（經濟部 105-07-15 經商字第 10502418810 號公告修正，105-10-01 生效）。它的適用範圍是「經濟部主管之零售業等，透過網路方式對消費者進行交易」，條文講的是商品（規格、運費、交付）。行政院公報 2025-01-16 刊登修正草案，把名稱改為「零售業之網路交易…」，附表把適用範圍限縮為零售**商品**的業者。Huddle 是線上服務，**我判斷不直接適用**（信心約 7 成）。
- 已看到的其他版本：網際網路教學服務（數位發展部）、線上遊戲點數、交友媒合服務等，都不是 Huddle 的業態。
- **但本稿仍比照「零售業等網路交易」的應記載／不得記載事項來寫**，因為它是主管機關對「網路交易」的最低期待，照做沒有壞處：營運者資訊（應記載一）、疑義有利消費者（應記載二）、確認機制（應記載五）、付款方式說明（應記載八）、解除權（應記載十）、個資（應記載十一）、帳號被冒用（應記載十二）、消費爭議處理（應記載十四）；不得記載：預先拋棄個資權利、單方變更契約、任意終止、放棄解除權、證據只認業者紀錄、排除消保法§47／民訴§436-9。
- 另：消保法§11-1 要求定型化契約訂立前給「三十日以內之合理期間」審閱。網站做法：條款與退款頁**在結帳前就能公開閱讀**，結帳頁放連結，不強迫當場勾選前沒時間看。
- 通訊交易解除權合理例外情事適用準則§3：若主管機關對某行業公告了應記載事項，就適用該事項的解除契約規定——目前查無 SaaS 版本，所以回到消保法§19 本身。

### 2-1 修改｜`:8`「Huddle 提供的服務」第一句

- 繁中：「網頁版與桌面版使用同一個帳號同步資料」→「網頁版、桌面版與 iOS App 使用同一個帳號同步資料」
- English：“The web and desktop apps sync through the same account.” → “The web, desktop and iOS apps sync through the same account.”

### 2-2 修改｜`:9`「帳號與使用安全」最後一句（使用資格）

現有：「若你尚未具備獨立締約的能力，請由法定代理人協助了解並使用服務。」
改成（繁中）：
> 你必須能依法自行訂立契約，才能購買 Huddle Pro。未成年人購買前，應取得法定代理人（例如父母）的同意。如果發現帳號遭他人冒用，請立即寫信到【待老闆填：客服 Email】，我們會暫停該帳號後續的付款與續訂，並協助你處理。

English：
> You must be legally able to enter into a contract to purchase Huddle Pro. If you are a minor, get permission from your parent or legal guardian before purchasing. If you believe someone else is using your account, email 【待老闆填：客服 Email】 right away. We will suspend further charges and renewals on that account and help you resolve the issue.

依據：民法§77（限制行為能力人應得法定代理人允許）；零售業等網路交易應記載事項十二（帳號被冒用）。

### 2-3 取代｜`:11` 整節「免費使用與未來訂閱」（取代 IAP 稿 T2）

繁中：
> **標題：免費功能與 Huddle Pro 訂閱**
>
> 任務、行事曆、專注計時、記事本、白板等個人核心功能目前免費，不需要訂閱。免費版有用量上限：進行中的任務 150 個、筆記 100 則、圖片總容量 200 MB、AI 會議整理每月 5 次。到達上限時只會暫停「新增」，既有內容仍可檢視、編輯、完成、刪除與匯出。原有的免費帳號不會自動變成付費訂閱；只有你在購買畫面主動確認後，訂閱才會成立。
>
> Huddle Pro 是選購的加值方案，目前包含：進行中任務與筆記不設數量上限、圖片總容量 20 GB、AI 會議整理每月 20 次、建立組織（每人最多 3 個，每個最多 200 人）、Google 日曆串接，以及日後推出的新企鵝造型與音樂包（推出後才提供；現有造型與音樂維持免費）。購買時包含的內容，以購買畫面顯示的為準。
>
> 你可以用兩種方式購買 Huddle Pro，兩者內容相同、權益綁定你的 Huddle 帳號，在網頁版、桌面版與 iOS App 都能使用：
>
> 1. **在 Huddle 網站購買**：以信用卡付款，由 SHOPLINE Payments（先科技有限公司）處理刷卡。價格為月繳新台幣 150 元、年繳新台幣 990 元，已含稅（如適用），沒有其他手續費。
> 2. **在 iOS App 內透過 Apple 購買**：由 Apple 向你 Apple 帳號的付款方式收款，價格與幣別以 App Store 畫面顯示為準，並適用 Apple 的條款。
>
> 取消、退款與解除契約的方式依購買管道不同，請見〈取消與退款〉（連結 `/refunds`）。

English：
> **Title: Free features and Huddle Pro subscriptions**
>
> Core personal features — tasks, calendar, focus timer, notebook and whiteboard — are currently free and do not require a subscription. The free plan has usage limits: 150 open tasks, 100 notes, 200 MB of image storage in total, and 5 AI meeting summaries per month. When you reach a limit, only adding new items is paused; you can still view, edit, complete, delete and export what you already have. A free account never turns into a paid subscription on its own — a subscription starts only after you actively confirm it on the purchase screen.
>
> Huddle Pro is an optional paid plan. It currently includes: no limit on the number of open tasks and notes, 20 GB of image storage, 20 AI meeting summaries per month, creating organizations (up to 3 per person, up to 200 members each), Google Calendar connection, and new penguin outfits and music packs released in the future (available once released; existing outfits and music stay free). What is included at the time of purchase is shown on the purchase screen.
>
> You can buy Huddle Pro in two ways. Both give you the same features, linked to your Huddle account and available on the web, desktop and iOS apps:
>
> 1. **On the Huddle website**, by credit card. Card payments are processed by SHOPLINE Payments (S Technology Co., Ltd.). The price is TWD 150 per month or TWD 990 per year, including any applicable tax, with no additional fees.
> 2. **In the iOS app, through Apple.** Apple charges the payment method on your Apple Account. The price and currency shown on the App Store apply, together with Apple’s terms.
>
> How to cancel, request a refund or withdraw from the contract depends on where you bought. See Cancellation and refunds (link `/en/refunds`).

⚠️ 給工程師：數字（150／100／200 MB／5／20／20 GB／3／200）須與程式設定逐一核對；「不設數量上限」要等「任務超過 1,000 筆會從畫面消失」的問題修好才能上線（pro-scope.md 地雷欄），否則改寫為具體數字。

### 2-4 新增｜放在 `:11` 之後：「網站購買：付款、自動續訂與價格調整」（建議 `id="web-billing"`）

繁中：
> **標題：網站購買的付款與自動續訂**
>
> **付款與開通**：在網站購買時，你會在確認付款當下以信用卡支付第一期費用，Pro 隨即開通。網站目前只接受信用卡（【工程師填：可用卡別】），不提供分期付款。我們不會取得或儲存你的完整卡號；為了自動續訂，SHOPLINE Payments 會依你的授權保存這張卡的付款資訊。
>
> **自動續訂**：訂閱會自動續訂，直到你取消為止。月繳方案每月扣款一次，年繳方案每年扣款一次，扣款日為你首次付款日每月（或每年）的同一天；當月沒有這一天時（例如 31 日），改在當月最後一天扣款。每次扣款成功後，我們會寄送電子收據到你的帳號 Email。年繳方案續訂前至少 7 天，我們會寄信提醒你續訂日期與金額。
>
> **取消續訂**：你可以隨時登入 Huddle，到「設定」→「訂閱」點「取消續訂」，線上即可完成，不需要來電或寫信；也可以寫信到【待老闆填：客服 Email】請我們代為取消。取消後不會再扣款，Pro 可以使用到已付費期間結束，之後帳號回到免費方案。退款規則見〈取消與退款〉。
>
> **扣款失敗**：續訂扣款失敗時，我們會寄信通知你，並在接下來 7 天內最多再嘗試扣款 3 次，這段期間 Pro 照常可用。你可以在「設定」→「訂閱」更換信用卡。7 天後仍無法扣款，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，你的資料也不會因此被刪除。
>
> **價格調整**：如果訂閱價格要調整，我們會在新價格生效前至少 30 天寄信通知你。新價格只從通知後的下一個計費週期開始適用，已付費的期間不會補收差額。你不同意新價格的話，可以在生效前取消續訂。
>
> **同時有 Apple 訂閱時**：網站訂閱與 Apple 訂閱是兩筆獨立的訂閱，不會互相取消。如果你已經在 iOS App 訂閱，請不要在網站重複購買；若不小心重複，請寫信給我們，我們會退還網站重複的那一筆。

English：
> **Title: Website purchases — payment and auto-renewal**
>
> **Payment and activation.** When you buy on the website, the first period is charged to your credit card when you confirm payment, and Pro is activated right away. The website currently accepts credit cards only (【工程師填：可用卡別】) and does not offer instalment plans. Huddle never receives or stores your full card number; with your authorization, SHOPLINE Payments keeps the card’s payment details so the subscription can renew.
>
> **Auto-renewal.** Your subscription renews automatically until you cancel. The monthly plan is charged once a month and the annual plan once a year, on the same day of the month (or year) as your first payment. If that day does not exist in a given month (for example, the 31st), you are charged on the last day of that month. After each successful charge, we email a receipt to your account address. For annual plans, we email you a reminder with the renewal date and amount at least 7 days before renewal.
>
> **Cancelling renewal.** You can cancel at any time online: sign in to Huddle, go to Settings → Subscription and select Cancel renewal. No phone call or email is needed, though you can also email 【待老闆填：客服 Email】 and we will cancel for you. After you cancel, you will not be charged again and Pro stays available until the end of the period you have paid for; your account then returns to the free plan. See Cancellation and refunds for refund rules.
>
> **Failed payments.** If a renewal charge fails, we will email you and retry up to 3 times over the next 7 days, during which Pro stays available. You can update your card under Settings → Subscription. If payment still fails after 7 days, the subscription ends and your account returns to the free plan. We will not pursue payment for that period, and your data is not deleted because of it.
>
> **Price changes.** If the subscription price changes, we will email you at least 30 days before the new price takes effect. The new price applies only from the first billing period after that notice; we never charge extra for a period you have already paid for. If you do not accept the new price, you can cancel renewal before it takes effect.
>
> **If you also subscribe through Apple.** A website subscription and an Apple subscription are separate and do not cancel each other. If you already subscribe in the iOS app, please do not buy again on the website. If you are charged twice by mistake, email us and we will refund the website charge.

依據：消保法§18 I(2)（內容、對價、付款期日及方式）；SHOPLINE 支付服務條款第五條第一款（定期購：依約定週期與價金扣款，支付資訊無法付款時訂單取消）、第五條之二（分期不接受遞延性服務）；零售業等網路交易不得記載三（不得單方變更契約）。7 天／3 次／30 天／7 天提醒是 D4 的建議值，老闆改了要同步改。

⚠️ 不確定：
- 「價格調整只要通知＋可取消」能否完全避開「單方變更契約」的不得記載事項，沒有主管機關見解；本稿已採「只適用下一期、不追溯」的保守寫法。請律師確認。
- 「每月同一天、沒有這天改月底」要工程師確認 SHOPLINE 定期購實際怎麼排程，文字要跟實作一致。
- 「刪除帳號會取消網站訂閱」「線上取消按鈕」「年繳提醒信」「扣款失敗重試」都要工程師做得到才能寫（消保法§22：寫了就是義務）。

### 2-5 修改｜`:12`「服務更新與內容保存」第二段第一句（服務終止）

現有：「如將調整付費條件或影響既有使用權益，應在實施前提供適當通知與處理方式。」
改成（繁中）：
> 如將調整付費條件或影響既有使用權益，我們會在實施前至少 30 天通知你。若我們決定停止提供 Huddle Pro 或整個服務，會在停止前至少 30 天通知，並按已付費但尚未使用的天數比例退款。除非你嚴重違反本條款（例如入侵系統、散布惡意程式），我們不會任意終止你的訂閱；即使因此終止，也會按未使用天數比例退款，但法律另有規定者除外。

English：
> If we change paid terms or anything that affects your existing rights, we will notify you at least 30 days in advance. If we decide to discontinue Huddle Pro or the service as a whole, we will give at least 30 days’ notice and refund, on a pro-rata basis, any days you have paid for but not used. We will not terminate your subscription arbitrarily. We may do so only if you seriously breach these terms (for example, by attacking our systems or distributing malware), and even then we will refund unused days on a pro-rata basis unless the law provides otherwise.

依據：零售業等網路交易不得記載四（不得記載企業經營者得任意終止或解除契約、不得預先免除終止時的賠償責任）。

### 2-6 修改｜`:13`「帳號刪除與問題處理」

第一段末句現有：「未來若有透過商店購買的訂閱，刪除帳號或移除程式不等同取消訂閱，需另依原購買平台操作。」
改成（繁中）：
> 在網站購買的訂閱，刪除帳號時會一併停止續訂，不會再扣款。透過 App Store 購買的訂閱，刪除帳號或移除程式**不會**取消訂閱，請先在 Apple 帳號的訂閱設定中取消。

English：
> Deleting your account stops renewal of a subscription bought on the website, so you will not be charged again. Deleting your account or uninstalling the app does **not** cancel a subscription bought through the App Store; cancel it first in the subscription settings of your Apple Account.

第二段現有：「技術問題的現有回報方式列於使用協助。本頁不代表 Huddle 已開放收費、取得商店上架核准或金流審核通過。」
改成（繁中）：
> 技術問題的回報方式，以及帳務、退款、消費申訴與個人資料請求的聯絡方式，列於〈使用協助〉（連結 `/support`）。發生消費爭議時，請先透過上述管道與我們聯絡；我們會在【待老闆填：回覆時效】內回覆並與你協商處理。若無法解決，你也可以依消費者保護法向直轄市或縣市政府消費者服務中心或消費者保護官提出申訴。

English：
> Ways to report technical issues, and how to contact us about billing, refunds, complaints and personal data requests, are listed on our help page (link `/en/support`). If a dispute arises, please contact us first; we will reply within 【待老闆填：回覆時效（英文）】 and work with you to resolve it. If it cannot be resolved, consumers in Taiwan may also file a complaint with a consumer service center or consumer protection officer of their city or county government under the Consumer Protection Act.

依據：消保法§18 I(5)（消費申訴之受理方式）；零售業等網路交易應記載十四。⚠️ 申訴管道的具體機關名稱本次沒有開消保法§43 原文核對，放稿前請律師確認寫法。

### 2-7 新增｜放在 2-6 之後：營運者資訊（`id="operator"`）

直接使用 **1-2 完整版**（繁中／English）。

### 2-8 新增｜放在最後：準據法與管轄（`id="law"`）

繁中：
> **標題：準據法與管轄法院**
>
> 本條款依中華民國法律解釋與適用。因本條款或 Huddle 服務發生爭議而需要訴訟時，雙方同意以【待老闆填：管轄法院】為第一審管轄法院；但這不影響你依消費者保護法第 47 條向消費關係發生地法院起訴的權利，也不排除民事訴訟法關於小額訴訟管轄的規定。本條款如有疑義，應作有利於消費者的解釋。本條款不排除法律賦予你、且不得以約定排除的權利。

English：
> **Title: Governing law and jurisdiction**
>
> These terms are governed by the laws of the Republic of China (Taiwan). If a dispute about these terms or the Huddle service needs to go to court, the 【待老闆填：管轄法院（英文，例：Taiwan Taipei District Court）】 will be the court of first instance. This does not affect your right under Article 47 of the Consumer Protection Act to sue in the court of the place where the consumer relationship arose, or the jurisdiction rules for small-claims proceedings under the Code of Civil Procedure. Any ambiguity in these terms will be interpreted in favor of the consumer. Nothing in these terms limits rights that you have under law and that cannot be excluded by agreement.

依據：消保法§47；民事訴訟法§436-9；零售業等網路交易應記載二（疑義有利消費者）、不得記載八（不得排除§47、§436-9）；消保法§11 II（定型化契約疑義有利消費者，本次未另開原文，出自應記載事項文字）。

### 2-9 修改｜`app/en/terms/page.tsx:5` metadata description（英文）

> How Huddle works, how to manage your account and content, and how Huddle Pro subscriptions are billed, renewed, cancelled and refunded on the website and through Apple.

---

## 3. 隱私權政策（`app/privacy/page.tsx` 與 `app/en/privacy/page.tsx`，兩檔行號相同）

### 3-1 修改｜`:7` 第一段開頭加一句（取代 IAP 稿 P1）

> 繁中：Huddle 由【待老闆填：本名】以個人身分經營，並由其蒐集與處理本頁所列的個人資料（聯絡方式見〈服務條款〉營運者資訊，連結 `/terms#operator`）。
> English：Huddle is operated by 【待老闆填：英文姓名】 as an individual, who collects and processes the personal data described in this notice (contact details are in the operator section of our terms, link `/en/terms#operator`).

### 3-2 個資法§8 I 對照（給審稿用，不上網）

| 第 8 條第 1 項 | 本稿對應 |
|---|---|
| (1) 機關名稱 | 3-1 營運者本名 |
| (2) 蒐集目的 | 3-3「為什麼需要」段 |
| (3) 資料類別 | 3-3「我們會處理哪些資料」段 |
| (4) 利用期間、地區、對象、方式 | 3-3「誰會處理、存在哪裡、保存多久」段 |
| (5) 當事人權利及方式 | `:13` 既有段落＋3-5 修改 |
| (6) 不提供的影響 | 3-3 最後一段 |

### 3-3 取代｜`:14` 整節「訂閱與政策更新」（取代 IAP 稿 P5）

繁中：
> **標題：訂閱與付款資料**
>
> **網站購買（信用卡）**
>
> 為了收款、開通與續訂 Huddle Pro、寄送收據、處理取消與退款、客服與對帳，以及依法保存帳務紀錄，我們會處理以下資料：你的帳號 Email 與帳號識別碼、購買的方案、金額、幣別、付款與續訂時間、訂單與交易編號、扣款結果、退款紀錄，以及 SHOPLINE Payments 回傳的卡片資訊（卡別、發卡國家與卡號末四碼）。【工程師依 SHOPLINE 實際回傳欄位核對後增刪】
>
> 刷卡由 SHOPLINE Payments（先科技有限公司）處理。你在付款畫面輸入的卡號、有效期限與持卡人姓名等資料，是直接提供給 SHOPLINE Payments，由其依它的隱私權政策蒐集、處理並保存（其政策載明資料儲存於新加坡及美國）；Huddle 不會取得、也不會儲存你的完整卡號。為了自動續訂，SHOPLINE Payments 會依你的授權保存付款資訊，Huddle 只保存它提供的代碼，用來在續訂日請款。
>
> **iOS App 內購買（Apple）**
>
> 【此處沿用 IAP 稿 P5 第一至三段原文：Apple 處理付款、RevenueCat（美國）處理訂閱狀態、Huddle 只保存權益結果。】
>
> **誰會處理、存在哪裡、保存多久**
>
> 上述資料只用於提供與管理你的訂閱、客服、對帳、防範盜刷與爭議款，以及履行法令義務，不會用於廣告，也不會出售。處理對象限於：Huddle 營運者、SHOPLINE Payments（刷卡）、Apple 與 RevenueCat（iOS 購買）、我們的雲端服務供應商（Supabase、Zeabur），以及依法有權要求的機關（例如稅捐機關）。這些資料可能在台灣以外的地區處理，包括新加坡與美國。
>
> 訂閱權益紀錄在帳號存續期間保存。交易、收據與退款紀錄是帳務憑證，即使你刪除帳號，也會依稅務與會計法令保存，期間最長為交易完成後 5 年【⚠️ 請會計師確認年限】，期滿後刪除。
>
> **如果你不提供**
>
> 你可以不購買 Pro，繼續使用免費版。要購買 Pro，就必須提供付款資料；不提供的話，我們無法完成收款與開通。
>
> 註冊帳號不會自動產生訂閱。若資料處理方式調整，這個頁面會更新日期與內容；需要另外取得同意的情形，會在相關操作中處理。

English：
> **Title: Subscriptions and payment data**
>
> **Website purchases (credit card)**
>
> To take payment, activate and renew Huddle Pro, send receipts, handle cancellations and refunds, provide support and reconciliation, and keep billing records as required by law, we process: your account email and account ID; the plan you bought; the amount, currency, and payment and renewal dates; order and transaction IDs; the result of each charge; refund records; and card information returned by SHOPLINE Payments (card brand, issuing country and the last four digits of the card number). 【工程師依 SHOPLINE 實際回傳欄位核對後增刪】
>
> Card payments are processed by SHOPLINE Payments (S Technology Co., Ltd.). The card number, expiry date, cardholder name and other details you enter on the payment screen go directly to SHOPLINE Payments, which collects, processes and stores them under its own privacy policy (which states that data is stored in Singapore and the United States). Huddle never receives or stores your full card number. With your authorization, SHOPLINE Payments keeps your payment details for renewals, and Huddle keeps only the token it provides so we can charge on your renewal date.
>
> **Purchases in the iOS app (Apple)**
>
> 【Use paragraphs 1–3 of P5 in the IAP draft as written: Apple processes payment, RevenueCat (United States) manages subscription status, Huddle keeps only the entitlement result.】
>
> **Who processes it, where, and for how long**
>
> This data is used only to provide and manage your subscription, provide support, reconcile payments, prevent fraud and chargebacks, and meet legal obligations. It is not used for advertising and is not sold. It is shared only with: the operator of Huddle; SHOPLINE Payments (card payments); Apple and RevenueCat (iOS purchases); our cloud providers (Supabase and Zeabur); and authorities entitled to it by law, such as tax authorities. It may be processed outside Taiwan, including in Singapore and the United States.
>
> Entitlement records are kept while your account exists. Transaction, receipt and refund records are accounting records, so they are kept as tax and accounting laws require even if you delete your account — for up to 5 years after the transaction 【⚠️ 請會計師確認年限】 — and then deleted.
>
> **If you choose not to provide it**
>
> You can keep using the free plan without buying Pro. To buy Pro, you need to provide payment details; without them, we cannot take payment or activate Pro.
>
> Creating an account does not create a subscription. If our data practices change, the content and date of this notice will be updated. Where separate consent is required, it will be addressed in the relevant interaction.

依據：個資法§8 I(1)–(6)；SHOPLINE Payments 隱私權政策（2025-08-15 更新：營運公司先科技有限公司、持卡人資料由其直接蒐集、儲存於新加坡及美國）；SHOPLINE 支付服務條款第五條第一款（定期購需儲存支付資訊）；個資法§21（國際傳輸主管機關「得限制」，非一律禁止）。

⚠️ 不確定：
- SHOPLINE Payments 對持卡人資料是「自行蒐集」（其隱私政策的寫法），對 Huddle 傳過去的訂單資料是否另屬「受託處理」，條款沒寫清楚；本稿以「各自依其政策」處理。
- 交易紀錄保存年限：SHOPLINE 條款第五條之四第三款要求店家保存交易紀錄 5 年以上，但該條在「零卡分期」章節，是否適用一般刷卡未確認；稅法上的保存年限本次未查。

### 3-4 修改｜`:8`「服務供應商與裝置儲存」第一段末加一句

> 繁中：在網站購買 Huddle Pro 時，刷卡由 SHOPLINE Payments 處理，詳見下方〈訂閱與付款資料〉。
> English：When you buy Huddle Pro on the website, card payments are processed by SHOPLINE Payments; see “Subscriptions and payment data” below.

### 3-5 修改｜`:12` 第二段末句、`:13` 一句

`:12` 末句現有「請勿將刪除帳號等同於取消未來可能透過商店購買的訂閱。」改成：
> 繁中：刪除帳號時，網站購買的訂閱會一併停止續訂；透過 App Store 購買的訂閱不會因此取消，請先在 Apple 帳號中取消。交易與帳務紀錄依法須保存者，不在立即刪除的範圍內（見〈訂閱與付款資料〉）。
> English：Deleting your account stops renewal of a subscription bought on the website. A subscription bought through the App Store is not cancelled by deleting your account, so cancel it in your Apple Account first. Transaction and billing records that the law requires us to keep are not covered by immediate deletion (see “Subscriptions and payment data”).

`:13`「其他請求目前尚無在本頁可使用的專用私人申請管道。」改成：
> 繁中：其他請求請寫信到【待老闆填：客服 Email】，我們會先確認你是帳號本人，並在【待老闆填：回覆時效】內回覆。
> English：For other requests, email 【待老闆填：客服 Email】. We will confirm that you own the account and reply within 【待老闆填：回覆時效（英文）】.

依據：個資法§3（五項權利不得預先拋棄或限制）、§8 I(5)。

---

## 4. 取消與退款政策（`app/refunds/page.tsx` 與 `app/en/refunds/page.tsx`，兩檔行號相同）

建議整頁順序：先分辨購買管道 → 網站購買 → Apple 購買 → 你的權利 → 刪除帳號。

### 4-1 修改｜`:6` 頁首 intro

> 繁中：取消續訂、申請退款與刪除帳號是不同的操作，而且做法依你是在 Huddle 網站還是 iOS App（Apple）購買而不同。
> English：Cancelling renewal, requesting a refund and deleting your account are different actions, and how you do each depends on whether you bought on the Huddle website or in the iOS app through Apple.

### 4-2 取代｜`:7` 整節（取代 IAP 稿 R1）

繁中：
> **標題：先確認你在哪裡購買**
>
> - **刷信用卡、帳單上的商家名稱是「【工程師填：信用卡帳單上的商家名稱】」**：你是在 Huddle 網站購買，請看下方「網站購買」各段。
> - **收據來自 Apple、在 Apple 帳號的訂閱清單看得到 Huddle**：你是在 iOS App 內購買，請看「透過 Apple 購買」。
>
> 登入 Huddle 後，「設定」→「訂閱」也會顯示你的訂閱來源。若看到不認得的扣款，請寫信到【待老闆填：客服 Email】；不要在公開問題回報頁貼出收據、卡號或個人資料。

English：
> **Title: First, check where you bought**
>
> - **You paid by credit card and the merchant name on your statement is “【工程師填：信用卡帳單上的商家名稱】”**: you bought on the Huddle website. See the “Website purchases” sections below.
> - **Your receipt is from Apple and Huddle appears in your Apple Account subscriptions**: you bought in the iOS app. See “Purchases through Apple”.
>
> After signing in to Huddle, Settings → Subscription also shows where your subscription came from. If you see a charge you do not recognize, email 【待老闆填：客服 Email】. Do not post receipts, card numbers or personal information on a public issue page.

### 4-3 新增｜放在 4-2 之後：「網站購買：取消續訂」

繁中：
> **標題：網站購買：取消續訂**
>
> 登入 Huddle →「設定」→「訂閱」→「取消續訂」，線上即可完成，隨時都可以取消，不需要說明理由。也可以寫信到【待老闆填：客服 Email】請我們代為取消。
>
> 取消後不會再扣款，Pro 可以使用到已付費期間結束，之後帳號回到免費方案。若要避免下一期扣款，請在續訂日前一天結束前取消。取消續訂本身不等於申請退款；想退款請看下一段。

English：
> **Title: Website purchases — cancelling renewal**
>
> Sign in to Huddle, go to Settings → Subscription and select Cancel renewal. You can cancel online at any time, without giving a reason. You can also email 【待老闆填：客服 Email】 and we will cancel for you.
>
> After you cancel, you will not be charged again. Pro stays available until the end of the period you have paid for, and your account then returns to the free plan. To avoid the next charge, cancel before the end of the day before your renewal date. Cancelling renewal is not the same as requesting a refund — see the next section.

⚠️ 給工程師：「續訂日前一天結束前」要對應實際請款時點（台灣時間幾點跑排程）。

### 4-4 新增｜放在 4-3 之後：「網站購買：七日內解除契約與退款」（依 D1 方案乙）

繁中：
> **標題：網站購買：七日內全額退款**
>
> 你在網站**第一次購買** Huddle Pro（月繳或年繳）後 7 天內，可以不說明理由解除訂閱契約，我們會**全額退款**，不收任何手續費。**年繳方案續訂扣款**後 7 天內，同樣可以申請全額退款。
>
> 申請方式：在「設定」→「訂閱」點「申請退款」，或寫信到【待老闆填：客服 Email】，附上你的 Huddle 帳號 Email。7 天從付款當天的隔天開始算，在第 7 天結束前送出申請即可。
>
> 退款會退回原信用卡。我們會在收到申請的隔天起 15 天內完成退款作業；款項何時出現在你的信用卡帳單上，依發卡銀行的作業時間而定。退款完成後，該期的 Pro 會停止，帳號回到免費方案，資料不會刪除。
>
> **超過 7 天**：月繳與年繳的已付費期間不按比例退款，但你可以隨時取消續訂，Pro 會用到期末。
>
> **以下情形不受 7 天限制，我們一定退款**：重複扣款、我們扣錯金額、你已取消卻仍被扣款、你的帳號遭他人冒用而被扣款，以及我們停止提供 Pro 或整個服務（按未使用天數比例退款）。

English：
> **Title: Website purchases — full refund within 7 days**
>
> Within 7 days after you **first buy** Huddle Pro on the website (monthly or annual), you can withdraw from the subscription without giving a reason, and we will give you a **full refund** with no fees. The same full refund applies within 7 days after an **annual plan renewal** charge.
>
> To request it, select Request a refund under Settings → Subscription, or email 【待老闆填：客服 Email】 with the email address of your Huddle account. The 7 days start the day after the payment, and your request only needs to be sent before the end of the 7th day.
>
> Refunds go back to the original card. We will process the refund within 15 days starting the day after we receive your request; when it appears on your statement depends on your card issuer. Once refunded, Pro for that period stops and your account returns to the free plan. Your data is not deleted.
>
> **After 7 days**, we do not give pro-rata refunds for monthly or annual periods already paid for, but you can cancel renewal at any time and keep Pro until the end of the period.
>
> **We always refund, regardless of the 7-day window**, if you were charged twice, charged the wrong amount, charged after cancelling, or charged because someone else used your account without permission — and if we discontinue Huddle Pro or the service (pro-rata for unused days).

D1 若選**甲**：刪除「**年繳方案續訂扣款**後 7 天內，同樣可以申請全額退款。」一句（英文同步刪 “The same full refund applies within 7 days after an annual plan renewal charge.”）。
D1 若選**丙**：第一段改為「**每次扣款**（含首次與每次續訂）後 7 天內…」，「超過 7 天」段改為：
> 繁中：超過 7 天：月繳不退當期；年繳可以隨時申請提前終止，退款金額＝990 元減去「已使用月數 × 150 元」（不足一個月以一個月計，最低為 0 元）。
> English：After 7 days: monthly periods are not refunded. For annual plans, you can end early at any time and receive TWD 990 minus TWD 150 for each month used (a partial month counts as a full month), but not less than zero.

依據：消保法§19 I（接受服務後七日內得解除，無須說明理由及負擔任何費用或對價）、§19-2 II（收到解除通知次日起 15 日內返還對價）、§19 V（違反之約定無效）、施行細則§18（亦得以書面通知解除）；通訊交易解除權合理例外情事適用準則§2(5)（數位內容或「一經提供即為完成之線上服務」＋事先同意＋告知才可排除）；行政院 109-06-19 院臺消保字第 1090092557 號函（判準：即時提供後即已履行完畢、性質上不易返還）。

**為什麼不在結帳頁放「同意立即開通並放棄七日解除權」**：持續按月按年提供的訂閱服務，不像函釋舉例的電子書、線上掃毒那樣「一提供就履行完畢」，我判斷不適用準則§2(5)（信心約 7 成）。勉強放了，依§19 V 也可能無效，反而在審核與客訴時被當成「不給退」的證據。

⚠️ 不確定：
- 「首次付款後 7 天」與法條「接受服務後七日」：網站沒有試用、付款當下就開通，兩者一致。若日後網站加試用（D2），起算點要重寫。
- 「月繳續訂扣款後是否又有七日解除權」查無主管機關見解；方案乙對月繳續訂不給七日，有被主張的風險（低金額）。
- 年繳超過 7 天不按比例退，是否會被認定為消保法§12「顯失公平」，查無見解。

### 4-5 新增｜放在 4-4 之後：「網站購買：扣款失敗」

繁中：
> **標題：網站購買：續訂扣款失敗**
>
> 續訂扣款失敗時（例如卡片過期、額度不足），我們會寄信通知你，並在 7 天內最多再嘗試扣款 3 次，這段期間 Pro 照常可用。你可以到「設定」→「訂閱」更換信用卡。7 天後仍無法扣款，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，資料也不會被刪除。之後想再使用 Pro，重新購買即可。

English：
> **Title: Website purchases — failed renewal payments**
>
> If a renewal charge fails (for example, because the card has expired or reached its limit), we will email you and retry up to 3 times over the next 7 days, during which Pro stays available. You can update your card under Settings → Subscription. If payment still fails after 7 days, the subscription ends and your account returns to the free plan. We will not pursue payment for that period, and your data is not deleted. You can buy Pro again at any time.

### 4-6 取代｜`:8`「日後透過 Apple 購買時」

沿用 **IAP 稿 R2** 全文（標題改為「透過 Apple 購買：取消續訂與申請退款」／“Purchases through Apple — cancelling renewal and requesting a refund”），並在段末加一句：
> 繁中：Apple 的訂閱無法在 Huddle 網站取消或退款。
> English：Apple subscriptions cannot be cancelled or refunded on the Huddle website.

### 4-7 保留｜`:9` Google Play 段

不動（仍未在 Google Play 販售）。

### 4-8 取代｜`:10`「解除契約與你的權利」

繁中：
> **標題：解除契約與你的權利**
>
> 依消費者保護法，透過網路購買服務的消費者，原則上可以在接受服務後七日內解除契約，不需要說明理由，也不需要負擔費用。Huddle 沒有以「數位服務」為由排除這項權利，也沒有「所有付款均不退款」的條款。
>
> - **網站購買**：依上方「網站購買：七日內全額退款」辦理。
> - **透過 Apple 購買**：款項由 Apple 收取。請寫信到【待老闆填：客服 Email】，附上 Huddle 帳號 Email 與 Apple 收據上的訂單編號，並同時依上方流程向 Apple 申請退款，我們會協助你。【IAP 稿 R4 的裁決點 1-B-1：若 Apple 未核准而你依法有權解除，我們會依法處理退款——是否保留此句，依老闆在 IAP 稿的裁決】
>
> 本頁不限制你依法享有、且不得以約定排除的消費者權利。相關規範可查閱消費者保護法第 18、19 與 19-2 條（連結 https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001）。

English：
> **Title: Withdrawal and your rights**
>
> Under Taiwan’s Consumer Protection Act, consumers who buy a service online can generally withdraw from the contract within seven days after receiving the service, without giving a reason and at no cost. Huddle does not exclude this right on the ground that the service is digital, and has no “all payments are non-refundable” term.
>
> - **Website purchases**: see “Website purchases — full refund within 7 days” above.
> - **Purchases through Apple**: Apple collects the payment. Email 【待老闆填：客服 Email】 with the email address of your Huddle account and the order ID on your Apple receipt, and also request a refund from Apple as described above; we will help you. 【Keep or drop the IAP draft R4 sentence on handling the refund ourselves if Apple declines, per the owner’s decision 1-B-1 in that draft.】
>
> Nothing on this page limits consumer rights you have under the law and that cannot be excluded by agreement. See Articles 18, 19 and 19-2 of Taiwan’s Consumer Protection Act (Chinese) (link https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001).

### 4-9 取代｜`:11`「刪除帳號不等於取消續訂」

繁中：
> **標題：刪除帳號與訂閱**
>
> - **網站購買**：刪除帳號時會一併停止續訂，不會再扣款。已付費期間不因刪除帳號而退款；若仍在 7 天全額退款期間內，請**先申請退款再刪除帳號**，刪除後我們無法確認你的身分。
> - **透過 Apple 購買**：刪除帳號或移除 App **不會**取消訂閱，請先在 Apple 帳號取消續訂，再刪除 Huddle 帳號。
>
> 使用上的問題請參閱〈使用協助〉（連結 `/support`）。

English：
> **Title: Deleting your account and subscriptions**
>
> - **Website purchases**: deleting your account stops renewal, so you will not be charged again. Deleting your account does not by itself refund a paid period; if you are still within the 7-day full-refund window, **request the refund before deleting your account**, as we cannot verify your identity afterwards.
> - **Purchases through Apple**: deleting your account or uninstalling the app does **not** cancel the subscription. Cancel renewal in your Apple Account first, then delete your Huddle account.
>
> For product questions, see our help page (link `/en/support`).

### 4-10 修改｜`app/en/refunds/page.tsx:4` metadata description

> How Huddle Pro is billed on the website and through Apple, how to cancel renewal, and how to request a refund.

---

## 5. 客服與聯絡頁（`app/support/page.tsx` 與 `app/en/support/page.tsx`，兩檔行號相同）

### 5-1 修改｜`:9` 第二段末句

現有：「目前尚未提供可在此頁使用的私人帳務與個資申請管道。」
> 繁中：帳務、退款、解除契約、消費申訴與個人資料請求，請改寫信到【待老闆填：客服 Email】或來電【待老闆填：客服電話】（【待老闆填：客服時間】）。
> English：For billing, refunds, withdrawal from a contract, complaints and personal data requests, email 【待老闆填：客服 Email】 or call 【待老闆填：客服電話】 (【待老闆填：客服時間（英文）】, Taiwan time) instead.

（D7：同段的 GitHub 連結 `dropout-tech/waddle` 建議送件前改名。）

### 5-2 修改｜`:10` 第二段末句

現有：「目前這個頁面提供操作說明，並不是獨立的免登入刪除申請表單。」
> 繁中：無法登入、但需要刪除帳號、取消網站訂閱或提出個人資料請求時，請寫信到【待老闆填：客服 Email】，我們會先確認你是帳號本人再處理。
> English：If you cannot sign in but need to delete your account, cancel a website subscription or make a personal data request, email 【待老闆填：客服 Email】. We will confirm that you own the account before acting on the request.

### 5-3 取代｜`:11` 整節「訂閱問題」

繁中：
> **標題：訂閱與帳務問題**
>
> Huddle Pro 可以在 Huddle 網站以信用卡購買，也可以在 iOS App 內透過 Apple 購買。價格、自動續訂、取消、七日內退款與扣款失敗的說明，整理於〈取消與退款〉（連結 `/refunds`）。註冊或登入不需要提供信用卡資料。
>
> - 網站購買的訂閱：登入後到「設定」→「訂閱」管理、取消或更換信用卡。
> - Apple 購買的訂閱：在 iPhone 或 iPad 的「設定」→ 你的名字 →「訂閱」管理。
>
> 購買後 Pro 沒有生效時，請確認登入的是購買時使用的 Huddle 帳號；在 iOS App 購買的，請在訂閱畫面點「恢復購買」。仍然沒有生效，請寫信到【待老闆填：客服 Email】，附上訂單編號或收據；請不要附完整卡號。

English：
> **Title: Subscription and billing questions**
>
> You can buy Huddle Pro by credit card on the Huddle website, or in the iOS app through Apple. Pricing, auto-renewal, cancellation, the 7-day refund and failed payments are explained on the cancellation and refunds page (link `/en/refunds`). You do not need a credit card to create an account or sign in.
>
> - Website subscriptions: sign in and go to Settings → Subscription to manage, cancel or change your card.
> - Apple subscriptions: on your iPhone or iPad, go to Settings → your name → Subscriptions.
>
> If Pro is not active after a purchase, check that you are signed in to the Huddle account you used to buy. If you bought in the iOS app, tap “Restore purchases” on the subscription screen. If it is still not active, email 【待老闆填：客服 Email】 with your order ID or receipt. Do not send your full card number.

### 5-4 新增｜放在 5-3 之後：聯絡我們

直接使用 **1-2 完整版**（標題改為「聯絡我們」／“Contact us”）。

---

## 6. 價格／方案說明（官網 `components/marketing/marketing-page.tsx`）

文字字典在 `:28-76`；方案卡片在 `:221`。

### 6-1 字典替換

| key | 行 | 繁中（新） | English（新） |
|---|---|---|---|
| `priceIntro` | :36／:61 | 核心功能免費使用。需要更多 AI 整理、建立組織或串接 Google 日曆時，再升級 Pro。 | Core features are free. Upgrade to Pro when you need more AI summaries, your own organizations or Google Calendar. |
| `freeBody` | :37／:62 | 任務、行程、專注計時、記事本與白板，跨裝置同步。免費版上限：進行中任務 150 個、筆記 100 則、圖片 200 MB、AI 會議整理每月 5 次。 | Tasks, calendars, focus timers, notebooks and the whiteboard, synced across devices. Free plan limits: 150 open tasks, 100 notes, 200 MB of images and 5 AI meeting summaries a month. |
| `soon` | :38／:63 | （刪除徽章，改為按鈕文字）升級 Pro | Upgrade to Pro |
| `year` | :38／:63 | 或 NT$990／年（比月繳一年省 NT$810） | or NT$990 / year (save NT$810 compared with paying monthly) |
| `proBody` | :38／:63 | 任務與筆記不設數量上限、圖片 20 GB、AI 會議整理每月 20 次、建立組織、Google 日曆串接，以及日後推出的新企鵝造型與音樂包。 | No limit on tasks and notes, 20 GB of images, 20 AI meeting summaries a month, your own organizations, Google Calendar, and new penguin outfits and music packs as they are released. |
| （新增）`priceNote` | 放在方案卡下方 | 價格以新台幣計，已含稅（如適用），沒有其他費用。網站以信用卡付款，每月或每年自動續訂，可隨時在帳號設定線上取消；首次付款後 7 天內可申請全額退款。網站購買的 Pro 在網頁版、桌面版與 iPhone App 都能使用。詳見〈服務條款〉與〈取消與退款〉。 | Prices are in New Taiwan dollars and include any applicable tax, with no additional fees. Website purchases are paid by credit card and renew monthly or yearly until you cancel online in your account settings. You can get a full refund within 7 days of your first payment. Pro bought on the website works on the web, desktop and iPhone apps. See our Terms of use and Cancellation & refunds. |

`:221` 的 Pro 卡片：把 `<span>{t.soon}</span>` 徽章拿掉，在 `proBody` 下方加一個連到網站結帳頁的按鈕（文字用 `soon` 新值）。

依據：消保法§18 I(2)、§22；公平交易法§21（價格與內容不得虛偽不實或引人錯誤）；SHOPLINE 支付服務條款第五條之一第二款第 4 項（價格含營業稅及幣別、內容、猶豫期間）。
- 「省 NT$810」＝150 × 12 − 990，用金額不用百分比，避免四捨五入爭議。
- ⚠️「不設數量上限」見 2-3 的工程師提醒（1,000 筆問題修好前不可上線）。
- ⚠️「已含稅（如適用）」：個人未辦稅籍時沒有營業稅；查定課徵 1% 或使用統一發票 5% 時，價格不變就代表你吸收稅金（見 0-5）。

### 6-2 FAQ 替換與新增（`:41-47`／`:66-72`）

替換 `:42`／`:67`：
> 繁中 Q：可以免費使用嗎？ A：可以。核心功能免費，註冊帳號不會自動收費。免費版有用量上限，需要更多時再升級 Pro。
> English Q: Can I use Huddle for free? A: Yes. Core features are free, and creating an account never starts a paid subscription. The free plan has usage limits; upgrade to Pro if you need more.

新增三題（放在 `:42`／`:67` 之後）：
> 繁中 Q：Pro 怎麼取消？ A：在網站購買的，登入後到「設定」→「訂閱」線上取消，Pro 會用到期末；在 iPhone App 內購買的，到 iPhone「設定」→ 你的名字 →「訂閱」取消。
> English Q: How do I cancel Pro? A: If you bought on the website, sign in and cancel online under Settings → Subscription; Pro stays active until the end of the period. If you bought in the iPhone app, cancel in iPhone Settings → your name → Subscriptions.
>
> 繁中 Q：可以退款嗎？ A：網站購買的 Pro，首次付款後 7 天內可申請全額退款，年繳續訂扣款後 7 天內也可以。詳見〈取消與退款〉。在 iPhone App 內購買的，退款由 Apple 審核。
> English Q: Can I get a refund? A: For Pro bought on the website, you can get a full refund within 7 days of your first payment, and within 7 days of an annual renewal. See Cancellation & refunds. Refunds for purchases in the iPhone app are reviewed by Apple.
>
> 繁中 Q：在網站買的 Pro，iPhone 上能用嗎？ A：可以。Pro 綁定你的 Huddle 帳號，用同一個帳號登入網頁版、桌面版或 iPhone App 都能使用。
> English Q: Does Pro bought on the website work on my iPhone? A: Yes. Pro is linked to your Huddle account, so it works wherever you sign in with that account — on the web, desktop or iPhone app.

（D1 選甲時，「年繳續訂扣款後 7 天內也可以」一句刪除。）

---

## 7. 結帳頁必備揭露與勾選同意句

### 7-1 付款按鈕上方必須顯示（不能藏在連結或摺疊裡）

繁中：
> **你要購買：Huddle Pro 月繳方案**（年繳則顯示「年繳方案」）
> - 今天扣款：NT$150（年繳：NT$990），新台幣，已含稅（如適用），沒有其他費用【有試用資格時改為：今天不扣款，免費試用 2 週到【系統帶入：YYYY 年 M 月 D 日】，當天自動扣款 NT$150（NT$990）；試用期內取消就不扣款】
> - 自動續訂：之後每月（每年）的【系統帶入：日】日自動扣款 NT$150（NT$990），直到你取消。下次扣款日：【系統帶入：YYYY 年 M 月 D 日】
> - 取消：隨時登入 Huddle，到「設定」→「訂閱」線上取消，Pro 用到期末
> - 退款：試用結束後第一次扣款（沒有試用者為今天的付款）後 7 天內，以及年繳續訂扣款後 7 天內，可申請全額退款（〈取消與退款〉連結）
> - 付款方式：信用卡（【工程師填：可用卡別】），刷卡由 SHOPLINE Payments 處理；Huddle 不會取得完整卡號
> - 收據：寄到你的帳號 Email【系統帶入：Email】
> - 營運者：【待老闆填：本名】（個人）｜客服：【待老闆填：客服 Email】／【待老闆填：客服電話】
> - 若你已在 iPhone App 內透過 Apple 訂閱，請不要重複購買

English：
> **You are buying: Huddle Pro, monthly plan** (or “annual plan”)
> - Charged today: TWD 150 (annual: TWD 990), including any applicable tax, with no additional fees [if eligible for the trial: nothing is charged today; your 2-week free trial ends on 【系統帶入：Month D, YYYY】 and TWD 150 (TWD 990) is charged that day; cancel during the trial and you pay nothing]
> - Auto-renewal: TWD 150 (TWD 990) is charged automatically on day 【系統帶入：D】 of each month (each year) until you cancel. Next charge: 【系統帶入：Month D, YYYY】
> - Cancel: anytime online — sign in, go to Settings → Subscription. Pro stays active until the end of the period
> - Refunds: full refund within 7 days of your first charge after the trial (or of today’s payment if you have no trial), and within 7 days of an annual renewal charge (link to Cancellation & refunds)
> - Payment: credit card (【工程師填：可用卡別】), processed by SHOPLINE Payments. Huddle never receives your full card number
> - Receipt: sent to your account email 【系統帶入：Email】
> - Operator: 【待老闆填：英文姓名】 (individual) · Support: 【待老闆填：客服 Email】 / 【待老闆填：客服電話】
> - If you already subscribe in the iPhone app through Apple, please do not buy again here

### 7-2 勾選同意（兩個都必勾、**預設不打勾**，沒勾付款鈕不能按）

勾選一：
> 繁中：我已閱讀並同意〈服務條款〉、〈取消與退款〉，並已閱讀〈隱私權政策〉。
> English：I have read and agree to the Terms of use and the Cancellation & refunds policy, and I have read the Privacy notice.

勾選二（自動扣款授權）：
> 繁中：我同意 Huddle 以這張信用卡每月（每年）自動扣款 NT$150（NT$990），直到我取消續訂為止。我了解可以隨時在帳號設定線上取消，且試用結束後第一次扣款（沒有試用者為首次付款）與年繳續訂扣款後 7 天內可申請全額退款。
> English：I authorize Huddle to charge this credit card TWD 150 every month (TWD 990 every year) until I cancel renewal. I understand that I can cancel online at any time in my account settings, and that I can get a full refund within 7 days of my first charge after the trial (or of my first payment if I have no trial) and of each annual renewal charge.

付款按鈕文字：
> 繁中：同意並付款 NT$150（年繳：同意並付款 NT$990）
> English：Agree and pay TWD 150 (annual: Agree and pay TWD 990)

依據：消保法§18 I(2)(3)、§11-1（條款事先可閱）；零售業等網路交易應記載五（訂立前提供種類、數量、價格等重要事項之確認機制）；SHOPLINE 支付服務條款第五條第一款（定期購需消費者同意週期與價金）。
說明：隱私權政策用「已閱讀」而不用「同意」，因為個資法上這是履行契約所必要的蒐集，靠§8 告知即可，不需要另取同意；把它寫成「同意」反而會讓人誤以為不同意就能拒絕。⚠️ 這是我的判斷，請律師確認。

### 7-3 付款成功後的確認信（必寄，滿足「可完整查閱、儲存」）

繁中主旨：「Huddle Pro 訂閱成功與收據」；內文必含：
> 營運者【待老闆填：本名】與客服聯絡方式／方案名稱／本次扣款金額與日期／訂單編號／卡號末四碼／下次扣款日與金額／自動續訂說明／線上取消方式（附連結）／7 天全額退款期限截止日（寫出日期）／〈服務條款〉〈取消與退款〉〈隱私權政策〉連結。

English subject: “Your Huddle Pro subscription and receipt”; the email must include: operator and support contacts / plan name / amount and date charged / order ID / last four card digits / next charge date and amount / how auto-renewal works / how to cancel online (with link) / the date the 7-day full-refund window ends / links to the Terms of use, Cancellation & refunds and Privacy notice.

依據：消保法§18 II（網路交易的資訊應以可供消費者完整查閱、儲存之電子方式提供）；§19 III（未提供解除契約資訊，七日自提供之次日起算，最長四個月）。

### 7-4 年繳續訂提醒信（續訂前至少 7 天）

> 繁中主旨：「你的 Huddle Pro 年繳方案將在【日期】自動續訂」。內文：續訂日期、金額 NT$990、使用中的卡片末四碼、線上取消連結、續訂後 7 天內仍可申請全額退款（方案乙）。
> English subject: “Your Huddle Pro annual plan renews on 【date】”. Body: renewal date, amount TWD 990, last four digits of the card on file, link to cancel online, and that a full refund is available within 7 days after renewal (option B).

---

## 8. 註冊頁與登入頁同意句

### 8-1 註冊頁 `app/(auth)/signup/page.tsx`

放置位置：標題區（`:152-153`）之下、Google／Apple 註冊按鈕（`:156-186`）之上，讓三種註冊方式都看得到。文字字典加進 `lib/i18n/dict/`。

> 繁中：建立帳號即表示你同意 Huddle 的〈服務條款〉，並已閱讀〈隱私權政策〉。
> English：By creating an account, you agree to Huddle’s Terms of use and confirm that you have read the Privacy notice.

（〈服務條款〉連 `/terms`、〈隱私權政策〉連 `/privacy`；英文介面連 `/en/terms`、`/en/privacy`。）

### 8-2 登入頁 `app/(auth)/login/page.tsx`

Google／Apple 登入在第一次使用時會直接建立帳號，所以登入頁也要放。位置：標題區（`:148-151`）之下、第三方登入按鈕（`:153-183`）之上。

> 繁中：繼續即表示你同意 Huddle 的〈服務條款〉，並已閱讀〈隱私權政策〉。
> English：By continuing, you agree to Huddle’s Terms of use and confirm that you have read the Privacy notice.

說明：註冊頁、登入頁也會出現在 iOS App 內，這兩句只連條款與隱私，**不提購買**，在 App 內顯示沒有問題。

---

## 9. 開賣當天要一起改掉的句子清單

以下現在寫「尚未開放購買」「未來」「1,290」等，開賣後會與事實不符。全部綁同一個開賣開關。英文頁行號與中文頁相同。

| 檔案:行 | 現在的問題 | 換成 |
|---|---|---|
| `components/legal/legal-page.tsx:24` | 「2026 年 9 月 20 日更新」 | 「【開賣日】更新」 |
| `components/legal/legal-page.tsx:27` | 「Pro 訂閱尚未開放」橫幅 | 繁中：「Huddle 的個人核心功能目前免費。Huddle Pro 是選購的自動續訂訂閱，可在網站或 iOS App 購買；註冊、下載或登入都不會自動收費。」English：“Huddle’s core personal features are currently free. Huddle Pro is an optional auto-renewing subscription, available on the website or in the iOS app. Creating an account, downloading the app or signing in will not charge you.” ⚠️ 此橫幅在 App 內顯示時需改用第 10 節的 App 版 |
| `app/terms/page.tsx:11` | 「目前沒有可購買的 Pro 訂閱…NT$1,290／年…」 | 2-3 |
| `app/terms/page.tsx:13` | 「未來若有透過商店購買的訂閱」「本頁不代表 Huddle 已開放收費…金流審核通過」 | 2-6 |
| `app/en/terms/page.tsx:5` | metadata “current status of planned subscriptions” | 2-9 |
| `app/refunds/page.tsx:7` | 「目前沒有 Huddle 訂閱扣款」「Pro 尚未開放購買」 | 4-2 |
| `app/refunds/page.tsx:8` | 標題「日後透過 Apple 購買時」 | 4-6 |
| `app/refunds/page.tsx:10` | 「日後開放收費前會依實際交易提供適用說明」 | 4-8 |
| `app/refunds/page.tsx:11` | 「未來有訂閱時」 | 4-9 |
| `app/en/refunds/page.tsx:4` | metadata “future subscription cancellation guidance” | 4-10 |
| `app/support/page.tsx:9` | 「目前尚未提供…私人帳務與個資申請管道」 | 5-1 |
| `app/support/page.tsx:11` | 「Huddle 尚未開放 Pro 訂閱」 | 5-3 |
| `app/privacy/page.tsx:12` | 「未來可能透過商店購買的訂閱」 | 3-5 |
| `app/privacy/page.tsx:13` | 「尚無…專用私人申請管道」 | 3-5 |
| `app/privacy/page.tsx:14` | 「目前沒有啟用 Pro 付款流程」 | 3-3 |
| `components/marketing/marketing-page.tsx:36`／`:61` | 「Pro 訂閱尚未開放購買，不會自動收費」 | 6-1 `priceIntro` |
| `components/marketing/marketing-page.tsx:38`／`:63` | 「準備中」「NT$1,290／年」「目前沒有訂閱或付款按鈕」 | 6-1 `soon`／`year`／`proBody` |
| `components/marketing/marketing-page.tsx:42`／`:67` | 「Pro 尚未開放購買，正式推出前會公布」 | 6-2 |
| `components/marketing/marketing-page.tsx:221` | Pro 卡片顯示「準備中」徽章、沒有購買按鈕 | 6-1 末段 |
| `lib/billing/plans.ts:3` | `annualReferencePrice: 1290`（程式數值，非文案，但會影響顯示） | 990（pro-scope 已記待同步） |
| `lib/i18n/dict/operations.ts:285` | 營運後台 “Purchases are not enabled yet”（內部畫面，非對外，優先度低） | 開賣後改寫 |

---

## 10. App 內禁區提醒（給工程師）

iOS App 和網站共用同一份程式碼，以下文案**只能在網站（瀏覽器）出現，不能在 iOS App 內出現**。依據：Apple 審查準則 3.1.1(a)（除美國 storefront 外，App 與其 metadata 不得有導向 App 內購以外購買方式的按鈕、外部連結或其他行動呼籲）、3.1.3（不得在 App 內鼓勵使用 App 內購以外的購買方式；App 外的溝通，例如 Email，可以）。

1. 官網結帳頁、`priceNote`、Pro 卡片的「升級 Pro」網站按鈕、6-2 的 FAQ「網站買的 iPhone 能用嗎」。
2. 任何「網站比較便宜」「到官網買」的比價或引導文字（目前兩邊同價，也不要寫）。
3. 法務頁（條款、退款、支援、隱私）在 App 內被打開時：
   - **建議**：在原生 App 環境（Capacitor native platform）改顯示「App 版」——描述網站購買的段落（2-4、4-3～4-5、5-3 的網站項目、7-x）不顯示，或只留一句不含連結的事實陳述「在其他平台購買的訂閱，請到原購買處管理」。
   - `legal-page.tsx:27` 橫幅在 App 內改用：「Huddle 的個人核心功能目前免費。Huddle Pro 是選購的自動續訂訂閱，註冊、下載或登入都不會自動收費。」（不提網站）
   - ⚠️ 不確定：法務頁對網站購買的「純事實描述、無連結」是否會被審查員認定為行動呼籲，沒有官方說明；保守做法就是 App 內不顯示。
4. 網站訂閱的「設定 → 訂閱」管理畫面（取消、換卡）在 App 內：只顯示「你的訂閱是在網站購買，請用瀏覽器登入 huddle 網站管理」這類**不含可點連結**的文字。⚠️ 是否連網址文字都不能出現，沒有官方說明，保守不放網址。
5. **3.1.3(b) 前提**：App 解鎖網站買的 Pro，前提是同樣的 Pro 也能在 App 內用 Apple 購買。**App 內購還沒上架前，不要讓 App 讀取網站購買的權益**，或網站與 App 內購同一天開。
6. App 外的 Email（確認信、年繳提醒信）可以提網站管理連結（3.1.3 允許 App 外溝通）。但信件若在 App 內嵌顯示則同第 3 點。
7. 美國 storefront 例外：準則 3.1.1(a) 對美國 storefront 不禁止外部購買連結，但台灣不適用；第一版**不要做分 storefront 的差異化**，全部照台灣規則最省事。

---

## 11. SHOPLINE Payments 申請送件前檢查清單（網站要能看到什麼）

依據：SHOPLINE Payments 支付服務條款（v3-20260323）第四條、第五條、第五條之一第二款第 4 項；第三方說法（審核看營運者資訊、聯絡方式、隱私權、退換貨政策）標「第三方」。

**網站上要看得到（未登入就能看）**
- [ ] 頁尾有營運者本名、地址、客服電話、客服 Email（1-1）——條款要求「客服電話及 Email」
- [ ] 方案價格：NT$150／月、NT$990／年，標示新台幣與「已含稅（如適用）」（6-1）——條款要求「交易金額含營業稅及幣別」
- [ ] 方案內容：免費版與 Pro 各包含什麼、上限多少（6-1、2-3）——條款要求「商品或服務內容」
- [ ] 退換貨條件與猶豫期間：〈取消與退款〉頁有網站購買的 7 天全額退款、取消方式（4-3、4-4）——條款要求「退換貨條件」「猶豫期間資訊」
- [ ] 交付方式：寫明「付款後立即開通、線上提供，無實體寄送」（條款要求「寄送方式」，數位服務要明寫不寄送）——可放在 2-4「付款與開通」，已涵蓋
- [ ] 服務條款、隱私權政策（含 SHOPLINE Payments 揭露）可公開閱讀
- [ ] 全站已無「尚未開放購買」「NT$1,290」（第 9 節）
- [ ] 網站是正式網域、HTTPS、頁面能正常開（第三方）
- [ ] `dropout-tech` 字樣處理完畢（D7，避免營運主體不一致）

**送件資料**
- [ ] 本人身分證、本人台幣存摺封面（派工單背景；第三方）
- [ ] 送件填的姓名、電話、Email、地址與網站一字不差
- [ ] 營業項目寫清楚是「線上軟體訂閱服務」，並註明需要「定期購／綁卡」功能（內嵌式＋綁卡需另外申請開通）
- [ ] **不要申請分期**：條款第五條之二限制分期不接受「遞延性商品、服務」，年繳訂閱可能被認為屬之

**送件前要先問 SHOPLINE 的事**（官方未寫，建議以 Email 取得書面回覆）
- [ ] 個人戶每月信用卡收款有沒有上限、多少（⚠️ 第三方說 20 萬，另有第三方說已無上限）
- [ ] 軟體訂閱（數位服務、無實體出貨）是否接受個人戶
- [ ] 定期購扣款失敗時能否重試，還是一定要重新建單（條款寫「支付資訊無法付款時，訂單遭取消」）
- [ ] 信用卡帳單上顯示的商家名稱是什麼、能否自訂
- [ ] 退款 API 與時限、爭議款（chargeback）處理流程

---

## 12. 法源與來源 URL

### 12-1 台灣法規（全部於 2026-10-01 查核）

| 法規・條號 | 白話重點 | 修正／施行日期 | 來源 |
|---|---|---|---|
| 消費者保護法§18 | 通訊交易應以清楚易懂文句提供：(1) 名稱、代表人、事務所或營業所、電話或電子郵件 (2) 內容、對價、付款期日及方式、交付期日及方式 (3) 解除契約期限及方式 (4) 是否排除解除權 (5) 申訴受理方式；II 網路交易要能完整查閱、儲存 | 本法最近修正 104-06-17；§18–19-2 自 105-01-01 施行（沿革頁，本日稍早查核） | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=18 （本日重開原文） |
| 消費者保護法§19 | 接受服務後七日內得解除，免理由、免費用；III 未提供資訊者自提供次日起算、最長四個月；V 違反之約定無效 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=19 |
| 消費者保護法§19-2 II | 收到解除服務契約通知次日起 15 日內返還對價 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=19-2 |
| 消費者保護法§11-1 | 定型化契約訂立前應有 30 日以內合理審閱期間 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=11-1 （本日開原文） |
| 消費者保護法§22 | 廣告內容要真實，對消費者義務不得低於廣告 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=22 |
| 消費者保護法§47 | 消費訴訟得由消費關係發生地法院管轄 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0170001&flno=47 （本日開原文） |
| 消費者保護法施行細則§18 | 收受商品或接受服務前，亦得以書面通知解除契約 | 最新修正 104-12-31 | https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170002 （本日開原文） |
| 通訊交易解除權合理例外情事適用準則§2、§3 | §2(5) 數位內容或一經提供即為完成之線上服務，經事先同意並告知才排除；§3 有公告應記載事項者從其規定 | 104-12-31 發布、105-01-01 施行 | https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170012 （本日開原文） |
| 行政院 109-06-19 院臺消保字第 1090092557 號函 | §2(5) 判準：即時提供後即已履行完畢、性質上不易返還 | 109-06-19 | https://www.ey.gov.tw/Page/349B76CABB867CA0/2adfb384-a5b1-4521-9907-3eb629b4bbfe （本日稍早查核） |
| 個人資料保護法§8 I | 蒐集時告知六款：名稱、目的、類別、利用期間地區對象方式、權利與方式、不提供的影響 | 本法 114-11-11 修正公布、施行日由行政院定（頁面標示部分條文尚未生效）；§8 內容如左 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=8 （本日開原文） |
| 個人資料保護法§3 | 查閱、複製、補正、停止、刪除五項權利不得預先拋棄或特約限制 | 同上 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=3 |
| 個人資料保護法§21 | 國際傳輸主管機關「得限制」 | 同上（在 114 年修正之列） | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=21 |
| 公平交易法§21 | 不得對價格、內容等為虛偽不實或引人錯誤之表示 | 106-06-14 修正 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0150002&flno=21 |
| 民法§77 | 限制行為能力人為意思表示應得法定代理人允許 | 未另查修正日 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=77 （本日開原文） |
| 民事訴訟法§436-9 | 小額事件一造為法人或商人時，定型化約定的管轄合意不適用 | 未另查修正日 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0010001&flno=436-9 （本日開原文） |
| 商業登記法§3、§5 | §3 商業＝以營利為目的之獨資或合夥事業；§5(5) 每月銷售額未達營業稅起徵點者得免辦商業登記 | 頁面顯示最新修正 114-12-26；§5 是否在該次修正之列未核對沿革 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0080004&flno=5 |
| 稅籍登記規則§4-1 | 網路或 App 銷售的營業人，要在頁面明顯處揭露營業人名稱與統一編號 | 111-08-08 修正（本日稍早查核） | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340087&flno=4-1 |
| 小規模營業人營業稅起徵點 | 10 萬元類與 5 萬元類業別清單；未列資訊服務／軟體 | 113-12-12 修正、114-01-01 施行 | https://law-out.mof.gov.tw/LawContent.aspx?id=FL006090 |
| 財政部稅務入口網：網路交易課徵營業稅 Q&A | 起徵點勞務 5 萬、達起徵點應即稅籍登記；未達 20 萬查定 1%、達 20 萬使用統一發票 5%；所得併入綜所稅 | 頁面 114-02-05 更新 | https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/q-and-a |
| 財政部稅務入口網：境內網路交易案例說明 | 同上，以案例說明 | 頁面 114-02-05 更新 | https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/seller/case |
| 財政部北區國稅局新聞稿（財政部網站） | 網路個人賣家當月銷售額達起徵點應即辦理稅籍登記；勞務 5 萬 | 2026-02-26 | https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=3b62d010b3ce4e3997ad920bbb27220d |
| 零售業等網路交易定型化契約應記載及不得記載事項 | 營運者資訊、確認機制、解除權、個資、帳號冒用、爭議處理；不得記載放棄權利、單方變更、任意終止、排除§47 等 | 經濟部 105-07-15 公告修正、105-10-01 生效 | https://www.ey.gov.tw/File/2D44FB65E5FF31C9 （本日開 PDF 原文） |
| 同上之前言修正草案（行政院公報） | 名稱改「零售業之…」，適用範圍限零售商品、經濟部與數位發展部分工 | 公報 2025-01-16；是否已定案未查 | https://gazette.nat.gov.tw/EG_FileManager/eguploadpub/eg031011/ch05/type3/gov87/num10/images/Eg01.pdf （本日開 PDF 原文） |

### 12-2 平台與金流（不是法律，但是審核依據）

| 來源 | 重點 | 版本日期 | URL |
|---|---|---|---|
| SHOPLINE Payments 支付服務條款 | 第四條：店家可為中華民國國籍之自然人；第五條第一款：定期購依約定週期與價金扣款、支付資訊無法付款時訂單取消；第五條之一第二款第 4 項：網站須揭露價格（含營業稅及幣別）、內容、聯絡方式（客服電話及 Email）、寄送方式、退換貨條件、猶豫期間；第五條之二：分期不接受遞延性服務；第十條：未達 2,000 元暫不撥款 | v3-20260323 | https://www.shoplinepayments.com/zh-hant-tw/terms |
| SHOPLINE Payments 隱私權政策 | 營運公司「先科技有限公司」（S Technology Co., Ltd.）；持卡人信用卡資訊由其直接蒐集；資料儲存於新加坡及美國 | 2025-08-15 | https://www.shoplinepayments.com/zh-hant-tw/privacy |
| Apple App Review Guidelines 3.1.1(a)、3.1.3、3.1.3(b) | 非美國 storefront 不得有導向 IAP 以外購買的按鈕、連結、行動呼籲；App 外溝通可以；跨平台取得的訂閱可在 App 使用，前提是 App 內也能 IAP 購買 | 頁面未顯示日期（本日讀取） | https://developer.apple.com/app-store/review/guidelines/ |
| 第三方（**待確認**） | 個人戶每月信用卡收款上限 20 萬（另一說已無上限）；個人戶文件為身分證＋存摺＋商店資訊完整的官網 | — | https://site-now.app/shopline-payments-application-guide/ 、https://ecsoga.com/shopline-payments/ |

### 12-3 查核紀錄

- 查核範圍：台灣法規 11 部（消保法、施行細則、例外準則、個資法、公平法、民法、民訴法、商業登記法、稅籍登記規則、起徵點、零售業等應記載事項）、條文 20 條；財政部官方頁 3 個；行政院函 1 則、公報 1 份；SHOPLINE 官方文件 2 份；Apple 官方頁 1 個。紅 5（含平台規則 2）、黃 8、綠 4。
- 本日重新開啟原文的：消保法§18、§11-1、§47、施行細則、例外準則、個資法§8、民法§77、民訴§436-9、商業登記法§3／§5、起徵點、財政部三頁、零售業等應記載事項與修正草案、SHOPLINE 條款與隱私政策、Apple 準則。其餘（消保法§19、§19-2、§22、個資法§3／§21、公平法§21、稅籍登記規則§4-1、行政院函）為本日稍早同一位顧問查核的結果，未再重開。
- 沒做到／不確定：
  - SHOPLINE 說明中心（support.shoplineapp.com）回 403，個人戶上限與審核標準只有第三方說法。
  - 行政院「定型化契約應記載及不得記載事項」總表頁面已失效，無法逐一確認所有行業版本；數位發展部、經濟部法規站 403。
  - 消保法§12（顯失公平）、§43（申訴管道）原文本次未開。
  - 帳務憑證保存年限（稅法、商業會計法）未查。
  - 外國（歐盟、美國）消費者在網站購買的法規本次未查；IAP 稿 7-4 有部分來源可參考。
  - 本次無法執行 `git show origin/main`，行號以本機檔案為準，與派工單給的 origin/main 行號吻合。
- 整體信心：揭露項目與文案約 8 成；七日續訂與年繳不退約 5–6 成；稅務（業別、行號、Apple 收入合併計算）約 6–7 成——**這三塊建議律師／會計師給第二意見**。

**本報告為法遵風險盤點，非法律意見；紅／黃級項目建議諮詢執業律師確認。**
