'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Home, Laugh, Moon, Settings2, VolumeX } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { createClient } from '@/lib/supabase/client'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { collectMeetings, meetingOccurrenceKey, pickMeetingNudge, rememberNudgedMeeting } from '@/lib/meeting-reminder'
import { isTaskOverdue } from '@/lib/task-utils'
import { toDateString } from '@/lib/calendar-utils'
import { pickLine, renderLine, type PetLineCategory } from '@/lib/pet/lines'
import { isPetMuted, localDate, readPetLocal, writePetLocal } from '@/lib/pet/local'
import { getIglooSnapshot, openIgloo } from '@/lib/igloo/store'
import { hasDailyLine } from '@/lib/life-grid/data'
import { localToday } from '@/lib/life-grid/compute'
import { openLifeGrid } from '@/lib/life-grid/events'
import { CELEBRATE_CHANCE, IDLE_DAILY_CAP, IDLE_MINUTES, type PetSettings } from '@/lib/pet/types'
import type { Workspace } from '@/lib/types'
import { PetSprite, type PetPose } from './pet-sprite'
import { PetWaterCard, PetWaterCheer, PetWaterInHand, type PetWaterPhase } from './pet-water'
import { getWaterPetRequest, setPetWaterReady, subscribeWaterMoment } from '@/lib/water-moment'
import { hapticTaskComplete } from '@/lib/haptics'
import { PetAdoptCard } from './pet-adopt-card'
import styles from './pet.module.css'

type Act = '' | 'hop' | 'jump' | 'spin' | 'shy' | 'walk'

const TICK_MS = 30_000
const MIN_GAP_MS = 45_000 // never two automatic lines closer than this
const MEETING_LEAD_MS = 10 * 60 * 1000
const COMBO_MS = 1300
const LONG_PRESS_MS = 500
/** Anything that means "a modal / takeover is up" — the penguin steps aside. */
const HIDE_SELECTOR = '[role="dialog"]:not([data-pet-ui]):not([data-onboarding-tour]), [data-pet-hide]'

const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]'

/**
 * Stricter than the timer pill's rule (use-floating-dodge): the penguin is a
 * pet, not a tool, so it steps aside as soon as ANY control would be under
 * it — wherever a tap on its box would otherwise reach a button, link,
 * input, tab… Probed on a grid finer than the smallest icon button.
 */
function usePetYield(active: boolean, ref: React.RefObject<HTMLElement | null>, deps: unknown) {
  // Starts blocked: the penguin stays invisible until a check has proven its
  // spot free (no flash of a penguin sitting on a button on first paint).
  const [blocked, setBlocked] = useState(true)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const check = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      let hit = false
      outer: for (let x = r.left + 2; x <= r.right - 2; x += 8) {
        for (let y = r.top + 2; y <= r.bottom - 2; y += 8) {
          for (const node of document.elementsFromPoint(x, y)) {
            if (el.contains(node)) continue
            const c = node.closest(CONTROL_SELECTOR)
            if (c && !c.closest('[data-pet-ui]')) { hit = true; break outer }
            break
          }
        }
      }
      setBlocked(hit)
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check) }
    check() // synchronously on (re)position, not a frame later
    const poll = window.setInterval(schedule, 500)
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.clearInterval(poll)
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [active, ref, deps])
  return active && blocked
}

/** Desktop home: the bottom of the calendar's hour-label gutter (no controls
 *  live there); falls back to the window's bottom-left corner. */
function useDesktopAnchor(enabled: boolean) {
  const [left, setLeft] = useState(14)
  useEffect(() => {
    if (!enabled) return
    const measure = () => {
      const panel = document.querySelector('[data-tour="calendar-panel"]')
      const r = panel?.getBoundingClientRect()
      setLeft(r && r.width > 200 && r.height > 200 ? Math.round(r.left + 2) : 14)
    }
    measure()
    const id = window.setInterval(measure, 700)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
    }
  }, [enabled])
  return left
}

