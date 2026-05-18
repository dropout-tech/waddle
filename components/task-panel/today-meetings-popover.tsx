'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Users, MapPin, Video, Clock, X, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import type { Workspace, Task } from '@/lib/types'
import { collectMeetings, meetingStartAsDate } from '@/lib/meeting-reminder'
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from '@/lib/meeting-utils'
import { findTaskById } from '@/lib/task-utils'

interface TodayMeetingsPopoverProps {
  workspaces: Workspace[]
  onSelectTask?: (task: Task) => void
}

/**
 * Compact entry-point for "what meetings do I have today" — a small chip
 * with a count badge, click expands a popover listing each meeting with
 * its time, location, and a Join button when there's a video URL.
 *
 * Lives in the task-panel header next to the 已完成 chip. Built as a
 * controlled popover with outside-click dismissal because Radix Popover
 * isn't installed for this surface and the markup is small enough that
 * a hand-rolled approach is straightforward.
 */
export function TodayMeetingsPopover({ workspaces, onSelectTask }: TodayMeetingsPopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Tick once a minute so:
  //   1. the "today" filter rolls over at local midnight without the user
  //      having to refresh,
  //   2. the "進行中" / "N 分鐘後" labels stay accurate as time passes.
  // Cheap because the popover is small; only the meetings memo recomputes.
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60 * 1000)
    return () => window.clearInterval(id)
  }, [])
  // `nowTick` intentionally in deps so today rolls over without a remount.
  const todayStr = useMemo(() => toDateString(new Date()), [nowTick])

  const meetings = useMemo(() => {
    // Today only, sorted by start time. Past meetings (already ended)
    // are filtered out — once a meeting wraps up, surfacing it under
    // "today's meetings" is just clutter.
    const now = new Date()
    const all = collectMeetings(workspaces)
    return all
      .filter((m) => m.scheduledDate === todayStr)
      .filter((m) => {
        // Compute the meeting's end timestamp. For midnight-crossing
        // meetings (e.g. 23:00→01:00) the raw end hour resolves to
        // *today* at 01:00, which is in the past for any current time
        // past 01:00 — incorrectly filtering out an in-progress meeting.
        // Detect by comparing end vs start in minute-of-day; if end is
        // logically earlier, the meeting wraps so push end forward a
        // day. CR-03 from the multi-agent code review.
        const [sh, sm] = m.scheduledStartTime.split(':').map(Number)
        const [eh, em] = m.scheduledEndTime.split(':').map(Number)
        const startMin = sh * 60 + sm
        const endMin = eh * 60 + em
        const end = new Date(now)
        end.setHours(eh, em, 0, 0)
        if (endMin < startMin) end.setDate(end.getDate() + 1)
        return end.getTime() > now.getTime()
      })
      .sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime))
    // nowTick keeps this fresh as time progresses; pulling it in via
    // a deps explicit reference instead of a no-op variable use.
  }, [workspaces, todayStr, nowTick])

  // Outside-tap + Escape dismissal. We listen on pointerdown rather than
  // mousedown so the dismiss fires on touch devices too — mousedown is
  // not synthesized reliably for taps on iOS Safari, leaving the popover
  // stuck open after a tap outside it.
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = meetings.length

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // min-h ensures the chip stays a comfortable touch target on
        // phones — the original ~22px height failed the 36-40px guideline.
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 min-h-[32px] rounded-md text-[11px] font-medium transition-colors',
          count > 0
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'bg-muted text-muted-foreground hover:bg-muted/80',
        )}
        title={count > 0 ? `今天有 ${count} 場會議` : '今天沒有會議'}
      >
        <Users className="w-3 h-3" />
        <span>今日會議</span>
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold',
            count > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/15 text-muted-foreground',
          )}
        >
          {count}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="今日會議"
          className="absolute left-0 top-full mt-1.5 w-[320px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-foreground">今日會議</span>
              <span className="text-xs text-muted-foreground">{todayStr}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="關閉"
              className="flex items-center justify-center w-8 h-8 -mr-1.5 rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {count === 0 ? (
            <div className="px-4 py-6 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">今天沒有會議，享受深度工作時間</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border">
              {meetings.map((m) => {
                const start = meetingStartAsDate(m)
                const now = new Date()
                const upcomingMins = start ? Math.round((start.getTime() - now.getTime()) / 60000) : null
                const isCurrent =
                  start &&
                  start.getTime() <= now.getTime() &&
                  (() => {
                    // Same midnight-crossing handling as the filter
                    // above — see the comment there for the rationale.
                    const [sh, sm] = m.scheduledStartTime.split(':').map(Number)
                    const [eh, em] = m.scheduledEndTime.split(':').map(Number)
                    const startMin = sh * 60 + sm
                    const endMin = eh * 60 + em
                    const end = new Date(now)
                    end.setHours(eh, em, 0, 0)
                    if (endMin < startMin) end.setDate(end.getDate() + 1)
                    return end.getTime() > now.getTime()
                  })()
                const provider = detectMeetingProvider(m.meetingUrl)

                return (
                  <li key={m.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: m.workspaceColor }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            // The on-task-select callback expects a full Task;
                            // we only have MeetingTaskRef. Hand off the id —
                            // the parent looks it up against the live workspaces.
                            if (onSelectTask) {
                              const t = findTaskById(workspaces, m.id)
                              if (t) {
                                setOpen(false)
                                onSelectTask(t)
                              }
                            }
                          }}
                          className="text-left text-sm font-medium text-foreground hover:text-primary transition-colors block w-full truncate"
                        >
                          {m.title || '（未命名會議）'}
                        </button>
                        <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span className="font-mono">
                              {m.scheduledStartTime}–{m.scheduledEndTime}
                            </span>
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-success font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              進行中
                            </span>
                          )}
                          {!isCurrent && upcomingMins !== null && upcomingMins > 0 && upcomingMins < 60 && (
                            <span className="text-primary font-medium">
                              {upcomingMins} 分鐘後
                            </span>
                          )}
                        </div>
                        {m.location && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="w-2.5 h-2.5" />
                            <span className="truncate">{m.location}</span>
                          </div>
                        )}
                        {m.attendees && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="w-2.5 h-2.5" />
                            <span className="truncate">{m.attendees}</span>
                          </div>
                        )}
                      </div>
                      {m.meetingUrl && provider && (
                        <a
                          href={m.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          title={`開啟 ${MEETING_PROVIDER_LABEL[provider]}`}
                        >
                          <Video className="w-2.5 h-2.5" />
                          加入
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// `findTaskById` lives in lib/task-utils.ts — used here and in app/page.tsx.
