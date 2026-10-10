'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { InkArchive } from '@/components/icons/huddle-icons'
import type { ScheduleOutcome } from '@/lib/brain-dump/schedule'
import type { BrainDumpDraft } from '@/lib/brain-dump/types'
import { formatMonthDay, formatSlot } from './brain-dump-utils'
import { PenguinArt, type PenguinPose } from './penguin-art'
import styles from './brain-dump.module.css'

const TINTS = [styles.tint1, styles.tint2, styles.tint3]
export const STAGGER = 200
export const FIRST_DELAY = 160
const DROP_MS = 600
/** How long the "into the inbox" animation runs before the panel closes. */
export const STOW_MS = 700

interface PreviewProps {
  drafts: BrainDumpDraft[]
  excluded: Set<string>
  selectedId: string | null
  headline: string
  /** A gentle secondary line (AI fallback / daily limit). */
  notice?: string
  finalPose: PenguinPose
  inboxName: string
  /** Notes whose write failed (marked, kept for retry). */
  failedIds?: Set<string>
  /** Where each ticked note lands on the calendar (schedule.ts); a note with
   *  no entry, or an entry with neither slot nor reason, is just "to the inbox". */
  plan: Map<string, ScheduleOutcome>
  /** The clock the plan was made with (「今天」「明天」 labels). */
  now: Date
  /** True once everything is written: notes slide into the inbox. */
  stowing?: boolean
  onToggle: (id: string) => void
  onSelect: (id: string | null) => void
}

/**
 * Penguin + headline, then the notes as a little stack of paper, then the
 * 未分類 inbox tray they will go into. On mount every note flies out of the
 * penguin and lands in the stack (the penguin nods per landing); after a
 * successful write they slide down into the tray.
 */
