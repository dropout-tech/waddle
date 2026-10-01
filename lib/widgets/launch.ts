// Hand-off between the native widget deep-link listener (WidgetLinks, mounted
// in AuthProvider) and the main board (MainLayout). A widget tap can arrive
// while the board is already on screen — where a router.push to the same page
// would not remount it — or before it has mounted (cold start). So the query
// is parked here and announced with an event; MainLayout takes it on mount
// and on every event. Plain `/?widget=…` URLs (web, tests) work the same way.
export const WIDGET_LAUNCH_EVENT = 'huddle-widget-launch'
/** 便條紙 widget tap → StickyNotesProvider shows the overlay (detail: note id or null). */
export const STICKY_OPEN_EVENT = 'huddle-sticky-open'
/** A sticky note was saved / deleted → WidgetSync re-reads the newest notes. */
export const STICKY_CHANGED_EVENT = 'huddle-sticky-changed'
let queued: string | null = null

export function queueWidgetLaunch(search: string) {
  queued = search
  window.dispatchEvent(new Event(WIDGET_LAUNCH_EVENT))
}

export function takeWidgetLaunch(): URLSearchParams | null {
  if (queued !== null) { const q = new URLSearchParams(queued); queued = null; return q }
  const q = new URLSearchParams(window.location.search)
  if (!q.get('widget')) return null
  window.history.replaceState(window.history.state, '', window.location.pathname)
  return q
}
