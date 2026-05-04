import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  // Best-effort: the inline script in app/layout.tsx sets
  // documentElement.dataset.viewport before hydration. We can't read it from
  // here on the server, but on the client this server snapshot is only used
  // during the first hydration render — useSyncExternalStore re-reads via
  // getSnapshot immediately, so any mismatch is invisible to the user.
  return false
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
