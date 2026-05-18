'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CurrentTimeLineProps {
  calendarStartHour?: number
  startHour?: number // alias for calendarStartHour
  compact?: boolean // for week view - simpler line without left offset
}

export function CurrentTimeLine({ calendarStartHour, startHour, compact }: CurrentTimeLineProps) {
  const effectiveStartHour = startHour ?? calendarStartHour ?? 7
  const [position, setPosition] = useState<number | null>(null)

  useEffect(() => {
    const updatePosition = () => {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()

      // Only show if current time is within calendar view
      if (currentHour >= effectiveStartHour && currentHour < 23) {
        const totalMinutes = currentHour * 60 + currentMinute
        const startMinutes = effectiveStartHour * 60
        setPosition(totalMinutes - startMinutes)
      } else {
        setPosition(null)
      }
    }

    // Initial update
    updatePosition()

    // Update every minute
    const interval = setInterval(updatePosition, 60000)

    return () => clearInterval(interval)
  }, [effectiveStartHour])

  if (position === null) return null

  return (
    <div
      // High z so the line is visible above task blocks (which use
      // zIndex: column + 1 by default, max ~5 in dense days). Without this
      // the line gets hidden behind today's tasks and looks truncated.
      className="absolute left-0 right-0 z-30 pointer-events-none"
      style={{ top: `${position}px` }}
    >
      {/* Line — compact mode (used inside day-scroll-view / week-view where
          the time gutter is a separate sticky column) spans full width.
          Non-compact mode (time-grid view, which integrates the gutter into
          the same container) leaves room for the labels on the left. */}
      <div
        className={cn(
          'absolute h-[2px] bg-current-time',
          compact ? 'left-0 right-0' : 'left-[52px] right-0',
        )}
      />

      {/* Dot — anchored to the line's left edge so it stays touching the
          line regardless of compact mode. */}
      <div
        className={cn(
          'absolute w-3 h-3 rounded-full bg-current-time current-time-dot',
          compact ? '-left-1.5' : 'left-[46px]',
        )}
        style={{ top: '-5px' }}
      />
    </div>
  )
}
