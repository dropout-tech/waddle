'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { PenguinArt } from './penguin-art'
import { toMinutes } from '@/lib/brain-dump/plan'
import type { BusyInterval, DayPlan, PlannedItem } from '@/lib/brain-dump/types'
import { formatDay, formatDuration, formatMonthDay } from './brain-dump-utils'
import styles from './brain-dump.module.css'

const TINTS = [styles.tint1, styles.tint2, styles.tint3]
const STAGGER = 140
const FIRST_DELAY = 180
const MIN_NOTE_PX = 28

interface PreviewProps {
  plan: DayPlan
  items: PlannedItem[]
  busy: BusyInterval[]
  now: Date
  excluded: Set<string>
  selectedId: string | null
  isMobile: boolean
  onToggle: (id: string) => void
  onSelect: (id: string | null) => void
}

/**
 * Today's mini timeline + the 待排 tray. On mount every note flies out of
 * the penguin (offsets measured in a layout effect so it works at any
 * size / scroll position) and lands in its slot, one after another.
 */
export function BrainDumpPreview({ plan, items, busy, now, excluded, selectedId, isMobile, onToggle, onSelect }: PreviewProps) {
  const { t, lang } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const penguinRef = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
  const [happy, setHappy] = useState(false)

  const pxPerMin = isMobile ? 0.9 : 1
  const timed = items.filter((x) => x.status === 'scheduled' && x.date === plan.today && x.start && x.end)
  const tray = items.filter((x) => !(x.status === 'scheduled' && x.date === plan.today))
  const showTimeline = !plan.late && (timed.length > 0 || plan.full)

  // Hour range: the planning window, stretched to fit anything outside it.
  const range = useMemo(() => {
    let lo = plan.windowStart
    let hi = plan.windowEnd
    for (const x of timed) {
      lo = Math.min(lo, toMinutes(x.start!))
      hi = Math.max(hi, toMinutes(x.end!))
    }
    lo = Math.floor(lo / 60) * 60
    hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60)
    if (hi - lo < 120) hi = Math.min(24 * 60, lo + 120)
    return { lo, hi }
  }, [plan.windowStart, plan.windowEnd, timed])

  const y = (minutes: number) => (minutes - range.lo) * pxPerMin + 10
  const order = useMemo(() => new Map(items.map((x, i) => [x.draft.id, i])), [items])

  // Measure once, before the first paint: scroll to the first note, then
  // point every note's start offset at the penguin.
  useLayoutEffect(() => {
    const root = rootRef.current
    const penguin = penguinRef.current
    if (!root || !penguin) return
    if (scrollRef.current && timed.length) {
      const first = Math.min(...timed.map((x) => toMinutes(x.start!)))
      scrollRef.current.scrollTop = Math.max(0, y(first) - 20)
    }
    const p = penguin.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>('[data-bd-note]').forEach((el) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--fx', `${p.left + p.width / 2 - (r.left + r.width / 2)}px`)
      el.style.setProperty('--fy', `${p.top + p.height / 2 - (r.top + r.height / 2)}px`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first layout only
  }, [])

  useEffect(() => {
    const total = FIRST_DELAY + items.length * STAGGER + 600
    const a = window.setTimeout(() => setSettled(true), total)
    const b = window.setTimeout(() => setHappy(true), total - 200)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per preview
  }, [])

  const noteStyle = (item: PlannedItem): CSSProperties => {
    const i = order.get(item.draft.id) ?? 0
    return { '--delay': `${FIRST_DELAY + i * STAGGER}ms`, '--r': `${(i % 2 ? 1 : -1) * (6 + (i % 3) * 3)}deg` } as CSSProperties
  }

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const hours: number[] = []
  for (let m = range.lo; m <= range.hi; m += 60) hours.push(m)

  const penguin = (
    <div
      ref={penguinRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute -top-14 right-3 z-20 h-14 w-14', !settled && styles.penguinHop)}
      style={{ '--hops': Math.min(14, Math.max(2, items.length * 2)) } as CSSProperties}
    >
      <PenguinArt pose={happy ? 'happy' : 'carry'} />
    </div>
  )

  return (
    <div ref={rootRef} className={cn(styles.root, 'relative pt-16')}>
      {!showTimeline && <div className="relative h-6">{penguin}</div>}

      {showTimeline && (
        <div className="relative rounded-xl border border-border bg-background/70">
          {penguin}
          <div
            ref={scrollRef}
            role="list"
            aria-label={t('今天的時間軸')}
            className="relative overflow-y-auto overscroll-contain"
            style={{ maxHeight: isMobile ? '40dvh' : 'min(50dvh, 460px)' }}
          >
            <div className="relative" style={{ height: (range.hi - range.lo) * pxPerMin + 20 }}>
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
                  const h = Math.max(14, (Math.min(b.end, range.hi) - Math.max(b.start, range.lo)) * pxPerMin)
                  return (
                    <div
                      key={`busy-${i}`}
                      data-bd-busy
                      className={cn(styles.busy, 'absolute left-12 right-2 overflow-hidden rounded-md border border-dashed border-border px-2 text-[10px] leading-[18px] text-muted-foreground')}
                      style={{ top, height: h }}
                    >
                      <span className="truncate">{b.label || t('已有安排')}</span>
                    </div>
                  )
                })}

              {nowMin > range.lo && nowMin < range.hi && (
                <div aria-hidden="true" className={cn(styles.nowLine, 'absolute left-11 right-0 z-10 h-0.5 rounded-full opacity-70')} style={{ top: y(nowMin) }} />
              )}

              {timed.map((item) => {
                const s = toMinutes(item.start!)
                const e = toMinutes(item.end!)
                const h = Math.max(MIN_NOTE_PX, (e - s) * pxPerMin - 2)
                return (
                  <NoteCard
                    key={`${item.draft.id}-t`}
                    item={item}
                    tall={h >= 46}
                    off={excluded.has(item.draft.id)}
                    selected={selectedId === item.draft.id}
                    className={cn('absolute left-12 right-2 z-10', !settled && styles.drop)}
                    style={{ top: y(s), height: h, ...noteStyle(item) }}
                    tint={TINTS[(order.get(item.draft.id) ?? 0) % 3]}
                    meta={`${item.start}–${item.end} · ${formatDuration(item.draft.estimatedMinutes, t)}`}
                    onToggle={onToggle}
                    onSelect={onSelect}
                  />
                )
              })}
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
          <div role="list" className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
            {tray.map((item) => (
              <NoteCard
                key={`${item.draft.id}-p`}
                item={item}
                tall
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

function NoteCard({
  item, tall, off, selected, className, style, tint, meta, onToggle, onSelect,
}: {
  item: PlannedItem
  tall: boolean
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
      className={cn(styles.note, tint, 'flex items-stretch overflow-hidden rounded-lg', className)}
      style={style}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={!off}
        aria-label={off ? t('要這件：{title}', { title: item.draft.title }) : t('不要這件：{title}', { title: item.draft.title })}
        onClick={() => onToggle(id)}
        className="relative flex w-9 flex-shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring before:absolute before:inset-y-[-6px] before:inset-x-0 before:content-['']"
      >
        <span
          className={cn(
            'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
            off ? 'border-current opacity-50' : 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {!off && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onSelect(selected ? null : id)}
        aria-expanded={selected}
        aria-label={t('調整「{title}」', { title: item.draft.title })}
        className={cn(
          'min-w-0 flex-1 pr-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          tall ? 'flex flex-col justify-center py-1.5' : 'flex items-center gap-2',
        )}
      >
        <span className={cn('truncate text-[13px] font-medium leading-tight', off && 'line-through')}>{item.draft.title}</span>
        <span className={cn('truncate text-[11px] leading-tight opacity-70 tabular-nums', !tall && 'ml-auto flex-shrink-0')}>
          {meta}
          {item.draft.dueDate && tall ? ` · ${t('{date} 前', { date: formatMonthDay(item.draft.dueDate, lang) })}` : ''}
        </span>
        {item.conflict && tall && <span className="text-[11px] leading-tight text-primary">{t('跟已有的行程重疊')}</span>}
      </button>
    </div>
  )
}
