import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'
export const metadata: Metadata = { title: '取消訂閱與退款｜Huddle', alternates: { canonical: '/refunds', languages: { 'zh-TW': '/refunds', en: '/en/refunds' } } }
export default function RefundsPage() {
  return <LegalPage page="refunds" title="取消訂閱與退款" intro="取消續訂、申請退款與刪除帳號是不同的操作。這裡先說明它們的差別與商店官方入口。">
    <LegalSection title="目前沒有 Huddle 訂閱扣款"><p>Pro 尚未開放購買，沒有試用期結束自動扣款的安排。若你看到疑似 Huddle 的扣款，請先確認銀行或商店收據中的商家名稱、商品與購買帳號；不要在公開問題回報頁貼出收據、卡號或個人資料。</p></LegalSection>
    <LegalSection title="日後透過 Apple 購買時"><p>若未來從 App Store 訂閱，可依 Apple 的<a href="https://support.apple.com/118428" target="_blank" rel="noreferrer">取消訂閱說明</a>在 Apple 帳號中管理續訂。退款申請則使用<a href="https://support.apple.com/118223" target="_blank" rel="noreferrer">Apple 官方退款流程</a>；取消續訂本身不等同已提出退款申請。</p></LegalSection>
    <LegalSection title="日後透過 Google Play 購買時"><p>若未來從 Google Play 訂閱，可在<a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noreferrer">Google Play 訂閱中心</a>管理與取消。退款可參考<a href="https://support.google.com/googleplay/answer/2479637?hl=zh-Hant" target="_blank" rel="noreferrer">Google Play 官方退款說明</a>。請確認登入的是原購買帳號；實際可用期間與退款結果依適用法律及原交易平台處理。</p></LegalSection>
    <LegalSection title="解除契約與你的權利"><p>台灣通訊交易原則上有法定的七日解除契約權及法定例外。持續提供的訂閱服務不能只因屬於數位服務，就一律宣告不退款。Huddle 目前沒有採用概括放棄解除權或「所有付款均不退款」的條款；日後開放收費前會依實際交易提供適用說明，不影響法律保障的權利。</p><p>相關規範可查閱<a href="https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0170001" target="_blank" rel="noreferrer">消費者保護法第 18、19 與 19-2 條</a>。</p></LegalSection>
    <LegalSection title="刪除帳號不等於取消續訂"><p>移除應用程式或刪除 Huddle 帳號，不能代替原購買平台的取消操作。未來有訂閱時，請先確認續訂狀態，再刪除帳號。現階段使用問題請參閱<Link href="/support">使用協助</Link>。</p></LegalSection>
  </LegalPage>
}
