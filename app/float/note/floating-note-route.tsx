'use client'

import { useSearchParams } from 'next/navigation'
import { FloatingNote } from '@/components/floating/floating-note'

/** useSearchParams 需要 client component + Suspense 邊界（Next.js 規定）。 */
export function FloatingNoteRoute() {
  const params = useSearchParams()
  return <FloatingNote initialNoteId={params.get('id') ?? undefined} />
}
