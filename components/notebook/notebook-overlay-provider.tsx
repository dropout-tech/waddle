'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ModalShell } from '@/components/modals/modal-shell'
import { NotebookWorkspace } from './notebook-workspace'

interface NotebookOverlayContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

const NotebookOverlayContext = createContext<NotebookOverlayContextValue | null>(null)

/** Read/trigger the notebook pop-up from anywhere inside MainLayout's tree
 *  (calendar header entry points, ⌘K command palette). Throws if used
 *  outside NotebookOverlayProvider so a missing provider fails loudly
 *  instead of silently no-op-ing. */
export function useNotebookOverlay() {
  const ctx = useContext(NotebookOverlayContext)
  if (!ctx) throw new Error('useNotebookOverlay must be used within NotebookOverlayProvider')
  return ctx
}

/**
 * Hosts the notebook as a large centered pop-up (desktop) / full-screen
 * sheet (mobile, via ModalShell's `center` variant) so opening it doesn't
 * navigate away from the task board. /notebook the route still exists
 * separately (notebook-page.tsx) for bookmarks/deep links — this overlay is
 * just the default entry point.
 *
 * `key={openCount}` remounts NotebookWorkspace on every open so state
 * (activeId, mobilePane, draftTask) starts fresh rather than carrying over
 * from a previous session — matches how the other `{cond && <Modal/>}`
 * call-sites in this app behave (see ModalShell's doc comment).
 */
export function NotebookOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openCount, setOpenCount] = useState(0)

  const open = useCallback(() => {
    setOpenCount((c) => c + 1)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])

  return (
    <NotebookOverlayContext.Provider value={value}>
      {children}
      <ModalShell
        isOpen={isOpen}
        onClose={close}
        variant="center"
        ariaLabel="記事本"
        className="md:h-[85vh] md:max-h-[85vh] md:max-w-[1100px]"
      >
        <NotebookWorkspace key={openCount} onExit={close} exitVariant="close" />
      </ModalShell>
    </NotebookOverlayContext.Provider>
  )
}
