'use client'

import { forwardRef, useMemo } from 'react'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { toDateString, taskOccursOnDate } from '@/lib/calendar-utils'
import { isLightColor } from '@/lib/utils'
import { toDarkDisplayColor } from '@/lib/palette'
import { taskDisplayTitle } from '@/lib/task-display'
import { useShowCategoryPrefix } from '@/components/category-prefix-context'
import type { Workspace, Task, TimeBlock } from '@/lib/types'
import { useI18n } from '@/lib/i18n/react'
import type { Lang } from '@/lib/i18n'
import { format } from 'date-fns'

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

/** "5/11(週一)" / "5/11 Mon" — compact label good for column heads. */
function dayLabel(d: Date, lang: Lang): string {
  if (lang === 'en') return format(d, 'M/d EEE')
  return `${d.getMonth() + 1}/${d.getDate()} 週${WEEKDAY_LABELS[d.getDay()]}`
}

/** "2026/5/11 — 2026/5/17" / "May 11 – 17, 2026" — header title. */
function rangeLabel(start: Date, end: Date, lang: Lang): string {
  if (toDateString(start) === toDateString(end)) {
    if (lang === 'en') return format(start, 'MMM d, yyyy')
    return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}`
  }
  if (lang === 'en') {
    const sameYear = start.getFullYear() === end.getFullYear()
    return sameYear
      ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
      : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
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
    const { t, lang } = useI18n()
    const days = useMemo(() => enumerateDays(startDate, endDate), [startDate, endDate])
    const isDark = options.theme === 'dark'
    // Same category-prefix decoration the live calendar uses, so an exported
    // event reads "分類｜任務" exactly like it does on screen.
    const showCategoryPrefix = useShowCategoryPrefix()
    // Computed outside the loop below — that loop's `for (const t of ...)`
    // shadows this file's `t` (translate) with the task variable, so the
    // translation must be resolved before entering it.
    const untitledTaskLabel = t('（未命名）')

    // Flatten all scheduled items (tasks + time blocks) into a single list
    // keyed by date so each day column can grab its slice in O(1).
    const itemsByDate = useMemo(() => {
      const byDate = new Map<string, ScheduledItem[]>()

      for (const ws of workspaces) {
        if (ws.isArchived) continue
        for (const cat of ws.categories) {
          if (cat.isArchived) continue
          for (const t of cat.tasks) {
            if (!t.scheduledStartTime || !t.scheduledEndTime) continue
            // Expand recurrence: a weekly/daily task stores one base record
            // and its other occurrences are virtual, computed at render time.
            // Walk each day in range and ask the same predicate the live
            // calendar uses (handles interval / daysOfWeek / exdates / endDate)
            // so recurring tasks land on every matching day, not just the base.
            const title = taskDisplayTitle(
              { title: t.title || untitledTaskLabel, categoryName: cat.name },
              showCategoryPrefix,
            )
            const startMin = timeToMinutes(t.scheduledStartTime)
            const endMin = timeToMinutes(t.scheduledEndTime)
            const rawColor = t.calendarColor || ws.color
            const color = isDark ? toDarkDisplayColor(rawColor) ?? rawColor : rawColor
            for (const d of days) {
              if (!taskOccursOnDate(t, d)) continue
              const dateStr = toDateString(d)
              const item: ScheduledItem = {
                // Unique per day — the same recurring task renders on several
                // days, so the bare task id would collide as a React key.
                id: `${t.id}-${dateStr}`,
                date: dateStr,
                startMin,
                endMin,
                color,
                title,
                notes: t.notes,
                isBlock: false,
                isMeeting: t.isMeeting === true,
              }
              const arr = byDate.get(dateStr) ?? []
              arr.push(item)
              byDate.set(dateStr, arr)
            }
          }
        }
      }

      for (const b of timeBlocks) {
        // Render time blocks on their own date only — matches the live
        // calendar's `tb.date === dateStr` filter (week-view.tsx:274,
        // day-scroll-view.tsx:365). The previous code stamped recurring
        // blocks on every day in range; that produced a misleading export
        // showing e.g. lunch on days the user never had lunch scheduled.
        // Until a proper RRULE expander ships, parity beats convenience.
        const inRange = days.some((d) => toDateString(d) === b.date)
        if (!inRange) continue
        const item: ScheduledItem = {
          id: b.id,
          date: b.date,
          startMin: timeToMinutes(b.startTime),
          endMin: timeToMinutes(b.endTime),
          color: isDark ? toDarkDisplayColor(b.color) ?? b.color : b.color,
          title: b.label,
          isBlock: true,
          isMeeting: false,
        }
        const arr = byDate.get(b.date) ?? []
        arr.push(item)
        byDate.set(b.date, arr)
      }

      return byDate
    }, [workspaces, timeBlocks, days, showCategoryPrefix, isDark, untitledTaskLabel])

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
                {rangeLabel(startDate, endDate, lang)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: textMuted }}>{t('共 {count} 天', { count: days.length })}</div>
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
                {dayLabel(d, lang)}
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
                    options={options}
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
          <span>{t('以 Huddle 規劃 · huddle.app')}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {lang === 'en'
              ? `Exported ${format(new Date(), 'M/d/yyyy')}`
              : `匯出於 ${new Date().getFullYear()}/${new Date().getMonth() + 1}/${new Date().getDate()}`}
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
  options,
  isDark,
}: {
  item: ScheduledItem
  startHour: number
  endHour: number
  options: CalendarExportViewOptions
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

  // Mirror the live calendar's color language so the export reads the same:
  //  • Tasks  → solid workspace color + contrasting text (task-block.tsx).
  //  • Blocks → soft diagonal stripes over the surface (time-block-item.tsx).
  const colorIsLight = isLightColor(item.color)

  // ── Time blocks: translucent striped slab, muted text ──────────────────
  if (item.isBlock) {
    const blockText = isDark ? '#d6d2c6' : '#6b6155'
    return (
      <div
        style={{
          position: 'absolute',
          top,
          left: 4,
          right: 4,
          height: height - 2,
          borderRadius: 8,
          background: `repeating-linear-gradient(135deg, ${item.color}40, ${item.color}40 8px, ${item.color}22 8px, ${item.color}22 16px)`,
          border: `1px solid ${item.color}55`,
          overflow: 'hidden',
          padding: isShort ? '2px 6px' : '4px 8px',
          boxSizing: 'border-box',
        }}
      >
        {options.showTitles && (
          <div
            style={{
              fontSize: isShort ? 10 : 11,
              fontWeight: 600,
              color: blockText,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.title}
          </div>
        )}
      </div>
    )
  }

  // ── Tasks: solid color block, white-or-dark text by luminance ──────────
  const textColor = colorIsLight ? '#2a2a2a' : '#ffffff'
  const subColor = colorIsLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.78)'
  // Meeting stripes / inset ring flip tone on pale colors to stay visible,
  // matching task-block.tsx's luminance logic.
  const stripeColor = colorIsLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)'
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 4,
        right: 4,
        height: height - 2,
        borderRadius: 8,
        backgroundColor: item.color,
        // Meeting tasks: inset ring for the "double border" feel, tone
        // chosen by luminance so it reads on both dark and pale colors.
        boxShadow: item.isMeeting
          ? `inset 0 0 0 2px ${colorIsLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.45)'}${isDark ? '' : ', 0 1px 2px rgba(0,0,0,0.10)'}`
          : isDark
          ? 'none'
          : '0 1px 2px rgba(0,0,0,0.10)',
        overflow: 'hidden',
        padding: isShort ? '2px 6px' : '4px 8px',
        boxSizing: 'border-box',
      }}
    >
      {/* Meeting-only: low-contrast diagonal hatch over the solid color, the
          same texture cue the live calendar uses. */}
      {item.isMeeting && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(45deg, ${stripeColor} 0 6px, transparent 6px 14px)`,
          }}
        />
      )}

      {/* Meeting-only: small icon badge, top-right. Always on, even in
          privacy mode — the "this is a meeting" signal is worth keeping. */}
      {item.isMeeting && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colorIsLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          {/* Hand-drawn SVG instead of a lucide component — html-to-image's
              font path doesn't always pick up icon fonts; an inline SVG
              renders identically every time. */}
          <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke={textColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                color: textColor,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </div>
            {!isShort && (
              <div
                style={{
                  fontSize: 9,
                  color: subColor,
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
                  color: subColor,
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
          // Privacy mode: solid color slab with no title — the color alone
          // conveys which workspace owns the slot, same as the calendar.
          <div style={{ width: '100%', height: '100%' }} />
        )}
      </div>
    </div>
  )
}
