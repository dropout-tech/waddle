# Huddle 公開服務資訊與訂閱送審清單

查核日期：2026-09-20。以當日官方頁面為依據。這是實作與送審準備清單，不是已通過審核或法律合規證明。

## 現況與發布邊界

已建立 `/terms`、`/privacy`、`/refunds`、`/support` 與共同導覽。頁面可免登入查閱，寫的是目前免費服務及未來訂閱的一般操作。NT$149／月、NT$1,290／年仍是預定方案，沒有啟用付款、沒有承諾未實作 Pro 權益，也不宣稱商店或金流核准。

**目前不足以直接送正式訂閱審核。** 營運者身分、私人客服、個資申請管道及資料保存範圍尚未確認。這些不只是付費後才需要注意：免費服務已有個資蒐集，應優先補足。公開頁不放假 email、地址、統編、退款天數或保證核准標章。既有 GitHub Issues 只作公開技術回報，不能替代私人個資或帳務受理。

## 一、台灣法規要求

| 分類 | 應處理事項 | Huddle 待確認或落地 |
| --- | --- | --- |
| 法規：消保法第18條 | 通訊交易要提供營運者與有效聯絡資訊、服務與對價、付款和交付、解除及申訴方式；網路資訊須可完整查閱保存。 | 確認正式名稱、代表人、營業/事務所地址、電話或電子郵件。不能把 GitHub 組織名當法律主體。付款前顯示週期、總額、交付與續訂條件。 |
| 法規：消保法第19、19-2條 | 解除權及法定退款義務不能以網站條款概括排除。 | 目前未訂「數位產品一律不退款」。連續 SaaS 不可直接視為一經提供完成的服務；正式交易型態確認後再判斷合理例外及事先同意方式。 |
| 法規：個資法第8條 | 告知蒐集主體、目的、資料種類、期間/地區/對象/方式、權利與行使方式、不提供的影響。 | privacy 已列可確認的使用情形；缺主體、實際地區、各類保存期間、私人受理方式，必須補齊。 |
| 法規：個資法第3條 | 個資查閱、複製、更正、停止與刪除權利不得預先拋棄或約定限制。 | 要有能實際受理、驗證身分及回覆的流程；不能只寫權利名稱。 |

