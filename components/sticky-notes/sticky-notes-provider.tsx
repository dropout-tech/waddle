'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { useStickyNotes } from '@/hooks/use-sticky-notes'
import { clampNotePosition } from './sticky-note-card'
import { StickyNotesLayer } from './sticky-notes-layer'

const ENABLED_STORAGE_KEY = 'huddle-sticky-notes-enabled-v1'

function readStoredEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface StickyNotesContextValue {
  /** Whether the glass overlay is currently shown. */
  enabled: boolean
  /** Flip the overlay on/off; persisted to localStorage (per-device). */
  toggle: () => void
  /** Drop a new note near the middle of the screen (used by the "+" control). */
  addNote: () => void
}

const StickyNotesContext = createContext<StickyNotesContextValue | null>(null)

/** Read/toggle the sticky-notes overlay from anywhere in the tree — the "顯示
 *  便條紙" switch and "新增便條紙" action live inside UserMenu (see
 *  components/user-menu.tsx), the most natural "top bar / user menu" home per
 *  the product decision, while the notes themselves render from this single
 *  provider mounted once at the root layout. Throws outside the provider so
 *  a missing mount fails loudly instead of silently no-op-ing. */
export function useStickyNotesToggle() {
  const ctx = useContext(StickyNotesContext)
  if (!ctx) throw new Error('useStickyNotesToggle must be used within StickyNotesProvider')
  return ctx
}

/**
 * Mounts the sticky-notes (便條紙) glass overlay once at the root layout —
 * next to FloatingHub — so the same set of notes is available on every
 * authenticated route (task board, calendar, /notebook, /meetings,
 * /membership, /widgets…). Signed-out visitors (public marketing pages)
 * never pay for the Supabase round trip — gated on `useAuth().user`.
 */
export function StickyNotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Read the persisted on/off state after mount only (localStorage isn't
  // available during SSR and a hydration-time read here would risk a
  // server/client markup mismatch on first paint, same rationale as
  // lib/i18n/index.ts's `detect()`).
  useEffect(() => {
    setEnabled(readStoredEnabled())
    setHydrated(true)
  }, [])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* private mode / storage disabled — the toggle still works this session */
      }
      return next
    })
  }, [])

  const store = useStickyNotes(hydrated && enabled && !!user, user?.id ?? null)

  const addNote = useCallback(() => {
    // Small jitter around a comfortable default spot so repeated adds don't
    // stack perfectly on top of each other; still clamped fully on-screen.
    const jitterX = (Math.random() - 0.5) * 10
    const jitterY = (Math.random() - 0.5) * 10
    const clamped = clampNotePosition(38 + jitterX, 22 + jitterY, 260, 220)
    store.createNote({ x: clamped.x, y: clamped.y })
  }, [store])

  const value = useMemo<StickyNotesContextValue>(() => ({ enabled, toggle, addNote }), [enabled, toggle, addNote])

  return (
    <StickyNotesContext.Provider value={value}>
      {children}
      {hydrated && enabled && user && <StickyNotesLayer store={store} />}
    </StickyNotesContext.Provider>
  )
}
