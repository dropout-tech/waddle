'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { toMinutes } from '@/lib/brain-dump/plan'
import type { BusyInterval, DayPlan, PlannedItem } from '@/lib/brain-dump/types'
import { formatDay, formatDuration, formatMonthDay } from './brain-dump-utils'
import { PenguinArt, type PenguinPose } from './penguin-art'
import styles from './brain-dump.module.css'

const TINTS = [styles.tint1, styles.tint2, styles.tint3]
/** Must match --bd-stagger / timings in brain-dump.module.css. */
export const STAGGER = 220
export const FIRST_DELAY = 180
const DROP_MS = 600
/** Every note is two lines and at least one 44px touch row tall. */
const MIN_NOTE_PX = 44
const LABEL_GAP = 12

interface PreviewProps {
  plan: DayPlan
  items: PlannedItem[]
  busy: BusyInterval[]
  now: Date
  excluded: Set<string>
  selectedId: string | null
  isMobile: boolean
  headline: string
  finalPose: PenguinPose
  onToggle: (id: string) => void
  onSelect: (id: string | null) => void
}

/**
 * Penguin + headline on top, today's mini timeline under it, then the 待排
 * tray. On mount every note flies out of the penguin (offsets measured in a
 * layout effect so it works at any size / scroll position) and lands in its
 * slot one after another; the penguin nods once per landing.
 */
