import { ErrorScreen } from '@/components/errors/error-screen'

// Bilingual 404 (the default Next.js one is English-only). The Capacitor
// static export turns this into 404.html.
export default function NotFound() {
  return <ErrorScreen title="找不到這一頁" message="網址可能打錯了，或這一頁已經搬家。" />
}
