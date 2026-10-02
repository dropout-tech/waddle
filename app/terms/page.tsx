import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, OperatorBlock } from '@/components/legal/legal-page'
import { WebOnly } from '@/components/legal/web-only'
import { COURT, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '@/lib/legal/operator'
import { IN_APP_PURCHASE_LIVE } from '@/lib/legal/in-app-purchase'

export const metadata: Metadata = { title: '服務條款與使用說明｜Huddle', alternates: { canonical: '/terms', languages: { 'zh-TW': '/terms', en: '/en/terms' } } }
export default function TermsPage() {
  return <LegalPage page="terms" title="服務條款與使用說明" intro="了解 Huddle 提供什麼、如何使用，以及你的內容與帳號如何管理。">
    <LegalSection title="Huddle 提供的服務"><p>Huddle 是整理任務、行程、專注計時、筆記與白板的個人工作空間。網頁版與桌面版使用同一個帳號同步資料；登入、讀取雲端內容與同步需要網路。桌面測試版的安裝與支援平台以官網下載區說明為準。</p></LegalSection>
    <LegalSection title="帳號與使用安全"><p>請提供你有權使用的登入資料，妥善保管密碼與驗證連結。請勿使用他人的帳號、嘗試存取未授權的內容、散布惡意程式，或干擾服務運作。</p><p>你必須能依法自行訂立契約，才能購買 Huddle Pro。未成年人購買前，應取得法定代理人（例如父母）的同意。如果發現帳號遭他人冒用，請立即來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a>，我們會暫停該帳號後續的付款與續訂，並協助你處理。</p></LegalSection>
    <LegalSection title="你的內容與分享"><p>你建立或上傳的任務、筆記與圖片，其權利不會因使用 Huddle 而轉移。為呈現、儲存、同步與執行你主動啟用的分享，服務需要處理這些內容。請只上傳有權使用的資料，並在分享前確認對象與範圍；不要分享他人的機密或侵害他人權利的內容。</p></LegalSection>
    <LegalSection title={IN_APP_PURCHASE_LIVE ? '免費功能與 Huddle Pro 訂閱' : '免費使用與未來訂閱'}>{IN_APP_PURCHASE_LIVE ? <><p>整理任務、行程、專注計時、筆記與白板等核心功能目前免費使用，不需要訂閱。原有的免費帳號不會自動轉成付費訂閱；只有你在購買畫面主動確認後，訂閱才會成立。</p><p>Huddle Pro 是選購的加值方案，可在 iPhone App 內透過 App Store 訂閱，分為月繳與年繳，會自動續訂，直到你取消為止。實際包含的內容、價格、計費週期與免費試用資格，以你確認購買前 App Store 購買畫面顯示的為準。款項由 Apple 向你 Apple 帳號的付款方式收取，Huddle 不會取得你的卡號。</p><p>透過 App Store 購買的 Huddle Pro 會綁定購買或「恢復購買」時登入的 Huddle 帳號。用同一個 Apple 帳號在另一個 Huddle 帳號按「恢復購買」，訂閱會移到該帳號，原帳號同時失去 Pro；同一時間只有一個帳號享有。App Store 訂閱的扣款、續訂、取消與退款由 Apple 依其條款處理；要停止續訂，請在 Apple 帳號的訂閱設定中取消，取消後 Pro 仍可使用到已付費期間結束。刪除 Huddle 帳號不會取消訂閱或停止扣款。退款方式見<Link href="/refunds">取消與退款</Link>。</p></> : <><p>目前沒有可購買的 Pro 訂閱。官網顯示的 NT$150／月與 NT$990／年為台灣預定方案，不是已開放的交易。未來如開放購買，會在確認付款前顯示實際功能、計費週期、價格、自動續訂及取消方式，並由你主動確認；不會因原有免費帳號而自動轉成付費訂閱。</p><p>預定方案以新台幣計價，已含稅（如適用），沒有其他手續費。</p><p>iPhone App 開放購買後，透過 App Store 購買的 Huddle Pro 會綁定購買或「恢復購買」時登入的 Huddle 帳號。用同一個 Apple 帳號在另一個 Huddle 帳號按「恢復購買」，訂閱會移到該帳號，原帳號同時失去 Pro；同一時間只有一個帳號享有。App Store 訂閱的扣款、續訂、取消與退款由 Apple 依其條款處理；刪除 Huddle 帳號不會取消訂閱或停止扣款。</p></>}<WebOnly><p>網站開放購買後，Pro 預計提供 2 週免費試用，細節見下方〈網站購買〉。</p></WebOnly></LegalSection>
    <WebOnly>
      <LegalSection id="web-billing" title="網站購買：免費試用、付款與自動續訂（網站購買開放後適用）">
        <p><strong>網站購買目前尚未開放。</strong>以下條款只在 Huddle 網站開放購買後適用；在那之前，沒有任何訂閱、試用或扣款。</p>
        <p><strong>2 週免費試用</strong>：在網站首次開始 Pro 時，可享 2 週免費試用。開始試用需要綁定信用卡；試用期內不收費，試用結束後會自動以該卡扣款第一期費用。試用期內取消，就不會被扣款。每位使用者限享一次免費試用，不論你之前是在 iOS App 或在網站使用過；已用過試用的帳號，再次購買時不再提供試用，會在購買確認時直接扣款。</p>
        <p><strong>付款與開通</strong>：網站目前預計只接受信用卡，不提供分期付款。刷卡由 SHOPLINE Payments（先科技有限公司）處理；Huddle 不會取得或儲存你的完整卡號。為了自動續訂，SHOPLINE Payments 會依你的授權保存這張卡的付款資訊。Pro 為線上服務，開通後即可使用，沒有實體商品寄送。</p>
        <p><strong>自動續訂</strong>：訂閱會自動續訂，直到你取消為止。月繳方案每月扣款一次，年繳方案每年扣款一次，扣款日為你首次扣款日每月（或每年）的同一天；當月沒有這一天時（例如 31 日），改在當月最後一天扣款。每次扣款成功後，我們會寄送電子收據到你的帳號 Email。年繳方案續訂前至少 7 天，我們會寄信提醒你續訂日期與金額。</p>
        <p><strong>取消續訂</strong>：你可以隨時登入 Huddle，到「設定」→「訂閱」點「取消續訂」，線上即可完成，不需要來電；也可以來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a> 請我們代為取消。取消後不會再扣款，Pro 可以使用到已付費期間（或試用期）結束，之後帳號回到免費方案。退款規則見<Link href="/refunds">取消與退款</Link>。</p>
        <p><strong>扣款失敗</strong>：續訂扣款失敗時，我們會寄信通知你，並在接下來 7 天內最多再嘗試扣款 3 次，這段期間 Pro 照常可用。你可以在「設定」→「訂閱」更換信用卡。7 天後仍無法扣款，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，你的資料也不會因此被刪除。</p>
        <p><strong>價格調整</strong>：如果訂閱價格要調整，我們會在新價格生效前至少 30 天寄信通知你。新價格只從通知後的下一個計費週期開始適用，已付費的期間不會補收差額。你不同意新價格的話，可以在生效前取消續訂。</p>
        <p><strong>同時有 Apple 訂閱時</strong>：透過 Apple 的訂閱與網站訂閱是兩筆獨立的訂閱，不會互相取消。若你已透過 Apple 訂閱 Pro，請不要在網站重複購買；若不小心重複，請來電聯絡我們，我們會退還網站重複的那一筆。</p>
      </LegalSection>
    </WebOnly>
    <LegalSection title="服務更新與內容保存"><p>Huddle 會持續修正與更新功能，維護或網路中斷可能暫時影響使用。請自行保留重要內容的副本；若遇到同步異常，先保存尚未同步的內容，再透過<Link href="/support">使用協助</Link>確認處理方式。</p><p>如將調整付費條件或影響既有使用權益，我們會在實施前至少 30 天通知你。若我們決定停止提供 Huddle Pro 或整個服務，會在停止前至少 30 天通知，並按已付費但尚未使用的天數比例退款。除非你嚴重違反本條款（例如入侵系統、散布惡意程式），我們不會任意終止你的訂閱；即使因此終止，也會按未使用天數比例退款，但法律另有規定者除外。這份使用說明不排除法律賦予你的權利，也不免除依法不得免除的責任。</p></LegalSection>
    <LegalSection title="帳號刪除與問題處理"><p>你可以在 Huddle 的設定中選擇「刪除帳號」並確認。請先保存需要的內容；刪除與資料處理範圍請閱讀<Link href="/privacy">隱私說明</Link>。透過 App Store 購買的訂閱，刪除帳號或移除程式<strong>不會</strong>取消訂閱，請先在 Apple 帳號的訂閱設定中取消。</p><WebOnly><p>網站購買開放後，在網站購買的訂閱會在刪除帳號時一併停止續訂，不會再扣款。</p></WebOnly><p>技術問題的回報方式，以及帳務、退款、消費申訴與個人資料請求的聯絡方式，列於<Link href="/support">使用協助</Link>。發生消費爭議時，請先來電與我們聯絡，我們會盡快回覆並與你協商處理；若無法解決，你也可以依消費者保護法向直轄市或縣市政府的消費者服務中心或消費者保護官提出申訴。</p>{IN_APP_PURCHASE_LIVE ? null : <p>本頁不代表 Huddle 已開放收費、取得商店上架核准或金流審核通過。</p>}</LegalSection>
    <OperatorBlock />
    <LegalSection id="law" title="準據法與管轄法院"><p>本條款依中華民國法律解釋與適用。因本條款或 Huddle 服務發生爭議而需要訴訟時，雙方同意以{COURT.zh}為第一審管轄法院；但這不影響你依消費者保護法第 47 條向消費關係發生地法院起訴的權利，也不排除民事訴訟法關於小額訴訟管轄的規定。本條款如有疑義，應作有利於消費者的解釋。本條款不排除法律賦予你、且不得以約定排除的權利。</p></LegalSection>
  </LegalPage>
}
