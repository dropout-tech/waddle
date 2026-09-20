import type { Metadata } from 'next'
import Link from 'next/link'
import { FeatureFilm } from '@/components/marketing/feature-film'

export const metadata: Metadata = {
  title: 'Huddle feature film | Full preview',
  description: 'A 18-second story about organizing tasks, making time, and finding focus with Huddle.',
  robots: { index: false, follow: false },
}

export default function EnglishFilmPage() {
  return (
    <main lang="en" className="min-h-screen bg-[#f3df7d] text-[#25231e]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 pt-6">
        <Link href="/en/about" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Back to Huddle</Link>
        <h1 className="text-base font-semibold">Huddle · Feature film</h1>
        <Link href="/film" hrefLang="zh-TW" lang="zh-TW" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">繁體中文</Link>
      </header>
      <FeatureFilm locale="en" />
    </main>
  )
}
