'use client'

import { useEffect, useState } from 'react'

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
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${position}px` }}
    >
      {/* Line */}
      <div className={compact ? "absolute left-0 right-0 h-[2px] bg-red-500" : "absolute left-[52px] right-0 h-[2px] bg-red-500"} />

      {/* Dot - only show in non-compact mode */}
      {!compact && (
        <div
          className="absolute left-[46px] w-3 h-3 rounded-full bg-red-500 current-time-dot"
          style={{ top: '-5px' }}
        />
      )}
    </div>
  )
}
