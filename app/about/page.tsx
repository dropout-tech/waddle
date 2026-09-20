import type { Metadata } from 'next'
import { MarketingPage } from '@/components/marketing/marketing-page'

export const metadata: Metadata = {
  title: 'Huddle｜你的任務、行程、專注與筆記',
  description: '認識 Huddle、查看方案與下載桌面版。把任務、行程、專注與筆記收進同一張桌面。',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return <MarketingPage />
}
