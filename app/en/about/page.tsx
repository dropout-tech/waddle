import type { Metadata } from 'next'
import { MarketingPage } from '@/components/marketing/marketing-page'
export const metadata: Metadata = {
  title: 'Huddle — Find your rhythm. Make things happen.',
  description: 'Tasks, calendars, focus timers and a whiteboard in one personal workspace. Explore Huddle, see the planned Pro pricing, and download the Mac beta.',
  openGraph: { title: 'Huddle — Find your rhythm. Make things happen.', description: 'Tasks, calendars, focus timers and a whiteboard in one personal workspace.', locale: 'en_US', url: '/en/about', type: 'website', images: [{ url: '/marketing/workspace-demo-en.png', width: 1440, height: 1000, alt: 'Huddle workspace' }] },
  twitter: { card: 'summary_large_image', title: 'Huddle — Find your rhythm. Make things happen.', description: 'Tasks, calendars, focus timers and a whiteboard in one personal workspace.', images: ['/marketing/workspace-demo-en.png'] },
  alternates: { canonical: '/en/about', languages: { 'zh-Hant': '/about', en: '/en/about' } },
}
export default function EnglishAboutPage() { return <MarketingPage locale="en" /> }