官方來源：[消費者保護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001)、[個人資料保護法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)、[行政院消保會：網站能否不提供7日解除權](https://cpc.ey.gov.tw/Page/BC16ACF0BBB9CCC2/f8e15c56-0cbe-49ac-a7ba-2f41e1d9ca55)。本清單引用第3、8、18、19、19-2條；不要把尚未生效的其他修法內容當成現行義務。

適用推論：Huddle 若向台灣消費者提供遠端訂閱，應依通訊交易檢視。具體定型化契約行業別、稅籍/發票、未成年人及跨境銷售規則仍須按實際營運型態確認；沒有宣稱所有 SaaS 一體適用某個產業範本。

## 二、Apple 平台要求

- App Review Guidelines 1.5、2.1：有效支援聯絡方式，完整可用的 URL、後台與測試存取，不以待填網站送審。
- 3.1.2 與訂閱說明：購買前清楚列商品名稱、期間、實際內容、完整續訂價格；有登入/恢復購買方式，App 與商店資料提供 Terms of Use、Privacy Policy 連結。
- 5.1.1：App 內及商店提供隱私政策，說明資料用途、第三方、保留/刪除；提供 App 內帳號刪除。
- Huddle 尚未確認付費功能、商店商品與價格、同意與恢復畫面、沙盒測試、實際客服。這些必須完成，單有網頁不足以核准。

來源：[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)、[Auto-renewable Subscriptions](https://developer.apple.com/app-store/subscriptions/)。這些是 Apple 平台要求；不應一概描述為台灣法律。官網直載的 Electron DMG 也不等同已經 Mac App Store 審核。

## 三、Google Play 平台要求

- 訂閱方案要如實顯示內容、實際週期總價、自動續訂及免費功能；不能用年繳折算月價掩蓋實際收取年費。
- App 內帳號設定或等效位置要有易用的線上取消入口；取消與退款是不同動作，不能以平台一般政策排除適用法律。
- 隱私政策須公開、可直接讀取，涵蓋開發者/個資聯絡、處理對象、保留刪除；Data safety 應與 App、SDK、政策一致。
- 能建立帳號的 App 要有 App 內及 App 外刪除申請方式。現在 `/support` 只有 App 內操作說明，**不是**已完成的外部刪除申請流程；需建受保護的表單或確認可受理的私人管道，並測試無法使用 App 者仍能提出請求。

來源：[Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533?hl=en)、[User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)。這些是 Google 平台要求，不是取得 Apple 核准的替代品。

## 四、營運方須補的資訊（內部待填）

| 欄位 | 目前狀態 | 用途 |
| --- | --- | --- |
| 正式營運名稱、代表人、登記/營業地址 | 待營運方提供 | terms、客服/交易資訊、商店與金流資料一致 |
| 統編/稅務與發票方式 | 待確認是否適用及提供 | 商店/金流商業資料、台灣稅務流程；不宣稱消保法18條直接要求統編 |
| 可收信的客服 email/電話、私人個資申請入口 | 待營運方提供並實測 | support、privacy、退款爭議及身分驗證 |
| 服務時段、回覆時效、申訴負責人 | 待訂定 | 營運建議，不擅自承諾「24小時」 |
| DB/Storage/備份/日誌實際地區與保留週期 | 待管理後台及供應商確認 | 完整個資告知與 deletion policy |
| Pro 功能、額度、帳號切換/恢復、取消後資料可用範圍 | 待產品確認 | 商品文案、付款確認畫面、客服腳本 |
| 台灣解除權適用、退款受理/平台協助流程 | 待按正式銷售方式確認 | 不能只寫一律交給 Apple/Google 而不受理法定爭議 |

## 五、實作核對與驗證（未冒充已完成）

1. `supabase/functions/delete-account/index.ts` 目前只見 Auth `deleteUser`；須驗證部署版本、FK cascade、所有 Storage owner 檔案及分享資料是否可刪，列出合法保留的紀錄、原因與期限。公開 privacy 已移除「所有資料立即移除」式保證。不可用真實帳號做破壞性驗證。
2. `package.json` 有 analytics 套件，不等於實際啟用。此次搜尋未看到在 App layout 啟用 analytics，仍需做完整第三方/network inventory，不能就此宣稱沒有追蹤或日誌。
3. 接入 SDK 後，更新 privacy 的訂閱識別/交易及 RevenueCat 資料處理。現階段不把尚未啟用購買寫成正在處理卡號。
4. Privacy 及 Terms 要可從 App 與購買頁開啟；頁尾導覽只是第一步。檢查鍵盤、手機字級、外鏈可用、PDF/登入牆/geo block 等問題。
5. 取消官方入口：[Apple取消](https://support.apple.com/118428)、[Apple退款](https://support.apple.com/118223)、[Google訂閱中心](https://play.google.com/store/account/subscriptions)、[Google退款](https://support.google.com/googleplay/answer/2479637?hl=zh-Hant)。外鏈只能提供原平台操作，不代表該平台已販售 Huddle。
6. 收費啟用仍遵守 `docs/billing/`：實機沙盒、webhook/資料庫驗證、續訂/退款/恢復/轉移及監控完成後才 enable；本次文件不改任何 billing flag。

## 完成標準

可讀的頁面已備妥，但「頁面存在」不等同正式法律告知完整、客服可用、SDK整合完成或付款核准。營運資料提供後補入公開頁，驗證私人聯絡與刪除流程、確認政策與真實資料處理相符，再進行商店/金流實際送審。未經營運方確認，不增訂排他管轄、概括免責、固定退款額度或自動續訂契約。
