'use client'

import { useRouter } from 'next/navigation'
import { NotebookWorkspace } from './notebook-workspace'

/**
 * Full-page /notebook route shell — kept for bookmarks / deep links. The
 * default entry points (calendar header, ⌘K) now open the notebook as a
 * pop-up overlay instead (see notebook-overlay-provider.tsx); this route
 * still works if a user navigates here directly.
 */
export function NotebookPage() {
  const router = useRouter()

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <NotebookWorkspace onExit={() => router.push('/')} exitVariant="back" />
    </div>
  )
}
