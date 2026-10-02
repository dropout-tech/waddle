import Link from 'next/link'
import type { ReactNode } from 'react'
import { APP_SHELL_BUILD, PRO_ON_SALE } from '@/lib/billing/launch'
import { LEGAL_UPDATED, OPERATOR_NAME, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '@/lib/legal/operator'
import { LegalHomeLink } from './legal-home-link'
import { WebOnly } from './web-only'

const pages = [
  ['terms', '服務條款', 'Terms of use'], ['privacy', '隱私說明', 'Privacy'], ['refunds', '取消與退款', 'Cancellation & refunds'], ['support', '使用協助', 'Help'],
] as const

export function LegalPage({ title, intro, children, page, locale = 'zh-TW' }: { title: string; intro: string; children: ReactNode; page: 'terms' | 'privacy' | 'refunds' | 'support'; locale?: 'zh-TW' | 'en' }) {
  const english = locale === 'en'
  // In the app (Capacitor export) there is no marketing site to go back to: /about shows website prices and card payment (App Store 3.1.1).
  const home = APP_SHELL_BUILD ? '/' : english ? '/en/about' : '/about'
  const alternate = english ? `/${page}` : `/en/${page}`
  return (
    <div lang={locale} className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav aria-label={english ? 'Service information' : '服務資訊'} className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-4">
          <LegalHomeLink href={home} className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight">Huddle</LegalHomeLink>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {pages.map(([slug, zh, en]) => <Link key={slug} href={`${english ? '/en' : ''}/${slug}`} aria-current={slug === page ? 'page' : undefined} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{english ? en : zh}</Link>)}
            <Link href={alternate} hrefLang={english ? 'zh-TW' : 'en'} lang={english ? 'zh-TW' : 'en'} aria-label={english ? 'Switch to Traditional Chinese' : 'Switch to English'} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">{english ? '繁體中文' : 'EN'}</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <p className="text-sm text-muted-foreground">{english ? `Service information · Updated ${LEGAL_UPDATED.en}` : `服務資訊 · ${LEGAL_UPDATED.zh}更新`}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">{intro}</p>
        <div className="mt-10 rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm leading-7">{PRO_ON_SALE
          ? (english ? 'Huddle’s core features are currently free to use. Huddle Pro is an optional auto-renewing subscription, currently sold only in the iOS app through Apple. Creating an account, downloading the app or signing in will not automatically charge you.' : 'Huddle 的核心功能目前免費使用。Huddle Pro 是選購的自動續訂訂閱，目前只在 iOS App 內透過 Apple 購買；註冊帳號、下載或登入都不會自動收費。')
          : (english ? 'Huddle is currently free to use. Pro subscriptions are not available for purchase. Creating an account, downloading the app or signing in will not automatically charge you.' : 'Huddle 目前提供免費使用。Pro 訂閱尚未開放，註冊帳號、下載或登入都不會自動收費。')}</div>
        <div className="mt-12 space-y-10 text-base leading-8 [&_a]:underline [&_a]:underline-offset-4 [&_a]:break-words [&_li]:pl-1 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>
      </main>
      <footer className="mx-auto max-w-3xl border-t border-border px-6 py-8 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-6">
          {/* Website only: /about shows website prices and card payment, which the app must not point to (App Store 3.1.1). */}
          <WebOnly><Link href={home} className="inline-flex min-h-11 items-center underline underline-offset-4">{english ? 'Back to Huddle' : '回到官網'}</Link></WebOnly>
          <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">{english ? 'Open Huddle' : '開啟 Huddle'}</Link>
        </div>
        <p className="mt-4 leading-7" data-operator-footer>
          {PRO_ON_SALE
            ? (english ? `Huddle is operated by ${OPERATOR_NAME.en}, an individual in Taiwan. Customer service phone: ` : `Huddle 由${OPERATOR_NAME.zh}（個人經營）提供。客服電話：`)
            : (english ? 'Huddle is operated by an individual in Taiwan. Customer service phone: ' : 'Huddle 由個人經營者提供。客服電話：')}
          <a href={SUPPORT_PHONE_TEL} className="underline underline-offset-4">{SUPPORT_PHONE}</a>
          {english ? ' · ' : '｜'}
          <Link href={`${english ? '/en' : ''}/terms#operator`} className="underline underline-offset-4">{english ? 'Operator information' : '營運者資訊'}</Link>
        </p>
      </footer>
    </div>
  )
}

export function LegalSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="scroll-mt-8"><h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>{children}</section>
}

/** Operator + contact block shared by Terms (#operator) and Help. Only facts we actually have. */
export function OperatorBlock({ english = false, title }: { english?: boolean; title?: string }) {
  return (
    <LegalSection id="operator" title={title ?? (english ? 'Operator and contact information' : '營運者資訊與聯絡方式')}>
      {english ? (
        <>
          <p>{PRO_ON_SALE ? `Huddle is operated and provided by ${OPERATOR_NAME.en}, an individual in Taiwan.` : 'Huddle is operated and provided by an individual in Taiwan.'}</p>
          <ul>
            {PRO_ON_SALE ? <li>Operator: {OPERATOR_NAME.en} (individual)</li> : <li>Operator type: individual</li>}
            <li>Customer service phone: <a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a></li>
            {PRO_ON_SALE && <li>Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></li>}
          </ul>
          <p>{PRO_ON_SALE ? 'Call (or email) us' : 'Call us'} about subscriptions, charges, cancellation, refunds, withdrawal from a contract, complaints and personal data requests. Please have the email address of your Huddle account ready, and never tell us your full card number, password or verification codes. Technical problems can also be reported on the public GitHub issue page described on our help page.</p>
        </>
      ) : (
        <>
          <p>{PRO_ON_SALE ? `Huddle 由台灣的個人經營者${OPERATOR_NAME.zh}營運並提供服務。` : 'Huddle 由台灣的個人經營者營運並提供服務。'}</p>
          <ul>
            {PRO_ON_SALE ? <li>營運者：{OPERATOR_NAME.zh}（個人）</li> : <li>營運者型態：個人</li>}
            <li>客服電話：<a href={SUPPORT_PHONE_TEL}>{SUPPORT_PHONE}</a></li>
            {PRO_ON_SALE && <li>電子郵件：<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></li>}
          </ul>
          <p>訂閱、扣款、取消、退款、解除契約、消費申訴與個人資料請求，都可以來電{PRO_ON_SALE ? '（或寫信）' : ''}洽詢。來電時請準備好你的 Huddle 帳號 Email，並請不要告知完整卡號、密碼或驗證碼。一般技術問題也可以到使用協助頁所列的 GitHub 公開問題回報頁提交。</p>
        </>
      )}
    </LegalSection>
  )
}
