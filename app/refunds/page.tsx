import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { WebOnly } from '@/components/legal/web-only'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '@/lib/legal/operator'
import { IN_APP_PURCHASE_LIVE } from '@/lib/legal/in-app-purchase'

export const metadata: Metadata = { title: '取消訂閱與退款｜Huddle', alternates: { canonical: '/refunds', languages: { 'zh-TW': '/refunds', en: '/en/refunds' } } }
export default function RefundsPage() {
  return <LegalPage page="refunds" title="取消訂閱與退款" intro="取消續訂、申請退款與刪除帳號是不同的操作，做法也依購買管道而不同。這裡說明它們的差別與官方入口。">
    <LegalSection title={IN_APP_PURCHASE_LIVE ? 'Huddle Pro 怎麼扣款' : '目前沒有 Huddle 訂閱扣款'}>{IN_APP_PURCHASE_LIVE ? <><p>Huddle Pro 是自動續訂的訂閱，可在 iPhone App 內透過 App Store 購買，由 Apple 向你 Apple 帳號的付款方式扣款，收據也由 Apple 寄發。月繳方案每月扣款一次，年繳方案每年扣款一次；價格與免費試用資格以 App Store 購買畫面顯示的為準。註冊或登入 Huddle 不需要提供任何付款資料。</p><p>若你看到不認得的 Huddle 扣款，請先確認 Apple 收據上的商品與購買帳號，再來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a> 詢問；不要在公開問題回報頁貼出收據、卡號或個人資料。</p></> : <><p>Pro 尚未開放購買，所以現在不會有任何 Huddle 訂閱，也沒有試用結束後的自動扣款。若你看到疑似 Huddle 的扣款，請先確認銀行或商店收據中的商家名稱、商品與購買帳號，並來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a> 詢問；不要在公開問題回報頁貼出收據、卡號或個人資料。</p></>}</LegalSection>
    <WebOnly>
      <LegalSection id="web-trial" title="網站購買：免費試用與取消（網站購買開放後適用）">
        <p><strong>網站購買目前尚未開放。</strong>以下「網站購買」各段只在 Huddle 網站開放購買後適用。</p>
        <p><strong>2 週免費試用</strong>：在網站首次開始 Pro 可享 2 週免費試用，需要綁定信用卡。試用期內不收費；試用結束後會自動扣款第一期費用。<strong>試用期內取消，就不會被扣款。</strong>每位使用者限享一次，不論你之前在 iOS App 或網站使用過。</p>
        <p><strong>取消續訂（含取消試用）</strong>：登入 Huddle →「設定」→「訂閱」→「取消續訂」，線上即可完成，隨時都可以取消，不需要說明理由。也可以來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a> 請我們代為取消。取消後不會再扣款，Pro 可以使用到已付費期間（或試用期）結束，之後帳號回到免費方案。為避免下一期扣款，請在續訂日前一天結束前取消。取消續訂本身不等於申請退款；想退款請看下一段。</p>
      </LegalSection>
      <LegalSection id="web-refund" title="網站購買：七日內全額退款（網站購買開放後適用）">
        <p>你在網站<strong>試用結束後第一次扣款</strong>（月繳或年繳）起 7 天內，可以不說明理由解除訂閱契約，我們會<strong>全額退款</strong>，不收任何手續費。<strong>年繳方案續訂扣款</strong>後 7 天內，同樣可以申請全額退款。</p>
        <p>申請方式：登入後在「設定」→「訂閱」點「申請退款」，或來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a>，並提供你的 Huddle 帳號 Email。7 天從付款當天的隔天開始算，在第 7 天結束前提出申請即可。</p>
        <p>退款會退回原信用卡。我們會在收到申請的隔天起 15 天內完成退款作業；款項何時出現在你的信用卡帳單上，依發卡銀行的作業時間而定。退款完成後，該期的 Pro 會停止，帳號回到免費方案，資料不會刪除。</p>
        <p><strong>超過 7 天</strong>：月繳與年繳的已付費期間不按比例退款，但你可以隨時取消續訂，Pro 會用到期末。</p>
        <p><strong>以下情形不受 7 天限制，我們一定退款</strong>：重複扣款、我們扣錯金額、你已取消卻仍被扣款、你的帳號遭他人冒用而被扣款，以及我們停止提供 Pro 或整個服務（按未使用天數比例退款）。</p>
      </LegalSection>
      <LegalSection id="web-failed" title="網站購買：續訂扣款失敗（網站購買開放後適用）">
        <p>續訂扣款失敗時（例如卡片過期、額度不足），我們會寄信通知你，並在 7 天內最多再嘗試扣款 3 次，這段期間 Pro 照常可用。你可以到「設定」→「訂閱」更換信用卡。7 天後仍無法扣款，訂閱會自動結束、帳號回到免費方案；我們不會向你追收這一期的費用，資料也不會被刪除。之後想再使用 Pro，重新購買即可。</p>
      </LegalSection>
    </WebOnly>
    <LegalSection title={IN_APP_PURCHASE_LIVE ? '取消續訂與申請退款（Apple）' : '日後透過 Apple 購買時'}>{IN_APP_PURCHASE_LIVE ? <><p>透過 App Store 購買的訂閱，請在 Apple 帳號中管理續訂（iPhone 或 iPad 的「設定」→ 你的名字 →「訂閱」），也可以參考 Apple 的<a href="https://support.apple.com/118428" target="_blank" rel="noreferrer">取消訂閱說明</a>。取消後不會再續扣，Pro 可以使用到已付費期間結束。退款申請則使用<a href="https://support.apple.com/118223" target="_blank" rel="noreferrer">Apple 官方退款流程</a>，由 Apple 審核；取消續訂本身不等同已提出退款申請。</p></> : <><p>若未來從 App Store 訂閱，可依 Apple 的<a href="https://support.apple.com/118428" target="_blank" rel="noreferrer">取消訂閱說明</a>在 Apple 帳號中管理續訂。退款申請則使用<a href="https://support.apple.com/118223" target="_blank" rel="noreferrer">Apple 官方退款流程</a>；取消續訂本身不等同已提出退款申請。Apple 的訂閱無法在 Huddle 網站取消或退款。</p></>}</LegalSection>
    <LegalSection title="日後透過 Google Play 購買時"><p>若未來從 Google Play 訂閱，可在<a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noreferrer">Google Play 訂閱中心</a>管理與取消。退款可參考<a href="https://support.google.com/googleplay/answer/2479637?hl=zh-Hant" target="_blank" rel="noreferrer">Google Play 官方退款說明</a>。請確認登入的是原購買帳號；實際可用期間與退款結果依適用法律及原交易平台處理。</p></LegalSection>
    <LegalSection title="解除契約與你的權利"><p>依消費者保護法，透過網路購買服務的消費者，原則上可以在接受服務後七日內解除契約，不需要說明理由，也不需要負擔費用。持續提供的訂閱服務不能只因屬於數位服務，就一律宣告不退款。Huddle 沒有採用概括放棄解除權或「所有付款均不退款」的條款，也不影響法律保障你的權利。</p><ul><WebOnly><li><strong>網站購買</strong>（開放後）：依上方「網站購買：七日內全額退款」辦理。</li></WebOnly>{IN_APP_PURCHASE_LIVE ? <li><strong>透過 Apple 購買</strong>：款項由 Apple 收取，請先依上方流程向 Apple 申請退款。台灣的消費者在試用結束後第一次扣款起 7 天內（年繳方案續訂扣款後 7 天內亦同）想解除契約時，也請來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a> 或寫信到 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> 告訴我們，並準備好 Huddle 帳號 Email 與 Apple 收據上的訂單編號。我們會在收到你通知的隔天起 15 天內完成退款：Apple 已核准的，以 Apple 退款為準；期限內 Apple 沒有核准的，由我們以匯款退還該期款項（需要你提供收款帳戶），不會以 Apple 的決定作為拒絕的理由。</li> : <li><strong>透過 Apple 購買</strong>（開放後）：款項由 Apple 收取，請依上方流程向 Apple 申請退款；需要協助時可來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a>。</li>}</ul>{IN_APP_PURCHASE_LIVE && <p>在台灣以外購買時，退款資格依當地法律與 Apple 在當地的條款而定；本頁不限制你依居住地法律享有、且不得以約定排除的消費者權利。</p>}<p>相關規範可查閱<a href="https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001" target="_blank" rel="noreferrer">消費者保護法第 18、19 與 19-2 條</a>。</p></LegalSection>
    <LegalSection title="刪除帳號與訂閱"><p>移除應用程式或刪除 Huddle 帳號，不能代替 Apple 或 Google Play 的取消操作：透過 Apple 購買的訂閱，請先在 Apple 帳號取消續訂，再刪除 Huddle 帳號。</p><WebOnly><p>網站購買開放後，在網站購買的訂閱會在刪除帳號時一併停止續訂，不會再扣款；但已付費期間不因刪除帳號而退款。若仍在 7 天全額退款期間內，請<strong>先申請退款再刪除帳號</strong>，刪除後我們無法確認你的身分。</p></WebOnly><p>使用上的問題請參閱<Link href="/support">使用協助</Link>。</p></LegalSection>
  </LegalPage>
}
