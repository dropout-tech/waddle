import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'
export const metadata: Metadata = { title: '使用協助｜Huddle', alternates: { canonical: '/support', languages: { 'zh-TW': '/support', en: '/en/support' } } }
export default function SupportPage() {
  return <LegalPage page="support" title="使用協助" intro="遇到登入、同步或安裝問題時，可以先從這裡確認下一步。">
    <LegalSection title="登入與桌面版"><p>桌面版使用 Google 登入時，會開啟系統瀏覽器。完成驗證後，請選擇「開啟 Huddle」回到桌面程式。如果取消或等候逾時，回到登入畫面重新開始即可；請不要把登入網址或驗證碼貼到公開網站。</p><p>如果桌面版暫時無法登入，可以先使用<Link href="/login">網頁版</Link>確認帳號。請使用官網提供的最新安裝檔。</p></LegalSection>
    <LegalSection title="同步或載入異常"><p>先確認網路連線與使用的登入帳號一致。請保存尚未同步的內容，再重新整理或重新開啟程式；不要為了解決載入問題而直接刪除帳號。</p></LegalSection>
    <LegalSection title="回報一般技術問題"><p>目前可透過<a href="https://github.com/dropout-tech/waddle/issues" target="_blank" rel="noreferrer">GitHub 問題回報頁</a>提交一般技術問題，需要 GitHub 帳號。請附上作業系統、瀏覽器或桌面版版本、發生時間、操作步驟與已遮蔽私人資料的畫面。</p><p>這是公開討論區，不是私人客服信箱。請勿張貼密碼、驗證碼、登入連結、帳務收據、完整電子郵件或私人工作內容。目前尚未提供可在此頁使用的私人帳務與個資申請管道。</p></LegalSection>
    <LegalSection title="資料管理與刪除帳號"><p>登入後開啟「設定」，找到「刪除帳號」，閱讀確認訊息後操作。這是不可復原的操作，請先保存要保留的內容。若無法登入，請先使用<Link href="/forgot-password">密碼重設</Link>或原本的 Google／Apple 登入方式恢復存取。</p><p>資料使用與刪除限制請見<Link href="/privacy">隱私說明</Link>。目前這個頁面提供操作說明，並不是獨立的免登入刪除申請表單。</p></LegalSection>
    <LegalSection title="訂閱問題"><p>Huddle 尚未開放 Pro 訂閱。未來訂閱的管理入口與退款資訊整理於<Link href="/refunds">取消與退款</Link>；目前不用為了註冊或登入提供信用卡資料。</p></LegalSection>
  </LegalPage>
}
