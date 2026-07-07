import * as React from 'react'

// Wide-desktop breakpoint: at ≥1680px the main layout grows a third column
// (the always-on review pane) instead of letting the calendar stretch into
// wasted horizontal space. Mirrors hooks/use-mobile.ts exactly — same
// matchMedia + useSyncExternalStore pattern, opposite direction.
const WIDE_BREAKPOINT = 1680
const QUERY = `(min-width: ${WIDE_BREAKPOINT}px)`

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  // Same rationale as use-mobile: this only feeds the first hydration
  // render; useSyncExternalStore re-reads getSnapshot on the client
  // immediately after, so defaulting to "not wide" is invisible.
  return false
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

export function useWideScreen() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
