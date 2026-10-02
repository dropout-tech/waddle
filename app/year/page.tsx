'use client'

import { useRouter } from 'next/navigation'
import { AuthGuard } from '@/components/auth/auth-guard'
import { LifeGridView } from '@/components/life-grid/life-grid-view'

// Standalone /year route — the 人生年曆 as a full page, for deep links and
// bookmarks. The usual entry points (penguin question, header menu, ⌘K,
// report card) open it as a pop-up over the board instead
// (components/life-grid/life-grid-overlay-provider.tsx).
export default function YearPage() {
  const router = useRouter()
  return (
    <AuthGuard>
      <div className="flex h-[100dvh] flex-col bg-background pt-[env(safe-area-inset-top)]">
        <LifeGridView onExit={() => router.push('/')} exitVariant="back" />
      </div>
    </AuthGuard>
  )
}