const isNightHour = (h: number) => h >= 23 || h < 4
const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export interface PenguinPetProps {
  pet: PetSettings | null
  onSetPet: (next: PetSettings) => Promise<void> | void
  workspaces: Workspace[]
  isMobile: boolean
  /** Layout says: not now (mobile overlay sheets, full-screen views). */
  hidden?: boolean
  /** False while the onboarding tour still owes the user a walkthrough. */
  canAdopt: boolean
  onOpenSettings?: () => void
}

/**
 * Each user's own penguin (MVP). Lives bottom-left on desktop and sits on
 * the phone tab bar's top edge (opposite the focus-timer pill). Speaks in a
 * bubble: mostly absurd lines and jokes, some genuinely useful tips, and a
 * few real reminders (meeting in ≤10 min, overdue tasks, evening check-in,
 * late night, focus timer finished) — silent while a focus timer runs.
 * Tap = a joke; tap again quickly = jump → spin → shy. Long-press / right
 * click = menu (joke, quiet 1h, not today, settings).
 */
export function PenguinPet(props: PenguinPetProps) {
  const { pet, onSetPet, canAdopt } = props
  const { lang } = useI18n()
  const adopted = !!pet?.adopted
  // Desktop: open the card where the penguin will live (calendar's left
  // edge), not over the task list, whose buttons it used to cover.
  const adoptLeft = useDesktopAnchor(!props.isMobile && !adopted && canAdopt)
  return (
    <>
      {!adopted && canAdopt && (
        <PetAdoptCard
          isMobile={props.isMobile}
          desktopLeft={adoptLeft}
          onAdopt={async (look, skipped) => {
            await onSetPet({
              adopted: true,
              enabled: true,
              chattiness: pet?.chattiness ?? 'medium',
              quietDuringFocus: pet?.quietDuringFocus ?? true,
              ...look,
              adoptedAt: new Date().toISOString(),
            })
            // Say hello right after adopting (even a skipped adoption — that
            // still leaves you with a penguin).
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('huddle-pet:hello', { detail: { skipped } })), 450)
          }}
          lang={lang}
        />
      )}
      {adopted && pet.enabled && <PetWidget {...props} pet={pet} />}
    </>
  )
}

