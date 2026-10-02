'use client'

import { useEffect, useRef } from 'react'

// Window events so the entry points (calendar header button, mobile FAB,
// keyboard shortcut) stay one-liners in the shared layout files, and the
// panel itself lives entirely in components/brain-dump/.

export const BRAIN_DUMP_OPEN_EVENT = 'huddle:brain-dump-open'
/** Fired after writing — the calendar jumps to today so the new tasks show. */
export const BRAIN_DUMP_SHOW_TODAY_EVENT = 'huddle:brain-dump-show-today'

export function openBrainDump() {
  window.dispatchEvent(new CustomEvent(BRAIN_DUMP_OPEN_EVENT))
}

/** Mount once in the layout that owns the calendar's selected date. */
export function useBrainDumpShowToday(onShowToday: () => void) {
  const ref = useRef(onShowToday)
  useEffect(() => {
    ref.current = onShowToday
  })
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener(BRAIN_DUMP_SHOW_TODAY_EVENT, handler)
    return () => window.removeEventListener(BRAIN_DUMP_SHOW_TODAY_EVENT, handler)
  }, [])
}
