import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'
export const metadata: Metadata = { title: '資料與隱私說明｜Huddle', alternates: { canonical: '/privacy' } }
export default function PrivacyPage() {
  return <LegalPage title="資料與隱私說明" intro="這份說明整理目前版本使用的資料、用途，以及你可以進行的管理操作。">
    <LegalSection title="帳號與你建立的內容"><p>Huddle 使用電子郵件、帳號識別資訊及登入驗證資料來識別使用者。你建立的任務、行程、專注紀錄、筆記、白板、上傳圖片與偏好設定，會用於提供工作空間、儲存、跨裝置同步及你啟用的分享功能。</p><p>你可以選擇不建立帳號並瀏覽官網；若不提供登入所需資料，就無法使用需要帳號的雲端工作空間。工作內容由你自行決定是否輸入。</p></LegalSection>
    <LegalSection title="服務供應商與裝置儲存"><p>帳號驗證、應用資料與上傳檔案使用 Supabase，網站運行於 Zeabur。選用 Google 或 Apple 登入時，對應供應商會參與驗證。瀏覽器與桌面程式會保存登入狀態、部分設定與必要快取；桌面版連接相同的線上服務。</p><p>使用服務時，連線與系統運作也涉及網路及裝置相關技術資訊。雲端供應商可能跨地區處理資料；本頁不宣稱資料僅儲存在台灣，或所有紀錄都會在刪除帳號後立即清除。</p></LegalSection>
    <LegalSection title="分享範圍"><p>使用分享功能前，請確認接收對象與分享範圍。個人工作內容不會因下載桌面版而自動公開至官網；官網展示採用示意內容。你主動提供給他人的內容，可能由接收者另行保存。</p></LegalSection>
    <LegalSection title="管理、保存與刪除"><p>你可以在產品內查看、編輯與刪除內容，也可以在「設定」選擇「刪除帳號」。刪除是不可復原的操作，請先保留需要的內容；若操作失敗，請勿把錯誤訊息視為已完成刪除。</p><p>服務使用期間會保存提供功能所需的資料。帳號、上傳檔案、備份及系統紀錄的清除範圍與時間可能不同，本頁不保證所有副本會立即清除。請勿將刪除帳號等同於取消未來可能透過商店購買的訂閱。</p></LegalSection>
    <LegalSection title="你的個人資料權利"><p>依法你可以就個人資料請求查閱、複製、補充或更正、停止蒐集處理利用，以及刪除。產品內已提供內容編輯與帳號刪除操作；其他請求目前尚無在本頁可使用的專用私人申請管道。請不要在公開 GitHub 討論區提交身分證明或私人內容。</p><p>權利內容可參閱<a href="https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021" target="_blank" rel="noreferrer">個人資料保護法第 3 條</a>。一般操作協助請見<Link href="/support">使用協助</Link>。</p></LegalSection>
    <LegalSection title="訂閱與政策更新"><p>目前沒有啟用 Pro 付款流程。日後開放 Apple、Google Play 或訂閱管理服務時，會在啟用前補充交易、訂閱識別資訊及相關供應商的處理方式。註冊帳號不會自動產生訂閱。</p><p>若資料處理方式調整，這個頁面會更新日期與內容；需要另外取得同意的情形，會在相關操作中處理。</p></LegalSection>
  </LegalPage>
}