function PetWidget({ pet, workspaces, isMobile, hidden, onOpenSettings }: PenguinPetProps & { pet: PetSettings }) {
  const { t, lang } = useI18n()
  const timer = useFocusTimer()
  const focusBusy = timer.state === 'running' || timer.state === 'paused'

  // `action`: a bubble you can tap (the evening 人生年曆 question opens today's input).
  const [bubble, setBubble] = useState<{ text: string; n: number; action?: () => void } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [act, setAct] = useState<Act>('')
  const [actKey, setActKey] = useState(0)
  const [flip, setFlip] = useState(false)
  const [blink, setBlink] = useState(false)
  const [blush, setBlush] = useState(false)
  const [pose, setPose] = useState<PetPose>('stand')
  const [offsetX, setOffsetX] = useState(0)
  const [domHidden, setDomHidden] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)
  const [reduced, setReduced] = useState(false)
  // 喝水提醒 A (lib/water-moment.ts): walking over with a glass → card → 乾杯 / 等等再喝 → home.
  const [water, setWater] = useState<{ id: number; phase: PetWaterPhase; afterFocus: boolean } | null>(null)
  const [waterAway, setWaterAway] = useState(false) // standing at the delivery spot (not at home)
  const [happy, setHappy] = useState(false)
  const [muted, setMuted] = useState(() => isPetMuted())
  const waterTimers = useRef<number[]>([])

  const homeRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleTimer = useRef<number | undefined>(undefined)
  const actTimer = useRef<number | undefined>(undefined)
  const comboRef = useRef({ count: 0, at: 0 })
  const longPressTimer = useRef<number | undefined>(undefined)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const mountedAt = useRef(0)
  const nextIdleAt = useRef(0)

  const shown = !hidden && !domHidden
  const petRef = useRef(pet)
  useEffect(() => {
    petRef.current = pet
  }, [pet])
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  // ── environment: reduced motion, page visibility, DOM takeovers ──────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMq = () => setReduced(mq.matches)
    const syncVis = () => setPageHidden(document.visibilityState === 'hidden')
    syncMq()
    syncVis()
    mq.addEventListener('change', syncMq)
    document.addEventListener('visibilitychange', syncVis)
    return () => {
      mq.removeEventListener('change', syncMq)
      document.removeEventListener('visibilitychange', syncVis)
    }
  }, [])

  useEffect(() => {
    if (pageHidden) return
    const check = () => setDomHidden(!!document.querySelector(HIDE_SELECTOR))
    check()
    const id = window.setInterval(check, 600)
    return () => window.clearInterval(id)
  }, [pageHidden])

  // Stand aside (fade out, no pointer events) whenever it would sit on a
  // control that then has no 44px left to tap — same rule the timer pill uses.
  const desktopLeft = useDesktopAnchor(!isMobile)
  const yielding = usePetYield(shown && !pageHidden, homeRef, `${isMobile}:${desktopLeft}`)

  // ── 喝水提醒 A: tell the host whether a delivery can be seen; play it when asked ──
  useEffect(() => {
    const id = window.setInterval(() => setMuted(isPetMuted()), 5000)
    return () => window.clearInterval(id)
  }, [])
  const waterReady = shown && !pageHidden && !yielding && !muted
  useEffect(() => {
    setPetWaterReady(waterReady)
  }, [waterReady])
  useEffect(() => () => setPetWaterReady(false), [])

  // ── speaking ──────────────────────────────────────────────────────────
  const playAct = useCallback((next: Act, ms: number) => {
    window.clearTimeout(actTimer.current)
    setAct(next)
    setActKey((k) => k + 1)
    actTimer.current = window.setTimeout(() => setAct(''), ms)
  }, [])

  const say = useCallback((text: string, opts: { auto?: boolean; act?: Act; action?: () => void } = {}) => {
    window.clearTimeout(bubbleTimer.current)
    setPose('stand')
    setMenuOpen(false)
    setBubble((b) => ({ text, n: (b?.n ?? 0) + 1, action: opts.action }))
    const chars = Array.from(text).length
    // A question you can answer stays up longer than a passing remark.
    const ms = opts.action ? 20_000 : Math.min(9000, Math.max(4000, 2200 + chars * (lang === 'en' ? 45 : 110)))
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms)
    if (opts.act !== undefined) {
      if (opts.act) playAct(opts.act, opts.act === 'shy' ? 1400 : 700)
    } else {
      playAct('hop', 450)
    }
    if (opts.auto) writePetLocal({ lastSpokeAt: Date.now() })
  }, [lang, playAct])

  const line = useCallback(
    (cats: PetLineCategory[], vars: Record<string, string | number> = {}) =>
      renderLine(pickLine(cats, lang), lang, { name: petRef.current.name, ...vars }),
    [lang],
  )

  useEffect(() => () => {
    window.clearTimeout(bubbleTimer.current)
    window.clearTimeout(actTimer.current)
    window.clearTimeout(longPressTimer.current)
    waterTimers.current.forEach((id) => window.clearTimeout(id))
  }, [])

  const waterReq = useSyncExternalStore(subscribeWaterMoment, getWaterPetRequest, () => null)
  const waterRef = useRef(water)
  useEffect(() => {
    waterRef.current = water
  }, [water])
  const waterAfter = useCallback((ms: number, fn: () => void) => {
    waterTimers.current.push(window.setTimeout(fn, ms))
  }, [])
  const clearWaterTimers = useCallback(() => {
    waterTimers.current.forEach((id) => window.clearTimeout(id))
    waterTimers.current = []
  }, [])
  /** Walk back to the corner and put the glass away. */
  const waterGoHome = useCallback((phase: PetWaterPhase, delay: number) => {
    setWater((w) => (w ? { ...w, phase } : w))
    waterAfter(delay, () => {
      setWaterAway(false)
      if (!reduced) setAct('walk')
    })
    waterAfter(delay + (reduced ? 300 : 1400), () => {
      setAct('')
      setWater(null)
    })
  }, [reduced, waterAfter])

  // A new delivery → hop, the glass appears, waddle over, then the card. The request going away
  // before anyone answered (switched off elsewhere, the host fell back to the drop) → walk home.
  useEffect(() => {
    const cur = waterRef.current
    if (waterReq && waterReq.id !== cur?.id) {
      clearWaterTimers()
      window.clearTimeout(bubbleTimer.current)
      setBubble(null)
      setMenuOpen(false)
      setPose('stand')
      setFlip(false)
      setOffsetX(0)
      setHappy(false)
      if (reduced) {
        setWaterAway(true)
        setWater({ id: waterReq.id, phase: 'card', afterFocus: waterReq.afterFocus })
        return
      }
      setWater({ id: waterReq.id, phase: 'arrive', afterFocus: waterReq.afterFocus })
      playAct('hop', 450)
      waterAfter(550, () => {
        setWaterAway(true)
        setAct('walk')
      })
      waterAfter(1950, () => {
        setAct('')
        setWater((w) => (w ? { ...w, phase: 'card' } : w))
      })
      return
    }
    if (!waterReq && cur && (cur.phase === 'arrive' || cur.phase === 'card')) {
      clearWaterTimers()
      waterGoHome('leave', 0)
    }
  }, [waterReq, reduced, playAct, waterAfter, clearWaterTimers, waterGoHome])

  const waterCheers = () => {
    getWaterPetRequest()?.handlers.drink()
    hapticTaskComplete() // the clink, on the phone
    clearWaterTimers()
    if (reduced) {
      say(t('咕嚕。好喝！'), { act: '' })
      waterGoHome('cheers', 0)
      return
    }
    setWater((w) => (w ? { ...w, phase: 'cheers' } : w))
    waterAfter(600, () => {
      setHappy(true)
      setBlush(true)
    })
    waterAfter(1850, () => say(t('咕嚕。好喝！'), { act: '' }))
    waterAfter(2200, () => {
      setHappy(false)
      setBlush(false)
    })
    waterGoHome('cheers', 2400)
  }
  const waterLater = () => {
    getWaterPetRequest()?.handlers.later()
    clearWaterTimers()
    say(t('好，我等一下再端來。'), { act: '' })
    waterGoHome('later', 500)
  }
  const waterDisable = () => {
    getWaterPetRequest()?.handlers.disable()
  }

  // Hello after adoption.
  useEffect(() => {
    const onHello = () => say(line(['hello']), { act: 'jump' })
    window.addEventListener('huddle-pet:hello', onHello)
    return () => window.removeEventListener('huddle-pet:hello', onHello)
  }, [say, line])

  // Close bubble / menu on outside press or Escape.
  useEffect(() => {
    if (!bubble && !menuOpen) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (bubbleRef.current?.contains(target) || menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setBubble(null)
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setBubble(null)
      if (menuOpen) {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [bubble, menuOpen])

  // Menu: focus first item when opened.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [menuOpen])

  // ── automatic speech ──────────────────────────────────────────────────
  const quiet = focusBusy && pet.quietDuringFocus
  const canAuto = useCallback(() => {
    if (!shown || pageHidden || quiet || menuOpen || bubble || waterRef.current) return false
    const local = readPetLocal()
    if (isPetMuted(local)) return false
    if (local.lastSpokeAt && Date.now() - local.lastSpokeAt < MIN_GAP_MS) return false
    return true
  }, [shown, pageHidden, quiet, menuOpen, bubble])

  const overdueCount = useMemo(() => {
    const today = toDateString(new Date())
    let n = 0
    for (const ws of workspaces) {
      if (ws.isArchived) continue
      for (const c of ws.categories) {
        if (c.isArchived) continue
        for (const task of c.tasks) if (isTaskOverdue(task, today)) n++
      }
    }
    return n
  }, [workspaces])

  // Celebrate newly completed tasks (not the ones that were already done on load).
  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const ws of workspaces) for (const c of ws.categories) for (const task of c.tasks) if (task.isCompleted) ids.add(task.id)
    return ids
  }, [workspaces])
  const prevCompleted = useRef<Set<string> | null>(null)
  const lastCelebrate = useRef(0)
  const iglooAnnounced = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevCompleted.current
    prevCompleted.current = completedIds
    if (!prev || workspaces.length === 0) return
    let fresh = false
    for (const id of completedIds) if (!prev.has(id)) { fresh = true; break }
    if (!fresh || Date.now() - lastCelebrate.current < 60_000) return
    if (!shown || quiet || menuOpen || isPetMuted()) return
    // The igloo state (lib/igloo/store) is republished by IglooHost in the
    // same commit, after this effect — read it a beat later.
    const lucky = Math.random() < CELEBRATE_CHANCE
    const id = window.setTimeout(() => {
      const igloo = getIglooSnapshot()
      // Finishing an igloo is rare (about weekly) — always worth one line.
      if (igloo && igloo.finishedToday && igloo.bricksInCurrent === 0 && iglooAnnounced.current !== igloo.completedIgloos) {
        iglooAnnounced.current = igloo.completedIgloos
        lastCelebrate.current = Date.now()
        say(line(['igloo'], { built: igloo.completedIgloos }), { auto: true, act: 'jump' })
        return
      }
      if (!lucky) return // only now and then
      lastCelebrate.current = Date.now()
      if (igloo && Math.random() < 0.5) {
        say(line(['brick'], { today: igloo.bricksToday, left: igloo.bricksPerIgloo - igloo.bricksInCurrent }), { auto: true, act: 'hop' })
      } else {
        say(line(['celebrate']), { auto: true, act: 'jump' })
      }
    }, 80)
    return () => window.clearTimeout(id)
  }, [completedIds, workspaces.length, shown, quiet, menuOpen, say, line])

  // Focus timer finished → speak even though we were quiet during it.
  // A pomodoro break ending gets its own lines — it is not a focus session.
  const prevTimerState = useRef(timer.state)
  const timerPhase = timer.session?.phase
  useEffect(() => {
    const prev = prevTimerState.current
    prevTimerState.current = timer.state
    if (timer.state === 'completed' && (prev === 'running' || prev === 'paused')) {
      if (!shown || isPetMuted()) return
      say(line([timerPhase === 'break' ? 'breakEnd' : 'focusEnd']), { auto: true, act: 'jump' })
    }
  }, [timer.state, timerPhase, shown, say, line])

  // Idle / reminder tick.
  useEffect(() => {
    if (pageHidden) return
    const base = IDLE_MINUTES[pet.chattiness] * 60_000
    const jitter = () => base * (0.8 + Math.random() * 0.4)
    if (!nextIdleAt.current) nextIdleAt.current = Date.now() + jitter() * 0.5

    let checkInBusy = false
    let dailyLineBusy = false
    const tick = async () => {
      if (!canAuto()) return
      const now = new Date()
      const nowMs = now.getTime()
      const local = readPetLocal()

      const today = localDate(now)

      // 1) meeting within 10 minutes — a real reminder, once per meeting (each occurrence of a repeating one too).
      const soon = pickMeetingNudge(collectMeetings(workspaces), local.meetingNudgedKeys, nowMs, MEETING_LEAD_MS)
      if (soon) {
        writePetLocal({ meetingNudgedKeys: rememberNudgedMeeting(local.meetingNudgedKeys, meetingOccurrenceKey(soon.meeting), today) })
        say(line(['meeting'], { title: soon.meeting.title, time: Math.max(1, Math.ceil(soon.untilMs / 60_000)) }), { auto: true, act: 'jump' })
        return
      }

      // 2) late night — once per night.
      const hour = now.getHours()
      if (isNightHour(hour)) {
        const nightKey = hour < 4 ? localDate(new Date(nowMs - 6 * 3600_000)) : localDate(now)
        if (local.nightNudged !== nightKey) {
          writePetLocal({ nightNudged: nightKey })
          say(line(['night'], { time: clock(now) }), { auto: true })
          return
        }
      }

      // 3) evening check-in nudge — once per day, only if actually not checked in.
      if (hour >= 18 && hour < 23 && local.checkInNudged !== today && !checkInBusy) {
        checkInBusy = true
        writePetLocal({ checkInNudged: today })
        try {
          const { data, error } = await createClient().rpc('get_daily_check_in_status').single()
          if (!error && data && !(data as { checked_in: boolean }).checked_in && canAuto()) {
            say(line(['checkIn']), { auto: true })
            return
          }
        } catch {
          /* offline — skip today's nudge */
        } finally {
          checkInBusy = false
        }
      }

      // 3b) 人生年曆 — after 20:00 (21:00 for a low-chattiness penguin), once a
      //     day, only if today (the device's local day, same as the grid) has no line yet.
      //     Tapping the bubble opens the grid with today's input focused.
      const askFrom = pet.chattiness === 'low' ? 21 : 20
      if (hour >= askFrom && local.dailyLineAsked !== today && !dailyLineBusy) {
        dailyLineBusy = true
        writePetLocal({ dailyLineAsked: today })
        try {
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const uid = session?.user.id
          if (uid && !(await hasDailyLine(supabase, uid, localToday())) && canAuto()) {
            say(line(['dailyLine']), { auto: true, act: 'hop', action: () => openLifeGrid({ focusToday: true }) })
            return
          }
        } catch {
          /* offline — skip today's question */
        } finally {
          dailyLineBusy = false
        }
      }

      // 4) overdue tasks — once a day, not in the first minute.
      if (overdueCount > 0 && nowMs - mountedAt.current > 60_000 && local.overdueNudged !== today) {
        writePetLocal({ overdueNudged: today })
        say(line(['overdue'], { count: overdueCount }), { auto: true })
        return
      }

      // 5) idle chatter (capped per day): ~40% tips, ~40% absurd/jokes,
      //    ~20% a real reminder when one applies.
      if (nowMs >= nextIdleAt.current) {
        nextIdleAt.current = nowMs + jitter()
        const used = local.idleDate === today ? local.idleCount ?? 0 : 0
        if (used >= IDLE_DAILY_CAP) return
        writePetLocal({ idleDate: today, idleCount: used + 1 })
        const r = Math.random()
        if (isNightHour(hour) && r < 0.5) return say(line(['night'], { time: clock(now) }), { auto: true })
        if (r < 0.4) return say(line(['tip']), { auto: true })
        if (r < 0.8) return say(line(['absurd', 'joke', 'work']), { auto: true })
        if (overdueCount > 0 && local.overdueNudged !== today) {
          writePetLocal({ overdueNudged: today })
          return say(line(['overdue'], { count: overdueCount }), { auto: true })
        }
        return say(line(['tip', 'absurd']), { auto: true })
      }
    }
    const id = window.setInterval(() => void tick(), TICK_MS)
    return () => window.clearInterval(id)
  }, [pageHidden, pet.chattiness, canAuto, workspaces, overdueCount, say, line])

  // ── idle body language (blink, look around, a few steps, doze) ────────
  const animate = shown && !pageHidden && !reduced && !water
  useEffect(() => {
    if (!animate) return
    let t: number | undefined
    let sub: number | undefined
    const schedule = () => { t = window.setTimeout(step, 2400 + Math.random() * 4200) }
    const doBlink = () => {
      setBlink(true)
      sub = window.setTimeout(() => setBlink(false), 130)
    }
    const step = () => {
      const r = Math.random()
      if (pose === 'sleep') {
        // wake up after a while
        if (r < 0.35) { setPose('stand'); doBlink() }
      } else if (r < 0.5) {
        doBlink()
      } else if (r < 0.68) {
        setFlip((f) => !f)
      } else if (r < 0.82 && !isMobile) {
        // a couple of tiny steps — the gutter it lives in is narrow
        setOffsetX((x) => (x === 0 ? (Math.random() < 0.5 ? -3 : 3) : 0))
        setAct('walk')
        window.clearTimeout(actTimer.current)
        actTimer.current = window.setTimeout(() => setAct(''), 1400)
      } else if (r < 0.9) {
        playAct('hop', 450)
      } else if (!bubble && !menuOpen) {
        setPose('sleep')
      }
      schedule()
    }
    schedule()
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(sub)
      // The effect re-runs whenever pose/bubble/menu change — including
      // right after doBlink() (wake-up sets pose). Clearing `sub` without
      // reopening the eyes left the lids stuck shut (half-covered eyes).
      setBlink(false)
    }
  }, [animate, isMobile, pose, bubble, menuOpen, playAct])

  // ── interaction ───────────────────────────────────────────────────────
  const onTap = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (water) return // busy holding a glass — the card has the buttons
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const now = Date.now()
    const combo = now - comboRef.current.at < COMBO_MS ? comboRef.current.count + 1 : 1
    comboRef.current = { count: combo, at: now }
    if (combo === 1) {
      say(line(Math.random() < 0.55 ? ['joke'] : ['absurd', 'work']), { act: 'hop' })
    } else if (combo === 2) {
      say(line(['poke']), { act: 'jump' })
    } else if (combo === 3) {
      say(line(['poke']), { act: 'spin' })
    } else {
      setBlush(true)
      window.setTimeout(() => setBlush(false), 1600)
      say(line(['poke']), { act: 'shy' })
    }
  }

  const openMenu = () => {
    if (waterRef.current) return
    window.clearTimeout(bubbleTimer.current)
    setBubble(null)
    setPose('stand')
    setMenuOpen(true)
  }

  const clearLongPress = () => {
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = undefined
    pressStart.current = null
  }

  const menuAction = (kind: 'joke' | 'igloo' | 'hour' | 'today' | 'settings') => {
    setMenuOpen(false)
    if (kind === 'joke') return say(line(['joke']), { act: 'hop' })
    if (kind === 'igloo') return openIgloo()
    if (kind === 'hour') {
      writePetLocal({ mutedUntil: Date.now() + 60 * 60 * 1000 })
      setMuted(true)
      return say(t('好，我安靜一小時。'), { act: '' })
    }
    if (kind === 'today') {
      writePetLocal({ mutedDate: localDate() })
      setMuted(true)
      return say(t('好，今天我當一個安靜的擺飾。'), { act: '' })
    }
    onOpenSettings?.()
    window.setTimeout(() => {
      document.querySelector('[data-pet-settings]')?.scrollIntoView({ block: 'center' })
    }, 250)
  }

  // Phone: sits on the tab bar's top edge inside the calendar's 55px hour
  // gutter (16–54px). Desktop: bottom of the calendar gutter (see useDesktopAnchor).
  const size = isMobile ? 38 : 52
  const side = isMobile ? 'up' : 'right'
  const homeStyle: React.CSSProperties = isMobile
    ? { left: 16, bottom: 'calc(61px + env(safe-area-inset-bottom))', width: size, height: size }
    : { left: desktopLeft, bottom: 10, width: size, height: size }
  // 喝水提醒 A: where it stands with the glass. Desktop: ~100px into the day column. Phone: a step
  // right, lifted off the tab bar and a bit bigger, so it doesn't look glued to the tab bar.
  const waterX = waterAway ? (isMobile ? 16 : 104) : 0
  const waterY = waterAway && isMobile ? -8 : 0

  return (
    <div
      ref={homeRef}
      className={styles.home}
      style={{ ...homeStyle, display: shown ? undefined : 'none' }}
      data-pet
      data-pet-ui
      data-hide-on-keyboard
      data-yield={yielding ? '' : undefined}
      data-paused={pageHidden ? '' : undefined}
      data-water={water?.phase}
    >
      {/* Desktop: while asking the evening question the penguin steps off the
          hour gutter (its home) so the time labels behind it stay readable. */}
      <div className={styles.mover} style={{ transform: `translate(${offsetX + waterX + (bubble?.action && !isMobile ? 58 : 0)}px, ${waterY}px)` }}>
        <button
          ref={buttonRef}
          type="button"
          data-tour="pet"
          data-pet-button
          className={styles.penguin}
          aria-label={t('{name}，點我聽笑話；長按或按右鍵打開選單', { name: pet.name })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={onTap}
          onContextMenu={(e) => {
            e.preventDefault()
            clearLongPress()
            if (!menuOpen) openMenu()
          }}
          onPointerDown={(e) => {
            suppressClick.current = false
            if (e.pointerType === 'mouse') return
            pressStart.current = { x: e.clientX, y: e.clientY }
            window.clearTimeout(longPressTimer.current)
            longPressTimer.current = window.setTimeout(() => {
              suppressClick.current = true
              longPressTimer.current = undefined
              openMenu()
            }, LONG_PRESS_MS)
          }}
          onPointerMove={(e) => {
            const s = pressStart.current
            if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clearLongPress()
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          style={isMobile ? { transform: waterAway ? 'scale(1.3)' : undefined, transformOrigin: '30% 100%', transition: 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)' } : undefined}
        >
          <span className={styles.facing} data-flip={flip ? '' : undefined}>
            <span key={actKey} className={styles.act} data-act={act || undefined}>
              <PetSprite color={pet.color} accessory={pet.accessory} pose={pose} blink={blink} blush={blush} happy={happy}>
                {water && <PetWaterInHand phase={water.phase} />}
              </PetSprite>
            </span>
          </span>
          {pose === 'sleep' && (
            <span className={styles.zzz} aria-hidden="true">
              <span>z</span>
              <span>z</span>
              <span>Z</span>
            </span>
          )}
        </button>

        {water?.phase === 'card' && (
          <PetWaterCard
            name={pet.name}
            afterFocus={water.afterFocus}
            isMobile={isMobile}
            onCheers={waterCheers}
            onLater={waterLater}
            onDisable={waterDisable}
          />
        )}
        {water?.phase === 'cheers' && <PetWaterCheer isMobile={isMobile} />}

        {/* Persistent polite live region: the bubble text is announced once. */}
        <div aria-live="polite" aria-atomic="true" aria-label={t('企鵝說的話')}>
          {bubble && (
            <div
              key={bubble.n}
              ref={bubbleRef}
              className={styles.bubble}
              data-side={side}
              data-pet-bubble
              data-actionable={bubble.action ? '' : undefined}
              onPointerEnter={() => window.clearTimeout(bubbleTimer.current)}
              onPointerLeave={() => {
                window.clearTimeout(bubbleTimer.current)
                bubbleTimer.current = window.setTimeout(() => setBubble(null), bubble.action ? 8000 : 2500)
              }}
            >
              <span className={styles.bubbleName}>{pet.name}</span>
              {bubble.text}
              {bubble.action && (
                // Covers the whole bubble: tap anywhere on the question to answer it.
                <button
                  type="button"
                  className={styles.bubbleAction}
                  onClick={() => {
                    const run = bubble.action
                    window.clearTimeout(bubbleTimer.current)
                    setBubble(null)
                    run?.()
                  }}
                  data-pet-bubble-action
                >
                  {t('寫下來')} →
                </button>
              )}
            </div>
          )}
        </div>

        {menuOpen && (
          <div ref={menuRef} role="menu" aria-label={t('企鵝選單')} className={styles.menu} data-side={side} data-pet-menu
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              e.preventDefault()
              const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
              const i = items.indexOf(document.activeElement as HTMLElement)
              items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
            }}
          >
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => menuAction('joke')}>
              <Laugh className="w-4 h-4" aria-hidden="true" />{t('講個笑話')}
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => menuAction('igloo')} data-pet-igloo>
              <Home className="w-4 h-4" aria-hidden="true" />{t('去冰屋看看')}
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => menuAction('hour')}>
              <VolumeX className="w-4 h-4" aria-hidden="true" />{t('安靜 1 小時')}
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => menuAction('today')}>
              <Moon className="w-4 h-4" aria-hidden="true" />{t('今天先別吵')}
            </button>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => menuAction('settings')}>
              <Settings2 className="w-4 h-4" aria-hidden="true" />{t('企鵝設定')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
