import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'

export const metadata: Metadata = { title: '服務條款與使用說明｜Huddle', alternates: { canonical: '/terms', languages: { 'zh-TW': '/terms', en: '/en/terms' } } }
export default function TermsPage() {
  return <LegalPage page="terms" title="服務條款與使用說明" intro="了解 Huddle 提供什麼、如何使用，以及你的內容與帳號如何管理。">
    <LegalSection title="Huddle 提供的服務"><p>Huddle 是整理任務、行程、專注計時、筆記與白板的個人工作空間。網頁版與桌面版使用同一個帳號同步資料；登入、讀取雲端內容與同步需要網路。桌面測試版的安裝與支援平台以官網下載區說明為準。</p></LegalSection>
    <LegalSection title="帳號與使用安全"><p>請提供你有權使用的登入資料，妥善保管密碼與驗證連結。請勿使用他人的帳號、嘗試存取未授權的內容、散布惡意程式，或干擾服務運作。若你尚未具備獨立締約的能力，請由法定代理人協助了解並使用服務。</p></LegalSection>
    <LegalSection title="你的內容與分享"><p>你建立或上傳的任務、筆記與圖片，其權利不會因使用 Huddle 而轉移。為呈現、儲存、同步與執行你主動啟用的分享，服務需要處理這些內容。請只上傳有權使用的資料，並在分享前確認對象與範圍；不要分享他人的機密或侵害他人權利的內容。</p></LegalSection>
    <LegalSection title="免費使用與未來訂閱"><p>目前沒有可購買的 Pro 訂閱。官網顯示的 NT$149／月與 NT$1,290／年為台灣預定方案，不是已開放的交易。未來如開放購買，會在確認付款前顯示實際功能、計費週期、價格、自動續訂及取消方式，並由你主動確認；不會因原有免費帳號而自動轉成付費訂閱。</p></LegalSection>
    <LegalSection title="服務更新與內容保存"><p>Huddle 會持續修正與更新功能，維護或網路中斷可能暫時影響使用。請自行保留重要內容的副本；若遇到同步異常，先保存尚未同步的內容，再透過<Link href="/support">使用協助</Link>確認處理方式。</p><p>如將調整付費條件或影響既有使用權益，應在實施前提供適當通知與處理方式。這份使用說明不排除法律賦予你的權利，也不免除依法不得免除的責任。</p></LegalSection>
    <LegalSection title="帳號刪除與問題處理"><p>你可以在 Huddle 的設定中選擇「刪除帳號」並確認。請先保存需要的內容；刪除與資料處理範圍請閱讀<Link href="/privacy">隱私說明</Link>。未來若有透過商店購買的訂閱，刪除帳號或移除程式不等同取消訂閱，需另依原購買平台操作。</p><p>技術問題的現有回報方式列於<Link href="/support">使用協助</Link>。本頁不代表 Huddle 已開放收費、取得商店上架核准或金流審核通過。</p></LegalSection>
  </LegalPage>
}