export function BrainDumpPreview({
  plan, items, busy, now, excluded, selectedId, isMobile, headline, finalPose, onToggle, onSelect,
}: PreviewProps) {
  const { t, lang } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const penguinRef = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)

  const pxPerMin = isMobile ? 0.9 : 1
  const timed = useMemo(
    () => items.filter((x) => x.status === 'scheduled' && x.date === plan.today && x.start && x.end)
      .sort((a, b) => a.start!.localeCompare(b.start!)),
    [items, plan.today],
  )
  const tray = items.filter((x) => !(x.status === 'scheduled' && x.date === plan.today))
  const showTimeline = !plan.late && (timed.length > 0 || plan.full)

  // Hour range hugs the notes (an hour of air after the last one) instead
  // of the whole planning window, so the card is only as tall as it needs.
  const range = useMemo(() => {
    let lo = timed.length ? Math.min(...timed.map((x) => toMinutes(x.start!))) : plan.windowStart
    let hi = timed.length ? Math.max(...timed.map((x) => toMinutes(x.end!))) + 60 : plan.windowEnd
    lo = Math.floor(Math.min(lo, plan.windowStart) / 60) * 60
    hi = Math.min(24 * 60, Math.ceil(Math.max(hi, lo + 180) / 60) * 60)
    return { lo, hi }
  }, [plan.windowStart, plan.windowEnd, timed])

  const y = (minutes: number) => (minutes - range.lo) * pxPerMin + LABEL_GAP
  const order = useMemo(() => new Map(items.map((x, i) => [x.draft.id, i])), [items])

  // Visual de-overlap: a 15-minute task still gets a full two-line note,
  // so push the next one down a hair instead of stacking them.
  const placedNotes = useMemo(() => {
    const out: { item: PlannedItem; top: number; h: number }[] = []
    for (const item of timed) {
      const s = toMinutes(item.start!)
      const e = toMinutes(item.end!)
      const h = Math.max(MIN_NOTE_PX, (e - s) * pxPerMin - 2)
      const prev = out[out.length - 1]
      const top = Math.max(y(s), prev ? prev.top + prev.h + 3 : -Infinity)
      out.push({ item, top, h })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- y derives from range/pxPerMin
  }, [timed, range, pxPerMin])
  const contentHeight = Math.max(y(range.hi), ...placedNotes.map((n) => n.top + n.h)) + LABEL_GAP

  // Measure once, before the first paint: scroll to the first note (with
  // room for its hour label), then point every note's start offset at the penguin.
  useLayoutEffect(() => {
    const root = rootRef.current
    const penguin = penguinRef.current
    if (!root || !penguin) return
    if (scrollRef.current && placedNotes.length) {
      scrollRef.current.scrollTop = Math.max(0, placedNotes[0].top - 20 - LABEL_GAP)
    }
    const p = penguin.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>('[data-bd-note]').forEach((el) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--fx', `${p.left + p.width / 2 - (r.left + r.width / 2)}px`)
      el.style.setProperty('--fy', `${p.top + p.height * 0.3 - (r.top + r.height / 2)}px`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first layout only
  }, [])

  useEffect(() => {
    const a = window.setTimeout(() => setSettled(true), FIRST_DELAY + items.length * STAGGER + DROP_MS)
    return () => window.clearTimeout(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per preview
  }, [])

  const noteStyle = (item: PlannedItem): CSSProperties => {
    const i = order.get(item.draft.id) ?? 0
    return {
      '--delay': `${FIRST_DELAY + i * STAGGER}ms`,
      '--r': `${(i % 2 ? 1 : -1) * (6 + (i % 3) * 3)}deg`,
      // Resting tilt — paper never sits perfectly square.
      '--tilt': `${[-0.8, 0.6, -0.4, 0.8, -0.6][i % 5]}deg`,
    } as CSSProperties
  }

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const hours: number[] = []
  for (let m = range.lo; m <= range.hi; m += 60) hours.push(m)

  return (
    <div ref={rootRef} className={cn(styles.root, 'relative mt-1')}>
      {/* Penguin + headline */}
      <div className="flex items-center gap-3">
        <div
          ref={penguinRef}
          aria-hidden="true"
          className={cn('relative z-20 h-[76px] w-[76px] flex-shrink-0', !settled && styles.penguinNod)}
          style={{ '--nods': Math.max(1, items.length), '--nod-delay': `${FIRST_DELAY + 300}ms` } as CSSProperties}
        >
          <PenguinArt pose={settled ? finalPose : 'carry'} />
        </div>
        <div role="status" className="min-w-0">
          <p className="text-sm font-medium text-foreground">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('點便條可以改標題、時長和時間；不想要的取消勾選就好。')}</p>
        </div>
      </div>

      {showTimeline && (
        <div className="relative mt-2 rounded-xl border border-border bg-background/70">
          <div
            ref={scrollRef}
            role="list"
            aria-label={t('今天的時間軸')}
            className="relative overflow-y-auto overscroll-contain"
            style={{ maxHeight: isMobile ? 'min(46dvh, 460px)' : 'min(52dvh, 460px)' }}
          >
            <div className="relative" style={{ height: contentHeight }}>
              {hours.map((m) => (
                <div key={m} className="absolute left-0 right-0 flex items-center" style={{ top: y(m) }}>
                  <span className="w-11 -translate-y-1/2 pr-2 text-right text-[10px] tabular-nums text-muted-foreground">
                    {`${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
                  </span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>
              ))}

              {busy
                .filter((b) => b.end > range.lo && b.start < range.hi)
                .map((b, i) => {
                  const top = y(Math.max(b.start, range.lo))
                  const h = Math.max(22, (Math.min(b.end, range.hi) - Math.max(b.start, range.lo)) * pxPerMin)
                  return (
                    <div
                      key={`busy-${i}`}
                      data-bd-busy
                      className={cn(styles.busy, 'absolute left-12 right-2 overflow-hidden rounded-md border border-dashed border-border p-0.5')}
                      style={{ top, height: h }}
                    >
                      {/* Solid chip so the stripes never eat the words. */}
                      <span className="inline-block max-w-full truncate rounded bg-card/95 px-1.5 text-[10px] leading-[16px] text-muted-foreground">
                        {b.label || t('已有安排')}
                      </span>
                    </div>
                  )
                })}

              {nowMin > range.lo && nowMin < range.hi && (
                <div aria-hidden="true" className={cn(styles.nowLine, 'absolute left-11 right-0 z-10 h-0.5 rounded-full opacity-70')} style={{ top: y(nowMin) }} />
              )}

              {placedNotes.map(({ item, top, h }) => (
                <NoteCard
                  key={`${item.draft.id}-t`}
                  item={item}
                  off={excluded.has(item.draft.id)}
                  selected={selectedId === item.draft.id}
                  className={cn('absolute left-12 right-2 z-10', !settled && styles.drop)}
                  style={{ top, height: h, ...noteStyle(item) }}
                  tint={TINTS[(order.get(item.draft.id) ?? 0) % 3]}
                  meta={`${item.start}–${item.end} · ${formatDuration(item.draft.estimatedMinutes, t)}`}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tray.length > 0 && (
        <section className="mt-4" aria-label={t('待排')}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-xs font-semibold text-foreground">{showTimeline ? t('待排') : t('企鵝先放這裡')}</h3>
            <span className="text-[11px] text-muted-foreground">{t('之後再拖進行事曆')}</span>
          </div>
          <div role="list" className="flex flex-col gap-2.5 sm:grid sm:grid-cols-2">
            {tray.map((item) => (
              <NoteCard
                key={`${item.draft.id}-p`}
                item={item}
                off={excluded.has(item.draft.id)}
                selected={selectedId === item.draft.id}
                className={cn('relative min-h-11', !settled && styles.drop)}
                style={noteStyle(item)}
                tint={TINTS[(order.get(item.draft.id) ?? 0) % 3]}
                meta={trayMeta(item, now, lang, t)}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function trayMeta(item: PlannedItem, now: Date, lang: string, t: (s: string, v?: Record<string, string | number>) => string): string {
  const day = formatDay(item.date, now, lang, t)
  const dur = formatDuration(item.draft.estimatedMinutes, t)
  if (item.status === 'scheduled') return `${day} ${item.start}–${item.end} · ${dur}`
  switch (item.reason) {
    case 'full':
      return t('今天塞不下，先放{day}的待排 · {dur}', { day, dur })
    case 'late':
      return t('明天再排 · {dur}', { dur })
    case 'part-passed':
      return t('想排的時段過了，先放待排 · {dur}', { dur })
    case 'past-time':
      return t('{time} 已經過了，先放待排 · {dur}', { time: item.draft.fixedTime ?? '', dur })
    default:
      return t('{day}・待排 · {dur}', { day, dur })
  }
}

/** Hand-drawn tick box: a slightly wobbly square + an overshooting check. */
function InkCheck({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 22 22" className="h-[22px] w-[22px]" aria-hidden="true">
      <path
        d="M4.2 4.8 C8 3.9 13.6 3.6 17.6 4.3 C18.3 8.4 18.2 13.5 17.4 17.7 C13 18.4 8.2 18.3 4.5 17.6 C3.8 13.4 3.7 8.6 4.2 4.8 Z"
        fill={checked ? 'currentColor' : 'none'}
        fillOpacity={checked ? 0.14 : 0}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity={checked ? 1 : 0.55}
      />
      {checked && (
        <path d="M6.6 11.4 L9.6 14.6 L16.4 6.4 L17.6 5.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function NoteCard({
  item, off, selected, className, style, tint, meta, onToggle, onSelect,
}: {
  item: PlannedItem
  off: boolean
  selected: boolean
  className?: string
  style?: CSSProperties
  tint: string
  meta: string
  onToggle: (id: string) => void
  onSelect: (id: string | null) => void
}) {
  const { t, lang } = useI18n()
  const id = item.draft.id
  return (
    <div
      role="listitem"
      data-bd-note={id}
      data-bd-status={item.status}
      data-bd-date={item.date}
      data-bd-start={item.start ?? ''}
      data-bd-end={item.end ?? ''}
      data-off={off ? '' : undefined}
      data-selected={selected ? '' : undefined}
      className={cn(styles.note, tint, 'flex items-stretch rounded-[7px]', className)}
      style={style}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={!off}
        aria-label={off ? t('要這件：{title}', { title: item.draft.title }) : t('不要這件：{title}', { title: item.draft.title })}
        onClick={() => onToggle(id)}
        className={cn(
          'relative flex w-11 min-h-11 flex-shrink-0 items-center justify-center self-stretch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          off ? 'text-current' : 'text-primary',
        )}
      >
        <InkCheck checked={!off} />
      </button>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : id)}
        aria-expanded={selected}
        aria-label={t('調整「{title}」', { title: item.draft.title })}
        className="flex min-w-0 flex-1 flex-col justify-center py-1 pr-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className={cn('truncate text-[13px] font-medium leading-tight', off && 'line-through')}>{item.draft.title}</span>
        <span className="truncate text-[11px] leading-tight tabular-nums opacity-70">
          {meta}
          {item.draft.dueDate ? ` · ${t('{date} 前', { date: formatMonthDay(item.draft.dueDate, lang) })}` : ''}
        </span>
        {item.conflict && <span className="truncate text-[11px] leading-tight text-primary">{t('跟已有的行程重疊')}</span>}
      </button>
    </div>
  )
}
