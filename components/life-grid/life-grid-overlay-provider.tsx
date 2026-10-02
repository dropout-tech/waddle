'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ModalShell } from '@/components/modals/modal-shell'
import { useI18n } from '@/lib/i18n/react'
import { LIFE_GRID_OPEN_EVENT, type LifeGridOpenDetail } from '@/lib/life-grid/events'
import { LifeGridView } from './life-grid-view'

/**
 * Hosts the 人生年曆 as a large pop-up (desktop) / full-screen sheet (phone)
 * over the main board, like the notebook overlay — opening it never leaves
 * the task board. Anything can open it with `openLifeGrid()` (window event),
 * so the penguin and the report dashboard don't need this provider's context.
 * /year still exists as a standalone route for deep links.
 */
export function LifeGridOverlayProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  // Bumped on every open so the view starts fresh (selected day, drafts);
  // kept after close so the content stays during the exit animation.
  const [session, setSession] = useState({ count: 0, focusToday: false })

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<LifeGridOpenDetail>).detail ?? {}
      setSession((s) => ({ count: s.count + 1, focusToday: !!detail.focusToday }))
      setIsOpen(true)
    }
    window.addEventListener(LIFE_GRID_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(LIFE_GRID_OPEN_EVENT, onOpen)
  }, [])

  return (
    <>
      {children}
      <ModalShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        variant="center"
        ariaLabel={t('人生年曆')}
        className="md:h-[88vh] md:max-h-[88vh] md:max-w-[1120px]"
      >
        {session.count > 0 && (
          <LifeGridView key={session.count} onExit={() => setIsOpen(false)} exitVariant="close" focusToday={session.focusToday} />
        )}
      </ModalShell>
    </>
  )
}
