'use client'

import type { PeerEvent } from '@/hooks/use-calendar-sharing'
import { useDisplayColor } from '@/hooks/use-display-color'

/**
 * Read-only rendering of a peer's shared event on the timeline views
 * (week-view / day-scroll-view). Deliberately has NO click / drag / resize
 * handlers — the peer's calendar is view-only by design. Visual language:
 * dashed border + desaturated translucent fill so it can never be mistaken
 * for one of the viewer's own (editable) blocks.
 *
 * `data-block` is intentional: the day-grid's pointerdown handler skips
 * anything inside [data-block], so pressing on a peer event doesn't start
 * the "drag empty grid to create a slot" flow.
 *
 * The `title` tooltip shows the peer's name only. For busy events the
 * event.title is already a generic label (type name / 「忙碌」) — the real
 * title never left the database.
 */
export function PeerEventBlock({
  event,
  top,
  height,
  column = 0,
  totalColumns = 1,
}: {
  event: PeerEvent
  top: number | string
  height: number | string
  column?: number
  totalColumns?: number
}) {
  const displayColor = useDisplayColor()
  const color = displayColor(event.calendarColor) ?? event.calendarColor
  const widthPct = 100 / Math.max(totalColumns, 1)
  const leftPct = column * widthPct

  return (
    <div
      data-block
      data-peer-event={event.detail}
      title={event.peerName}
      aria-label={event.peerName}
      className="absolute rounded border-2 border-dashed px-1.5 py-0.5 text-[10px] font-medium overflow-hidden select-none saturate-[.55] opacity-90 pointer-events-auto"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: `${color}26`,
        borderColor: color,
        color: 'var(--foreground)',
      }}
    >
      <div className="truncate">{event.title}</div>
      {event.scheduledStartTime && event.scheduledEndTime && (
        <div className="text-[9px] font-mono opacity-60">
          {event.scheduledStartTime}-{event.scheduledEndTime}
        </div>
      )}
      <div className="text-[9px] opacity-60 truncate">{event.peerName}</div>
    </div>
  )
}
