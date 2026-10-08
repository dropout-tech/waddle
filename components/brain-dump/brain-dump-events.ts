'use client'

// Window event so the entry points (calendar header button, mobile FAB) stay
// one-liners in the shared layout files, and the panel itself lives entirely
// in components/brain-dump/.
export const BRAIN_DUMP_OPEN_EVENT = 'huddle:brain-dump-open'

export function openBrainDump() {
  window.dispatchEvent(new CustomEvent(BRAIN_DUMP_OPEN_EVENT))
}
