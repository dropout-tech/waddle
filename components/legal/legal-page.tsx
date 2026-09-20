import Link from 'next/link'
import type { ReactNode } from 'react'

const pages = [
  ['/terms', '服務條款'], ['/privacy', '隱私說明'], ['/refunds', '取消與退款'], ['/support', '使用協助'],
] as const

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav aria-label="服務資訊" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-4">
          <Link href="/about" className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight">Huddle</Link>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {pages.map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{label}</Link>)}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <p className="text-sm text-muted-foreground">服務資訊 · 2026 年 9 月 20 日更新</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">{intro}</p>
        <div className="mt-10 rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm leading-7">Huddle 目前提供免費使用。Pro 訂閱尚未開放，註冊帳號、下載或登入都不會自動收費。</div>
        <div className="mt-12 space-y-10 text-base leading-8 [&_a]:underline [&_a]:underline-offset-4 [&_a]:break-words [&_li]:pl-1 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>
      </main>
      <footer className="mx-auto flex max-w-3xl flex-wrap gap-6 border-t border-border px-6 py-8 text-sm text-muted-foreground">
        <Link href="/about" className="inline-flex min-h-11 items-center underline underline-offset-4">回到官網</Link>
        <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">開啟 Huddle</Link>
      </footer>
    </div>
  )
}

export function LegalSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="scroll-mt-8"><h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>{children}</section>
}
