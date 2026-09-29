'use client'

import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react'
import type { PeerEvent } from '@/hooks/use-calendar-sharing'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/lib/i18n/react'
import { handleExternalAnchorClick } from '@/lib/external-link'
import { cn } from '@/lib/utils'

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
  const widthPct = 100 / Math.max(totalColumns, 1)
  const leftPct = column * widthPct
  const pending = isPending(event)
  const color = event.calendarColor
  return (
    <GoogleEventDetails event={event}>
      <button
        type="button"
        data-block
        data-google-event={event.google?.responseStatus ?? 'none'}
        aria-label={t('Google 日曆：{title}', { title })}
        title={t('Google 日曆：{title}', { title })}
        onClick={stop}
        className={cn(
          'absolute overflow-hidden rounded border-l-[3px] px-1.5 py-0.5 text-left text-[10px] font-medium select-none pointer-events-auto',
          pending && 'border border-dashed border-l-[3px] opacity-70',
        )}
        style={{
          top,
          height,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
          backgroundColor: pending ? `${color}10` : `${color}24`,
          borderColor: color,
          color: 'var(--foreground)',
        }}
      >
        <div className="flex items-center gap-1 truncate">
          <CalendarDays className="h-2.5 w-2.5 flex-shrink-0" style={{ color }} aria-hidden />
          <span className={cn('truncate', pending && 'italic')}>{title}</span>
        </div>
        {event.scheduledStartTime && event.scheduledEndTime && (
          <div className="text-[9px] font-mono opacity-60">
            {event.scheduledStartTime}-{event.scheduledEndTime}
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
  const color = event.calendarColor
  return (
    <GoogleEventDetails event={event}>
      <button
        type="button"
        data-google-event={event.google?.responseStatus ?? 'none'}
        aria-label={t('Google 日曆：{title}', { title })}
        onClick={stop}
        className={cn('flex w-full items-center gap-3 px-2 min-h-[44px] py-1 text-left', pending && 'opacity-70')}
      >
        <span
          className={cn('w-1 self-stretch rounded-full flex-shrink-0', pending && 'border border-dashed bg-transparent')}
          style={pending ? { borderColor: color } : { backgroundColor: color }}
        />
        <span className="text-xs font-mono text-muted-foreground w-[84px] flex-shrink-0">
          {event.scheduledStartTime && event.scheduledEndTime ? `${event.scheduledStartTime}–${event.scheduledEndTime}` : t('全天')}
        </span>
        <span className={cn('text-sm text-foreground/80 truncate flex-1', pending && 'italic')}>{title}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
          <CalendarDays className="h-3 w-3" style={{ color }} aria-hidden />
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
  return (
    <div
      data-google-event={event.google?.responseStatus ?? 'none'}
      title={t('Google 日曆：{title}', { title })}
      className={cn(
        'flex items-center gap-1 px-1 py-0.5 rounded text-[9px] border-l-2 select-none',
        pending && 'border border-dashed border-l-2 opacity-70',
      )}
      style={{ borderColor: color, backgroundColor: pending ? `${color}10` : `${color}22` }}
    >
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
          pending && 'border border-dashed border-l-[3px] opacity-70',
        )}
        style={{ backgroundColor: pending ? `${color}10` : `${color}24`, borderColor: color, color: 'var(--foreground)' }}
      >
        <CalendarDays className="h-2.5 w-2.5 flex-shrink-0" style={{ color }} aria-hidden />
        <span className={cn('truncate', pending && 'italic')}>{title}</span>
      </button>
    </GoogleEventDetails>
  )
}
