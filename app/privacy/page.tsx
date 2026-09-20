import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '資料與隱私說明｜Huddle' }

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground sm:py-24">
      <Link href="/about" className="inline-flex min-h-11 items-center underline underline-offset-4">回到 Huddle 官網</Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">資料與隱私說明</h1>
      <p className="mt-4 text-sm text-muted-foreground">更新日期：2026 年 9 月 20 日</p>
      <div className="mt-10 space-y-9 leading-8">
        <section><h2 className="text-xl font-semibold">帳號與你建立的內容</h2><p className="mt-3">Huddle 使用登入帳號識別使用者，儲存你建立的任務、行程、筆記、白板、上傳圖片及偏好設定，用來提供工作空間、跨裝置同步與你啟用的分享功能。使用 Google 或 Apple 登入時，登入驗證由對應服務與 Supabase 處理。</p></section>
        <section><h2 className="text-xl font-semibold">資料儲存與裝置</h2><p className="mt-3">帳號驗證、應用資料與上傳檔案使用 Supabase；網站運行於 Zeabur。瀏覽器與桌面程式會在裝置上保存登入狀態、部分設定與必要快取。桌面版連接相同的線上服務，登入與同步需要網路。</p></section>
        <section><h2 className="text-xl font-semibold">分享與公開內容</h2><p className="mt-3">當你使用分享功能時，請確認分享對象與畫面上的分享範圍。官網展示使用示意內容；你在個人工作空間建立的內容不會因下載桌面版而自動公開到官網。</p></section>
        <section><h2 className="text-xl font-semibold">管理與刪除</h2><p className="mt-3">你可以在產品內編輯或刪除內容，也可以在設定中提出刪除帳號。刪除帳號會移除帳號及其關聯資料，執行前請先保存需要保留的內容。服務供應商的備份及系統紀錄可能依其保存機制另行保留，不代表刪除後即時清除所有備份。</p></section>
        <section><h2 className="text-xl font-semibold">訂閱功能</h2><p className="mt-3">Pro 訂閱目前尚未開放購買。Apple、Google Play 與訂閱管理服務的付款及交易資料處理方式，會在正式開放訂閱前更新於此頁；目前不會因建立 Huddle 帳號而自動收費。</p></section>
        <section><h2 className="text-xl font-semibold">問題回報</h2><p className="mt-3">一般技術問題可以透過 <a href="https://github.com/dropout-tech/waddle/issues" target="_blank" rel="noreferrer" className="underline underline-offset-4">Huddle 問題回報頁</a>提出。該頁是公開的，請不要提交帳號密碼、登入連結、私人筆記或其他敏感內容。</p></section>
      </div>
    </main>
  )
}
