import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal/legal-page'
import { WebOnly } from '@/components/legal/web-only'
import { SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '@/lib/legal/operator'
export const metadata: Metadata = { title: '資料與隱私說明｜Huddle', alternates: { canonical: '/privacy', languages: { 'zh-TW': '/privacy', en: '/en/privacy' } } }
export default function PrivacyPage() {
  return <LegalPage page="privacy" title="資料與隱私說明" intro="這份說明整理目前版本使用的資料、用途，以及你可以進行的管理操作。">
    <LegalSection title="帳號與你建立的內容"><p>Huddle 由個人經營者提供，並由其蒐集與處理本頁所列的個人資料（營運者資訊與聯絡方式見<Link href="/terms#operator">服務條款</Link>）。</p><p>Huddle 使用電子郵件、帳號識別資訊及登入驗證資料來識別使用者。你建立的任務、行程、專注紀錄、筆記、白板、上傳圖片與偏好設定，會用於提供工作空間、儲存、跨裝置同步及你啟用的分享功能。</p><p>你可以選擇不建立帳號並瀏覽官網；若不提供登入所需資料，就無法使用需要帳號的雲端工作空間。工作內容由你自行決定是否輸入。</p></LegalSection>
    <LegalSection title="服務供應商與裝置儲存"><p>帳號驗證、應用資料與上傳檔案使用 Supabase，網站運行於 Zeabur，並使用 Sentry 接收錯誤回報。選用 Google 或 Apple 登入時，對應供應商會參與驗證。瀏覽器與桌面程式會保存登入狀態、部分設定與必要快取；桌面版連接相同的線上服務。</p><WebOnly><p>網站購買開放後，在網站購買 Huddle Pro 的刷卡將由 SHOPLINE Payments 處理，詳見下方〈訂閱與付款資料〉。</p></WebOnly><p>使用服務時，連線與系統運作也涉及網路及裝置相關技術資訊。雲端供應商可能跨地區處理資料；本頁不宣稱資料僅儲存在台灣，或所有紀錄都會在刪除帳號後立即清除。</p></LegalSection>
    <LegalSection title="錯誤回報（Sentry）"><p>當 Huddle 在你的裝置上發生程式錯誤時，會自動把一份錯誤報告傳送給 Sentry（Functional Software, Inc.）的錯誤監控服務，讓我們能發現並修正問題。這項功能只在「發生錯誤的當下」才會傳送資料；沒有錯誤時不會傳送任何東西。網頁版、iPhone App 與桌面版都適用。</p><p>我們會蒐集：錯誤的類型與（經截短，並盡力遮蔽個人資訊的）簡短說明、發生錯誤的頁面路徑（不含網址後面的參數，路徑中的識別碼也會遮蔽）、裝置與瀏覽器／系統版本、Huddle 的 App 版本、你的帳號編號（系統自動產生的一串亂碼，不含 Email 或姓名，用來判斷一個錯誤影響了多少人，並在你回報問題時查找相關紀錄），以及錯誤發生前的少量操作軌跡（例如換了哪個頁面、呼叫了哪個後端網址路徑）。我們不會蒐集：你的任務、行程、筆記、白板內容與上傳檔案，你的 Email 或姓名，登入憑證與 Cookie，也不會錄製畫面或操作過程。錯誤報告中的帳號編號只有我們能對應到你的帳號，Sentry 與其他人無法從這串編號得知你是誰。錯誤說明是程式自動產生的文字，我們會以自動化方式盡力遮蔽其中可能出現的個人內容（例如 Email、冒號或引號內的文字、非英文字句），但無法保證百分之百遮蔽。</p><p>資料存放地區：美國。Sentry 可能在你所在地區以外處理這些資料。Sentry 免費方案的錯誤資料預設保存 30 天，之後自動刪除；若日後改用付費方案，保存期間可能不同，屆時會更新本頁。這些資料只用來診斷與修正錯誤，不用於廣告，也不會出售。</p></LegalSection>
    <LegalSection title="會議 AI 整理"><p>你主動貼上的會議逐字稿或筆記，會傳送給 OpenAI（模型 gpt-4.1-mini）處理，用於整理重點與建議任務。依 <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAI 的 API 資料政策</a>，透過 API 傳送的內容預設不會用來訓練模型；我們也關閉了將這些請求存放在 OpenAI 帳號後台的功能。不過 OpenAI 仍會為防範濫用，將內容保留最長 30 天（法律另有要求或為防止危害而有必要時除外）。這項功能每人每月有次數上限，未主動使用時不會傳送任何逐字稿。請避免貼上他人未同意分享的機密或敏感內容。</p></LegalSection>
    <LegalSection title="Google 日曆（選用）"><p>你可選擇連結 Google 日曆，Huddle 僅以唯讀權限讀取你的主日曆，用來在行事曆上顯示你的會議，事件內容不會儲存在我們的伺服器。共享夥伴使用「約交集」時，系統會把你的 Google 會議時段視為忙碌，只提供起訖時間，不含標題、地點或其他內容；你可以隨時在設定中關閉此選項，或解除連結。Huddle 使用從 Google API 取得的資訊，將遵守 <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API 服務使用者資料政策</a>，包括「有限使用」規定。</p></LegalSection>
    <LegalSection title="分享範圍"><p>使用分享功能前，請確認接收對象與分享範圍。個人工作內容不會因下載桌面版而自動公開至官網；官網展示採用示意內容。你主動提供給他人的內容，可能由接收者另行保存。</p></LegalSection>
    <LegalSection title="管理、保存與刪除"><p>你可以在產品內查看、編輯與刪除內容，也可以在「設定」選擇「刪除帳號」。刪除是不可復原的操作，請先保留需要的內容；若操作失敗，請勿把錯誤訊息視為已完成刪除。</p><p>服務使用期間會保存提供功能所需的資料。帳號、上傳檔案、備份及系統紀錄的清除範圍與時間可能不同，本頁不保證所有副本會立即清除。透過 App Store 購買的訂閱不會因刪除帳號而取消，請先在 Apple 帳號中取消。<WebOnly>網站購買開放後，在網站購買的訂閱會在刪除帳號時一併停止續訂。</WebOnly>交易與帳務紀錄依法須保存者，不在立即刪除的範圍內（見〈訂閱與付款資料〉）。</p></LegalSection>
    <LegalSection title="你的個人資料權利"><p>依法你可以就個人資料請求查閱、複製、補充或更正、停止蒐集處理利用，以及刪除。產品內已提供內容編輯與帳號刪除操作；其他請求請來電 <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a>，我們會先確認你是帳號本人，並盡快回覆。請不要在公開 GitHub 討論區提交身分證明或私人內容。</p><p>權利內容可參閱<a href="https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021" target="_blank" rel="noreferrer">個人資料保護法第 3 條</a>。一般操作協助請見<Link href="/support">使用協助</Link>。</p></LegalSection>
    <LegalSection title="訂閱與付款資料"><p>目前沒有啟用 Pro 付款流程。日後開放 Apple、Google Play 或訂閱管理服務時，會在啟用前補充交易、訂閱識別資訊及相關供應商的處理方式。註冊帳號不會自動產生訂閱。</p><p><strong>iPhone App 購買（App Store）——開放購買後適用</strong></p><p>在 iPhone App 購買 Huddle Pro 時，付款由 Apple 處理，我們不會取得你的信用卡或 Apple 帳號的付款資料。為了確認與管理你的訂閱狀態，我們委託 RevenueCat, Inc.（美國）提供訂閱管理服務：我們提供給它的是你的 Huddle 帳號識別碼，並由它向 Apple 取得你的購買紀錄（方案、購買與到期時間、交易編號、是否退款等）。這些資料存放於美國，只用於開通、續訂、恢復購買、客服與對帳，不會用於廣告，也不會出售。</p><p>你刪除 Huddle 帳號時，我們會一併要求 RevenueCat 刪除你的訂閱紀錄；若對方系統暫時無法處理，我們會自動重試，最遲 7 日內完成。Apple 依其政策保存的交易紀錄，由 Apple 處理。</p>
      <WebOnly>
        <p><strong>網站購買（信用卡）——網站購買開放後適用</strong></p>
        <p>為了收款、開通與續訂 Huddle Pro、處理免費試用、寄送收據、處理取消與退款、客服與對帳，以及依法保存帳務紀錄，網站購買開放後我們會處理以下資料：你的帳號 Email 與帳號識別碼、購買的方案與試用狀態、金額、幣別、付款與續訂時間、訂單與交易編號、扣款結果、退款紀錄，以及 SHOPLINE Payments 回傳的卡片資訊（卡別、發卡國家與卡號末四碼）。</p>
        <p>刷卡由 SHOPLINE Payments（先科技有限公司）處理。你在付款畫面輸入的卡號、有效期限與持卡人姓名等資料，是直接提供給 SHOPLINE Payments，由其依它的隱私權政策蒐集、處理並保存（其政策載明資料儲存於新加坡及美國）；Huddle 不會取得、也不會儲存你的完整卡號。為了試用結束後自動扣款與自動續訂，SHOPLINE Payments 會依你的授權保存付款資訊，Huddle 只保存它提供的代碼，用來在扣款日請款。</p>
        <p><strong>誰會處理、存在哪裡、保存多久</strong></p>
        <p>上述資料只用於提供與管理你的訂閱、客服、對帳、防範盜刷與爭議款，以及履行法令義務，不會用於廣告，也不會出售。處理對象限於：Huddle 營運者、SHOPLINE Payments（刷卡）、我們的雲端服務供應商（Supabase、Zeabur），以及依法有權要求的機關（例如稅捐機關）。這些資料可能在台灣以外的地區處理，包括新加坡與美國。</p>
        <p>訂閱權益紀錄在帳號存續期間保存。交易、收據與退款紀錄是帳務憑證，即使你刪除帳號，也會依稅務與會計法令要求的期間保存，期滿後刪除。</p>
        <p><strong>如果你不提供</strong></p>
        <p>你可以不購買 Pro，繼續使用免費版。要開始 Pro 試用或購買 Pro，就必須提供付款資料；不提供的話，我們無法完成開通與收款。</p>
      </WebOnly>
      <p>若資料處理方式調整，這個頁面會更新日期與內容；需要另外取得同意的情形，會在相關操作中處理。</p></LegalSection>
  </LegalPage>
}
