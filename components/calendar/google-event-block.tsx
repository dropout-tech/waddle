'use client'

import { useState, type ReactNode, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink, FileText, MapPin } from 'lucide-react'
import type { PeerEvent } from '@/hooks/use-calendar-sharing'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/lib/i18n/react'
import { handleExternalAnchorClick } from '@/lib/external-link'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import { meetingPrefillHref } from '@/lib/meeting-followups'

/**
 * The viewer's own Google Calendar events on the calendar views. Read-only:
 * tapping opens a small details popover (title, time, reply status, a link to
 * open the event in Google Calendar) — never the task editor, never a drag.
 *
 * needsAction / tentative replies render lighter (dashed, translucent) so an
 * unanswered invitation reads differently from an accepted meeting.
 *
 * Portal note: React synthetic events bubble through portals to the React
 * parent, so the popover content stops click / pointerdown propagation —
 * otherwise a tap inside it would reach the day grid ("drag to create") or
 * the all-day zone ("tap to create a task").
 */

const stop = (e: SyntheticEvent) => e.stopPropagation()

function isPending(ev: PeerEvent) {
  const r = ev.google?.responseStatus
  return r === 'needsAction' || r === 'tentative'
}

/** Unanswered invitations are the lightest; "maybe" sits between them and accepted. */
function pendingLook(ev: PeerEvent, color: string) {
  const r = ev.google?.responseStatus
  if (r === 'needsAction') return { className: 'border border-dashed opacity-[.55]', background: `${color}0A` }
  if (r === 'tentative') return { className: 'border border-dashed opacity-75', background: `${color}10` }
  return { className: '', background: `${color}24` }
}

/** Small "G" mark so a Google meeting is recognisable without reading anything. */
function GoogleBadge({ size = 12 }: { size?: number }) {
  return (
    <span
      data-google-badge
      aria-hidden
      className="inline-flex flex-shrink-0 items-center justify-center rounded-[3px] font-bold leading-none text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.7), backgroundColor: '#1A73E8' }}
    >
      G
    </span>
  )
}

function useReplyTag(ev: PeerEvent) {
  const { t } = useI18n()
  const r = ev.google?.responseStatus
  return r === 'needsAction' ? t('未回覆') : r === 'tentative' ? t('暫定') : null
}

function useTitle(ev: PeerEvent) {
  const { t } = useI18n()
  return ev.title.trim() ? ev.title : t('（無標題）')
}

