'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { useStickyNotes } from '@/hooks/use-sticky-notes'
import { clampNotePosition } from './sticky-note-card'
import { StickyNotesLayer } from './sticky-notes-layer'
import { StickyNotesDrawer } from './sticky-notes-drawer'
import { STICKY_OPEN_EVENT } from '@/lib/widgets/launch'

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
  /** Whether the 收納 drawer (put-away notes + folders) is open. */
  drawerOpen: boolean
  toggleDrawer: () => void
}

const StickyNotesContext = createContext<StickyNotesContextValue | null>(null)

/** Read/toggle the sticky-notes overlay from anywhere in the tree — the "顯示
 *  便條紙" switch and "新增便條紙" action live inside UserMenu (see
 *  components/user-menu.tsx) and, since 2026-09-27, also directly in the
 *  calendar toolbar next to the notebook button (see
 *  components/calendar/calendar-header.tsx) so it's discoverable without
 *  opening the account menu — while the notes themselves render from this
 *  single provider mounted once at the root layout. Throws outside the provider so
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
  // /float/* 是懸浮工作站的記事本／白板（iframe 或獨立小視窗）。那裡空間很小，
  // 便條會整張蓋住內容，而且主視窗本來就看得到便條——這些頁面完全不載入、不顯示。
  const pathname = usePathname()
  const isFloatWindow = pathname?.startsWith('/float/') ?? false
  const [enabled, setEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Read the persisted on/off state after mount only (localStorage isn't
  // available during SSR and a hydration-time read here would risk a
  // server/client markup mismatch on first paint, same rationale as
  // lib/i18n/index.ts's `detect()`).
  useEffect(() => {
    setEnabled(readStoredEnabled())
    setHydrated(true)
  }, [])

  const setEnabledPersisted = useCallback((next: boolean) => {
    setEnabled(next)
    try {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? '1' : '0')
    } catch {
      /* private mode / storage disabled — the toggle still works this session */
    }
  }, [])

  const toggle = useCallback(() => setEnabledPersisted(!enabled), [enabled, setEnabledPersisted])
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // The drawer works even while the glass layer is hidden, so opening it
  // must also trigger the (one-time) load.
  const store = useStickyNotes(
    hydrated && (enabled || drawerOpen) && !!user && !isFloatWindow,
    user?.id ?? null,
  )

  // Pinning a note back only makes sense if the layer is visible.
  const { restoreNote } = store
  const restoreFromDrawer = useCallback(
    (id: string) => {
      restoreNote(id)
      if (!enabled) setEnabledPersisted(true)
    },
    [restoreNote, enabled, setEnabledPersisted],
  )

  // 便條紙 widget tap (use-widget-launch.ts): show the overlay; a note that was
  // put away opens the drawer instead. (No bringToFront: that would write the row
  // and bump updated_at, reshuffling the widget's "newest" order.)
  const [openRequest, setOpenRequest] = useState<{ id: string | null } | null>(null)
  useEffect(() => {
    const onOpen = (e: Event) => {
      setEnabledPersisted(true)
      setOpenRequest({ id: (e as CustomEvent<string | null>).detail ?? null })
    }
    window.addEventListener(STICKY_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(STICKY_OPEN_EVENT, onOpen)
  }, [setEnabledPersisted])
  const storeNotes = store.notes
  useEffect(() => {
    if (!openRequest?.id || store.loading) return
    const note = storeNotes.find((n) => n.id === openRequest.id)
    if (note && !note.onScreen) setDrawerOpen(true)
    setOpenRequest(null)
  }, [openRequest, storeNotes, store.loading])

  const addNote = useCallback(() => {
    // Small jitter around a comfortable default spot so repeated adds don't
    // stack perfectly on top of each other; still clamped fully on-screen.
    const jitterX = (Math.random() - 0.5) * 10
    const jitterY = (Math.random() - 0.5) * 10
    const clamped = clampNotePosition(38 + jitterX, 22 + jitterY, 260, 220)
    store.createNote({ x: clamped.x, y: clamped.y })
  }, [store])

  const value = useMemo<StickyNotesContextValue>(
    () => ({ enabled, toggle, addNote, drawerOpen, toggleDrawer }),
    [enabled, toggle, addNote, drawerOpen, toggleDrawer],
  )

  return (
    <StickyNotesContext.Provider value={value}>
      {children}
      {hydrated && enabled && user && !isFloatWindow && <StickyNotesLayer store={store} />}
      {hydrated && drawerOpen && user && !isFloatWindow && (
        <StickyNotesDrawer store={store} onClose={closeDrawer} onRestore={restoreFromDrawer} />
      )}
    </StickyNotesContext.Provider>
  )
}
