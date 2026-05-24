'use client'

import { useEffect, useState } from 'react'

/**
 * Time-of-day "mood" buckets used to drive ambient UI touches (currently the
 * Waddle mascot's expression). Boundaries are local time and chosen to feel
 * natural rather than mathematically even:
 *   06–09  morning  — just-waking
 *   09–18  work     — alert (the default; matches the original mascot)
 *   18–22  evening  — winding down
 *   22–05  night    — sleeping
 */
export type DayPhase = 'morning' | 'work' | 'evening' | 'night'

export function computeDayPhase(date: Date = new Date()): DayPhase {
  const h = date.getHours()
  if (h >= 6 && h < 9) return 'morning'
  if (h >= 9 && h < 18) return 'work'
  if (h >= 18 && h < 22) return 'evening'
  return 'night'
}

/**
 * Recomputes the current phase once per minute. The phase only flips four
 * times a day, but polling at this rate keeps the logic dead simple — there's
 * no boundary-alignment math, and React's primitive-equality bail-out means
 * the actual re-render only fires when the phase value changes.
 *
 * SSR returns 'work' (the same default the mascot's `phase` prop falls back
 * to), so the server and the first client render agree.
 */
export function useDayPhase(): DayPhase {
  const [phase, setPhase] = useState<DayPhase>('work')
  useEffect(() => {
    setPhase(computeDayPhase())
    const interval = setInterval(() => setPhase(computeDayPhase()), 60_000)
    return () => clearInterval(interval)
  }, [])
  return phase
}