export function BrainDumpPreview({
  drafts, excluded, selectedId, headline, notice, finalPose, inboxName, failedIds, plan, now, stowing, onToggle, onSelect,
}: PreviewProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const penguinRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(false)
  const order = useMemo(() => new Map(drafts.map((d, i) => [d.id, i])), [drafts])

  // Before the first paint: aim every note's start offset at the penguin.
  useLayoutEffect(() => {
    const root = rootRef.current
    const penguin = penguinRef.current
    if (!root || !penguin) return
    const p = penguin.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>('[data-bd-note]').forEach((el) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--fx', `${p.left + p.width / 2 - (r.left + r.width / 2)}px`)
      el.style.setProperty('--fy', `${p.top + p.height * 0.3 - (r.top + r.height / 2)}px`)
    })
  }, [])

  // When stowing: aim each note at the inbox tray.
  useLayoutEffect(() => {
    if (!stowing) return
    const root = rootRef.current
    const tray = trayRef.current
    if (!root || !tray) return
    const b = tray.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>('[data-bd-note]').forEach((el) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--tx', `${b.left + b.width / 2 - (r.left + r.width / 2)}px`)
      el.style.setProperty('--ty', `${b.top + b.height / 2 - (r.top + r.height / 2)}px`)
    })
  }, [stowing])

  useEffect(() => {
    const a = window.setTimeout(() => setSettled(true), FIRST_DELAY + drafts.length * STAGGER + DROP_MS)
    return () => window.clearTimeout(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per preview
  }, [])

  const noteStyle = (d: BrainDumpDraft): CSSProperties => {
    const i = order.get(d.id) ?? 0
    return {
      '--delay': `${FIRST_DELAY + i * STAGGER}ms`,
      '--stow-delay': `${i * 70}ms`,
      '--r': `${(i % 2 ? 1 : -1) * (6 + (i % 3) * 3)}deg`,
      '--tilt': `${[-0.8, 0.6, -0.4, 0.8, -0.6][i % 5]}deg`,
    } as CSSProperties
  }

  return (
    <div ref={rootRef} className={cn(styles.root, 'relative mt-1')}>
      <div className="flex items-center gap-3">
        <div
          ref={penguinRef}
          aria-hidden="true"
          className={cn('relative z-20 h-[76px] w-[76px] flex-shrink-0', !settled && styles.penguinNod)}
          style={{ '--nods': Math.max(1, drafts.length), '--nod-delay': `${FIRST_DELAY + 300}ms` } as CSSProperties}
        >
          <PenguinArt pose={settled ? finalPose : 'carry'} />
        </div>
        <div role="status" className="min-w-0">
          <p className="text-sm font-medium text-foreground">{headline}</p>
          {notice && <p className="mt-1 text-xs text-primary" data-bd-notice>{notice}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">{t('點便條可以改標題、期限和時間；不想要的取消勾選就好。')}</p>
        </div>
      </div>

      <div role="list" aria-label={t('拆好的待辦')} className="mt-4 flex flex-col gap-3">
        {drafts.map((d) => (
          <NoteCard
            key={d.id}
            draft={d}
            off={excluded.has(d.id)}
            failed={!!failedIds?.has(d.id)}
            outcome={plan.get(d.id)}
            now={now}
            selected={selectedId === d.id}
            className={cn('relative min-h-11', stowing ? styles.stow : !settled && styles.drop)}
            style={noteStyle(d)}
            tint={TINTS[(order.get(d.id) ?? 0) % 3]}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* The inbox the notes go into. */}
      <div
        ref={trayRef}
        data-bd-inbox
        className={cn(styles.inbox, 'mt-5 flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-2.5', stowing && styles.inboxGlow)}
      >
        <InkArchive className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 text-xs">
          <p className="font-medium text-foreground">{t('會放進「{name}」', { name: inboxName })}</p>
          <p className="text-muted-foreground">{t('之後在任務清單慢慢整理就好。')}</p>
        </div>
      </div>
    </div>
  )
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
  draft, off, failed, outcome, now, selected, className, style, tint, onToggle, onSelect,
}: {
  draft: BrainDumpDraft
  off: boolean
  failed?: boolean
  outcome?: ScheduleOutcome
  now: Date
  selected: boolean
  className?: string
  style?: CSSProperties
  tint: string
  onToggle: (id: string) => void
  onSelect: (id: string | null) => void
}) {
  const { t, lang } = useI18n()
  const id = draft.id
  const slot = off ? undefined : outcome?.slot
  const reason = off ? undefined : outcome?.reason
  return (
    <div
      role="listitem"
      data-bd-note={id}
      data-bd-due={draft.dueDate ?? ''}
      data-bd-when={slot ? `${slot.date} ${slot.start}-${slot.end}` : undefined}
      data-bd-no-slot={reason}
      data-off={off ? '' : undefined}
      data-bd-failed={failed ? '' : undefined}
      data-selected={selected ? '' : undefined}
      className={cn(styles.note, tint, 'flex items-stretch rounded-[7px]', className)}
      style={style}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={!off}
        aria-label={off ? t('要這件：{title}', { title: draft.title }) : t('不要這件：{title}', { title: draft.title })}
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
        aria-label={t('調整「{title}」', { title: draft.title })}
        className="flex min-w-0 flex-1 flex-col justify-center py-1.5 pr-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span data-bd-title className={cn('truncate text-[13px] font-medium leading-tight', off && 'line-through')}>{draft.title}</span>
        <span className="truncate text-[11px] leading-tight tabular-nums opacity-70">
          {draft.dueDate ? t('{date} 前', { date: formatMonthDay(draft.dueDate, lang) }) : t('沒有期限')}
          {draft.note ? ` · ${draft.note}` : ''}
        </span>
        {slot && (
          <span className="mt-0.5 flex items-start gap-1 text-[11px] font-medium leading-tight text-primary">
            <CalendarClock className="mt-px h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 tabular-nums">
              {formatSlot(slot, now, lang, t)}
              {slot.conflict ? <span className="font-normal opacity-80">{` · ${t('跟已有的行程重疊')}`}</span> : null}
            </span>
          </span>
        )}
        {reason && (
          <span className="mt-0.5 text-[11px] leading-tight opacity-70">
            {reason === 'past' ? t('時間已過，先不排') : t('那個時段沒有空檔，先不排')}
          </span>
        )}
        {failed && <span className="truncate text-[11px] leading-tight text-primary">{t('這張還沒放進去')}</span>}
      </button>
    </div>
  )
}
