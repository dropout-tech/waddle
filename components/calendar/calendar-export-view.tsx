'use client'

import { forwardRef, useMemo } from 'react'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task, TimeBlock } from '@/lib/types'

export interface CalendarExportViewOptions {
  /** Show task titles. If false, blocks render as solid-color slabs only
   *  (workspace color preserved) so a user can share their schedule
   *  shape without exposing what's on it. */
  showTitles: boolean
  /** Show notes preview under titles (only when showTitles is on). */
  showNotes: boolean
  /** Light or dark variant. Picked to match the app's theme system. */
  theme: 'light' | 'dark'
}

interface CalendarExportViewProps {
  workspaces: Workspace[]
  timeBlocks: TimeBlock[]
  startDate: Date
  endDate: Date
  startHour: number
  endHour: number
  options: CalendarExportViewOptions
}

const EXPORT_WIDTH_PX = 1080
const HEADER_HEIGHT_PX = 88
const DAY_LABEL_HEIGHT_PX = 36
const FOOTER_HEIGHT_PX = 36
const TIME_COL_WIDTH_PX = 56
const HOUR_PX = 72 // pixels per hour in the time grid
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Walk inclusive day range from start to end. */
function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const stop = new Date(end)
  stop.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= stop.getTime()) {
    out.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** "5/11(週一)" — compact label good for column heads. */
function dayLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} 週${WEEKDAY_LABELS[d.getDay()]}`
}

/** "2026/5/11 — 2026/5/17" — header title. */
function rangeLabel(start: Date, end: Date): string {
  if (toDateString(start) === toDateString(end)) {
    return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}`
  }
  return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()} — ${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`
}

interface ScheduledItem {
  id: string
  date: string // YYYY-MM-DD
  startMin: number
  endMin: number
  color: string
  title: string
  notes?: string
  /** True for non-task time blocks; we render them with a softer style. */
  isBlock: boolean
  /** Meeting tasks get a hatch overlay + icon badge in the export image. */
  isMeeting: boolean
}

/**
 * Off-screen-friendly renderer for share-as-image. Rendered at a fixed
 * 1080px width regardless of viewport so the captured PNG is consistent
 * across devices. Visual styling is kept inline-tight on the wrapper and
 * uses Tailwind for the rest — html-to-image inlines computed styles so
 * Tailwind utility classes survive the capture.
 *
 * Ref is forwarded so the parent can hand the underlying div directly to
 * html-to-image without going through a DOM query.
 */
export const CalendarExportView = forwardRef<HTMLDivElement, CalendarExportViewProps>(
  function CalendarExportView({ workspaces, timeBlocks, startDate, endDate, startHour, endHour, options }, ref) {
    const days = useMemo(() => enumerateDays(startDate, endDate), [startDate, endDate])
    const isDark = options.theme === 'dark'

    // Flatten all scheduled items (tasks + time blocks) into a single list
    // keyed by date so each day column can grab its slice in O(1).
    const itemsByDate = useMemo(() => {
      const byDate = new Map<string, ScheduledItem[]>()

      for (const ws of workspaces) {
        if (ws.isArchived) continue
        for (const cat of ws.categories) {
          if (cat.isArchived) continue
          for (const t of cat.tasks) {
            if (!t.scheduledDate || !t.scheduledStartTime || !t.scheduledEndTime) continue
            const item: ScheduledItem = {
              id: t.id,
              date: t.scheduledDate,
              startMin: timeToMinutes(t.scheduledStartTime),
              endMin: timeToMinutes(t.scheduledEndTime),
              color: t.calendarColor || ws.color,
              title: t.title || '（未命名）',
              notes: t.notes,
              isBlock: false,
              isMeeting: t.isMeeting === true,
            }
            const arr = byDate.get(t.scheduledDate) ?? []
            arr.push(item)
            byDate.set(t.scheduledDate, arr)
          }
        }
      }

      for (const b of timeBlocks) {
        // Skip non-recurring blocks outside the visible range — saves work
        // and keeps the visual output clean.
        const inRange = days.some((d) => toDateString(d) === b.date)
        if (!inRange && !b.isRecurring) continue
        // Recurring rendering is approximate — Waddle's time blocks for
        // lunch/buffer get rendered every day in-range. Not exact RRULE
        // but matches what users see in the app today.
        const targetDates = b.isRecurring ? days.map(toDateString) : [b.date]
        for (const date of targetDates) {
          const item: ScheduledItem = {
            id: `${b.id}-${date}`,
            date,
            startMin: timeToMinutes(b.startTime),
            endMin: timeToMinutes(b.endTime),
            color: b.color,
            title: b.label,
            isBlock: true,
            isMeeting: false,
          }
          const arr = byDate.get(date) ?? []
          arr.push(item)
          byDate.set(date, arr)
        }
      }

      return byDate
    }, [workspaces, timeBlocks, days])

    const hourSpan = Math.max(1, endHour - startHour)
    const gridHeight = hourSpan * HOUR_PX
    const dayColWidth = (EXPORT_WIDTH_PX - TIME_COL_WIDTH_PX) / days.length

    const bgColor = isDark ? '#1f2024' : '#fffdf7'
    const surfaceColor = isDark ? '#26272b' : '#ffffff'
    const borderColor = isDark ? '#3a3b40' : '#e9e1d0'
    const subtleBorder = isDark ? '#2e2f33' : '#f0e8d5'
    const textPrimary = isDark ? '#f5f1e6' : '#2a2a2a'
    const textMuted = isDark ? '#9ca0a8' : '#7a6f5a'
    const brandYellow = '#f4d977'

    return (
      <div
        ref={ref}
        style={{
          width: EXPORT_WIDTH_PX,
          backgroundColor: bgColor,
          color: textPrimary,
          fontFamily:
            'var(--font-noto-sans-tc), var(--font-geist), system-ui, -apple-system, "Segoe UI", sans-serif',
          // Subtle inner padding so the captured PNG has breathing room
          // around the calendar grid rather than running edge-to-edge.
          padding: 32,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: HEADER_HEIGHT_PX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: brandYellow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WaddleMascot className="w-9 h-9" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: textMuted, letterSpacing: 1 }}>
                MY SCHEDULE
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: textPrimary, marginTop: 2 }}>
                {rangeLabel(startDate, endDate)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: textMuted }}>共 {days.length} 天</div>
            <div style={{ fontSize: 11, color: textMuted }}>
              {String(startHour).padStart(2, '0')}:00 — {String(endHour).padStart(2, '0')}:00
            </div>
          </div>
        </div>

        {/* Day labels row */}
        <div style={{ display: 'flex', height: DAY_LABEL_HEIGHT_PX, alignItems: 'center' }}>
          <div style={{ width: TIME_COL_WIDTH_PX }} />
          {days.map((d, i) => {
            const isToday = toDateString(d) === toDateString(new Date())
            return (
              <div
                key={i}
                style={{
                  width: dayColWidth,
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? brandYellow : textMuted,
                  borderLeft: i === 0 ? 'none' : `1px solid ${subtleBorder}`,
                }}
              >
                {dayLabel(d)}
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            height: gridHeight,
            borderTop: `1px solid ${borderColor}`,
            borderBottom: `1px solid ${borderColor}`,
            backgroundColor: surfaceColor,
            overflow: 'hidden',
            borderRadius: 12,
          }}
        >
          {/* Hour labels column */}
          <div
            style={{
              width: TIME_COL_WIDTH_PX,
              position: 'relative',
              borderRight: `1px solid ${subtleBorder}`,
              flexShrink: 0,
            }}
          >
            {Array.from({ length: hourSpan + 1 }, (_, i) => {
              const hour = startHour + i
              if (i === hourSpan) return null // skip last label — it's the bottom edge
              return (
                <div
                  key={hour}
                  style={{
                    position: 'absolute',
                    top: i * HOUR_PX,
                    right: 6,
                    fontSize: 10,
                    color: textMuted,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              )
            })}
          </div>

          {/* Hour grid lines spanning all day columns. Drawn as absolutely
              positioned horizontal rules so they line up exactly with the
              hour labels regardless of where day columns split. */}
          <div style={{ position: 'absolute', left: TIME_COL_WIDTH_PX, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}>
            {Array.from({ length: hourSpan }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: (i + 1) * HOUR_PX,
                  left: 0,
                  right: 0,
                  borderTop: `1px dashed ${subtleBorder}`,
                }}
              />
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, i) => {
            const dateStr = toDateString(d)
            const items = itemsByDate.get(dateStr) ?? []
            return (
              <div
                key={i}
                style={{
                  width: dayColWidth,
                  position: 'relative',
                  borderLeft: i === 0 ? 'none' : `1px solid ${subtleBorder}`,
                  flexShrink: 0,
                }}
              >
                {items.map((it) => (
                  <ItemBlock
                    key={it.id}
                    item={it}
                    startHour={startHour}
                    endHour={endHour}
                    columnWidth={dayColWidth}
                    options={options}
                    surfaceColor={surfaceColor}
                    textPrimary={textPrimary}
                    isDark={isDark}
                  />
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer / watermark */}
        <div
          style={{
            height: FOOTER_HEIGHT_PX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
            fontSize: 11,
            color: textMuted,
          }}
        >
          <span>以 Waddle 規劃 · waddle.app</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            匯出於 {new Date().getFullYear()}/{new Date().getMonth() + 1}/{new Date().getDate()}
          </span>
        </div>
      </div>
    )
  },
)

function ItemBlock({
  item,
  startHour,
  endHour,
  columnWidth,
  options,
  surfaceColor,
  textPrimary,
  isDark,
}: {
  item: ScheduledItem
  startHour: number
  endHour: number
  columnWidth: number
  options: CalendarExportViewOptions
  surfaceColor: string
  textPrimary: string
  isDark: boolean
}) {
  const startBoundMin = startHour * 60
  const endBoundMin = endHour * 60
  const visibleStart = Math.max(item.startMin, startBoundMin)
  const visibleEnd = Math.min(item.endMin, endBoundMin)
  if (visibleEnd <= visibleStart) return null

  const minPerPx = 60 / HOUR_PX
  const top = (visibleStart - startBoundMin) / minPerPx
  const height = Math.max(18, (visibleEnd - visibleStart) / minPerPx)
  const isShort = height < 32

  // Soft tint background based on workspace color; full-strength left
  // border keeps the color attribution legible even at thumbnail size.
  const tintAlpha = isDark ? '33' : '22' // ~13% / ~13% — gentle wash
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 4,
        right: 4,
        height: height - 2,
        borderRadius: 8,
        backgroundColor: surfaceColor,
        // Meeting blocks: thicker outer border to make them pop without
        // changing the workspace color. Same hue, just bolder.
        border: item.isMeeting
          ? `2px solid ${item.color}${isDark ? 'bb' : '88'}`
          : `1px solid ${item.color}${isDark ? '88' : '55'}`,
        borderLeft: `${item.isMeeting ? 4 : 3}px solid ${item.color}`,
        boxShadow: isDark ? 'none' : `0 1px 2px rgba(0,0,0,0.04)`,
        overflow: 'hidden',
        padding: isShort ? '2px 6px' : '4px 8px',
        boxSizing: 'border-box',
      }}
    >
      {/* Tinted background wash to make the workspace color readable
          even on tiny blocks. Layered as an absolute overlay so it doesn't
          push other content. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: item.color + tintAlpha,
          pointerEvents: 'none',
        }}
      />

      {/* Meeting-only: diagonal hatch pattern overlay so "this is a
          meeting" reads at a glance even when the image is shared
          downsized. Sits above the tint but below content. */}
      {item.isMeeting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(45deg, ${item.color}${isDark ? '33' : '22'} 0 4px, transparent 4px 10px)`,
          }}
        />
      )}

      {/* Meeting-only: small icon badge in the top-right corner. Always
          on, even when titles are hidden via privacy mode, because the
          "this is a meeting" signal is more useful than not. */}
      {item.isMeeting && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: item.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          {/* Tiny inline Users-icon approximation. Using SVG instead of a
              lucide-react component because html-to-image's font-loading
              path doesn't always pick up icon fonts cleanly; a hand-drawn
              SVG renders identically every time. */}
          <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        {options.showTitles ? (
          <>
            <div
              style={{
                fontSize: isShort ? 10 : 11,
                fontWeight: 600,
                color: textPrimary,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
              {item.isBlock ? '' : ''}
            </div>
            {!isShort && (
              <div
                style={{
                  fontSize: 9,
                  color: textPrimary,
                  opacity: 0.65,
                  marginTop: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(Math.floor(item.startMin / 60)).padStart(2, '0')}:
                {String(item.startMin % 60).padStart(2, '0')} —{' '}
                {String(Math.floor(item.endMin / 60)).padStart(2, '0')}:
                {String(item.endMin % 60).padStart(2, '0')}
              </div>
            )}
            {options.showNotes && !isShort && item.notes && (
              <div
                style={{
                  fontSize: 9,
                  color: textPrimary,
                  opacity: 0.6,
                  marginTop: 2,
                  lineHeight: 1.2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {item.notes}
              </div>
            )}
          </>
        ) : (
          // Privacy mode: no title, just a tiny dot to indicate "something
          // is booked here". Color tint already conveys workspace.
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: item.color,
            }}
          />
        )}
      </div>
    </div>
  )
}
