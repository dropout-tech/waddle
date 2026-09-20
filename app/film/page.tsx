import type { Metadata } from 'next'
import Link from 'next/link'
import { FeatureFilm } from '@/components/marketing/feature-film'

export const metadata: Metadata = {
  title: 'Huddle 功能短片｜完整預覽',
  description: '觀看 Huddle 的 24 秒情境短片，了解任務、行程、專注與筆記如何陪你整理一天。',
  robots: { index: false, follow: false },
}

export default function FilmPage() {
  return (
    <main className="min-h-screen bg-[#f3df7d] text-[#25231e]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pt-6">
        <Link href="/about" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">回到 Huddle 官網</Link>
        <h1 className="text-base font-semibold">Huddle · 功能短片完整預覽</h1>
        <Link href="/en/film" hrefLang="en" lang="en" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">English</Link>
      </header>
      <FeatureFilm />
    </main>
  )
}