function GoogleEventDetails({ event, children }: { event: PeerEvent; children: ReactNode }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const title = useTitle(event)
  const info = event.google!
  const locale = lang === 'en' ? 'en-US' : 'zh-TW'
  const start = new Date(info.startAt), end = new Date(info.endAt)
  const when = info.allDay
    ? `${start.toLocaleDateString(locale, { month: 'short', day: 'numeric', weekday: 'short' })} · ${t('全天')}`
    : `${start.toLocaleString(locale, { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} – ${
        end.toDateString() === start.toDateString()
          ? end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
          : end.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      }`
  const reply =
    info.responseStatus === 'needsAction' ? t('尚未回覆') :
    info.responseStatus === 'tentative' ? t('暫定') :
    info.responseStatus === 'accepted' ? t('已接受') : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-google-event-details
        className="w-72 space-y-2 p-3"
        onClick={stop}
        onPointerDown={stop}
        onPointerUp={stop}
      >
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: event.calendarColor }} aria-hidden />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{when}</p>
          </div>
        </div>
        {info.location && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span className="break-words">{info.location}</span>
          </p>
        )}
        {reply && <p className="text-xs text-foreground/80">{t('你的回覆：{reply}', { reply })}</p>}
        <p className="text-[11px] text-muted-foreground">{t('來自 Google 日曆（唯讀），請到 Google 日曆回覆或修改。')}</p>
        {/* Title + date only: attendees are deliberately never read from Google. */}
        <Link
          href={meetingPrefillHref({ title: event.title, date: info.allDay && /^\d{4}-\d{2}-\d{2}/.test(info.startAt) ? info.startAt.slice(0, 10) : toDateString(start) })}
          data-testid="organize-google-meeting"
          onClick={stop}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-secondary"
        >
          <FileText className="h-4 w-4" aria-hidden />
          {t('整理這場會議')}
        </Link>
        {info.htmlLink && (
          <a
            href={info.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation(); handleExternalAnchorClick(e, info.htmlLink!) }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-primary hover:bg-secondary"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t('在 Google 日曆開啟')}
          </a>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Timed piece on the week / day timeline (positioned by the caller). */
export function GoogleEventBlock({
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
  const { t } = useI18n()
  const title = useTitle(event)
  const replyTag = useReplyTag(event)
  const widthPct = 100 / Math.max(totalColumns, 1)
  const leftPct = column * widthPct
  const pending = isPending(event)
  const color = event.calendarColor
  const look = pendingLook(event, color)
  // Use the height we are given: ≥44px → title may wrap to 2 lines + time
  // row; ≥26px → 1-line title + time row; smaller → title only.
  const h = typeof height === 'number' ? height : 0
  const layout = h >= 44 ? 'tall' : h >= 26 ? 'mid' : 'short'
  return (
    <GoogleEventDetails event={event}>
      <button
        type="button"
        data-block
        data-google-event={event.google?.responseStatus ?? 'none'}
        data-google-layout={layout}
        aria-label={t('Google 日曆：{title}', { title })}
        title={t('Google 日曆：{title}', { title })}
        onClick={stop}
        className={cn(
          'absolute flex flex-col overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-[10px] font-medium leading-[12px] select-none pointer-events-auto',
          look.className,
        )}
        style={{
          top,
          height,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
          backgroundColor: look.background,
          borderColor: color,
          borderLeftStyle: 'solid',
          color: 'var(--foreground)',
        }}
      >
        <div className="flex min-w-0 items-start gap-1">
          <span className="mt-px"><GoogleBadge /></span>
          <span className={cn('min-w-0 break-words', layout === 'tall' ? 'line-clamp-2' : 'truncate', pending && 'italic')}>{title}</span>
        </div>
        {layout !== 'short' && event.scheduledStartTime && event.scheduledEndTime && (
          <div className="flex min-w-0 items-center gap-1 text-[9px] leading-[11px]">
            <span className="font-mono opacity-60">{event.scheduledStartTime}-{event.scheduledEndTime}</span>
            {replyTag && <span data-google-reply-tag className="truncate font-semibold opacity-80">{replyTag}</span>}
          </div>
        )}
      </button>
    </GoogleEventDetails>
  )
}

/** Month-view agenda row (mobile day list under the month grid). */
export function GoogleAgendaRow({ event }: { event: PeerEvent }) {
  const { t } = useI18n()
  const title = useTitle(event)
  const pending = isPending(event)
  const replyTag = useReplyTag(event)
  const color = event.calendarColor
  return (
    <GoogleEventDetails event={event}>
      <button
        type="button"
        data-google-event={event.google?.responseStatus ?? 'none'}
        aria-label={t('Google 日曆：{title}', { title })}
        onClick={stop}
        className={cn('flex w-full items-center gap-3 px-2 min-h-[44px] py-1 text-left', event.google?.responseStatus === 'needsAction' ? 'opacity-[.55]' : pending && 'opacity-75')}
      >
        <span
          className={cn('w-1 self-stretch rounded-full flex-shrink-0', pending && 'border border-dashed bg-transparent')}
          style={pending ? { borderColor: color } : { backgroundColor: color }}
        />
        <span className="text-xs font-mono text-muted-foreground w-[84px] flex-shrink-0">
          {event.scheduledStartTime && event.scheduledEndTime ? `${event.scheduledStartTime}–${event.scheduledEndTime}` : t('全天')}
        </span>
        <span className={cn('text-sm text-foreground/80 truncate flex-1', pending && 'italic')}>{title}</span>
        {replyTag && <span data-google-reply-tag className="text-[10px] font-semibold text-muted-foreground flex-shrink-0">{replyTag}</span>}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
          <GoogleBadge />
          Google
        </span>
      </button>
    </GoogleEventDetails>
  )
}

/** Month-grid chip (non-interactive: a tap selects the day, like peer chips). */
export function GoogleMonthChip({ event }: { event: PeerEvent }) {
  const { t } = useI18n()
  const title = useTitle(event)
  const pending = isPending(event)
  const color = event.calendarColor
  const look = pendingLook(event, color)
  return (
    <div
      data-google-event={event.google?.responseStatus ?? 'none'}
      data-google-month-all-day={event.scheduledStartTime ? undefined : ''}
      title={t('Google 日曆：{title}', { title })}
      className={cn('flex items-center gap-1 px-1 py-0.5 rounded text-[9px] border-l-2 select-none', look.className)}
      style={{ borderColor: color, borderLeftStyle: 'solid', backgroundColor: look.background }}
    >
      <GoogleBadge size={10} />
      <span className={cn('truncate text-foreground/80', pending && 'italic')}>{title}</span>
    </div>
  )
}

/** All-day chip for the week / day header zone. */
export function GoogleAllDayChip({ event, size = 'sm' }: { event: PeerEvent; size?: 'sm' | 'md' }) {
  const { t } = useI18n()
  const title = useTitle(event)
  const pending = isPending(event)
  const color = event.calendarColor
  const look = pendingLook(event, color)
  return (
    <GoogleEventDetails event={event}>
      <button
        type="button"
        data-google-event={event.google?.responseStatus ?? 'none'}
        data-google-all-day
        aria-label={t('Google 日曆：{title}', { title })}
        title={t('Google 日曆：{title}', { title })}
        onClick={stop}
        onPointerDown={stop}
        className={cn(
          'w-full flex-shrink-0 flex items-center gap-1 rounded border-l-[3px] text-left font-medium leading-tight select-none',
          size === 'md' ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-[3px] text-[10px]',
          look.className,
        )}
        style={{ backgroundColor: look.background, borderColor: color, borderLeftStyle: 'solid', color: 'var(--foreground)' }}
      >
        <GoogleBadge />
        <span className={cn('truncate', pending && 'italic')}>{title}</span>
      </button>
    </GoogleEventDetails>
  )
}
