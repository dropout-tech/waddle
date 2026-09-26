'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Laugh, Moon, Settings2, VolumeX } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { createClient } from '@/lib/supabase/client'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { collectMeetings, meetingStartAsDate } from '@/lib/meeting-reminder'
import { isTaskOverdue } from '@/lib/task-utils'
import { toDateString } from '@/lib/calendar-utils'
import { pickLine, renderLine, type PetLineCategory } from '@/lib/pet/lines'
import { isPetMuted, localDate, readPetLocal, writePetLocal } from '@/lib/pet/local'
import { IDLE_MINUTES, type PetSettings } from '@/lib/pet/types'
import type { Workspace } from '@/lib/types'
import { PetSprite, type PetPose } from './pet-sprite'
import { PetAdoptCard } from './pet-adopt-card'
import styles from './pet.module.css'

type Act = '' | 'hop' | 'jump' | 'spin' | 'shy' | 'walk'

const TICK_MS = 30_000
const MIN_GAP_MS = 45_000 // never two automatic lines closer than this
const OVERDUE_GAP_MS = 4 * 60 * 60 * 1000
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
  const [blocked, setBlocked] = useState(false)
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
    schedule()
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
  return (
    <>
      {!adopted && canAdopt && (
        <PetAdoptCard
          isMobile={props.isMobile}
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

  const [bubble, setBubble] = useState<{ text: string; n: number } | null>(null)
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

  // ── speaking ──────────────────────────────────────────────────────────
  const playAct = useCallback((next: Act, ms: number) => {
    window.clearTimeout(actTimer.current)
    setAct(next)
    setActKey((k) => k + 1)
    actTimer.current = window.setTimeout(() => setAct(''), ms)
  }, [])

  const say = useCallback((text: string, opts: { auto?: boolean; act?: Act } = {}) => {
    window.clearTimeout(bubbleTimer.current)
    setPose('stand')
    setMenuOpen(false)
    setBubble((b) => ({ text, n: (b?.n ?? 0) + 1 }))
    const chars = Array.from(text).length
    const ms = Math.min(9000, Math.max(4000, 2200 + chars * (lang === 'en' ? 45 : 110)))
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
      renderLine(pickLine(cats), lang, { name: petRef.current.name, ...vars }),
    [lang],
  )

  useEffect(() => () => {
    window.clearTimeout(bubbleTimer.current)
    window.clearTimeout(actTimer.current)
    window.clearTimeout(longPressTimer.current)
  }, [])

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
    if (!shown || pageHidden || quiet || menuOpen || bubble) return false
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
  useEffect(() => {
    const prev = prevCompleted.current
    prevCompleted.current = completedIds
    if (!prev || workspaces.length === 0) return
    let fresh = false
    for (const id of completedIds) if (!prev.has(id)) { fresh = true; break }
    if (!fresh || Date.now() - lastCelebrate.current < 60_000) return
    if (!shown || quiet || menuOpen || isPetMuted()) return
    lastCelebrate.current = Date.now()
    say(line(['celebrate']), { auto: true, act: 'jump' })
  }, [completedIds, workspaces.length, shown, quiet, menuOpen, say, line])

  // Focus timer finished → speak even though we were quiet during it.
  const prevTimerState = useRef(timer.state)
  useEffect(() => {
    const prev = prevTimerState.current
    prevTimerState.current = timer.state
    if (timer.state === 'completed' && (prev === 'running' || prev === 'paused')) {
      if (!shown || isPetMuted()) return
      say(line(['focusEnd']), { auto: true, act: 'jump' })
    }
  }, [timer.state, shown, say, line])

  // Idle / reminder tick.
  useEffect(() => {
    if (pageHidden) return
    const base = IDLE_MINUTES[pet.chattiness] * 60_000
    const jitter = () => base * (0.75 + Math.random() * 0.5)
    if (!nextIdleAt.current) nextIdleAt.current = Date.now() + jitter() * 0.5

    let checkInBusy = false
    const tick = async () => {
      if (!canAuto()) return
      const now = new Date()
      const nowMs = now.getTime()
      const local = readPetLocal()

      // 1) meeting within 10 minutes — a real reminder.
      for (const m of collectMeetings(workspaces)) {
        const start = meetingStartAsDate(m)
        if (!start) continue
        const until = start.getTime() - nowMs
        const key = `${m.id}@${m.scheduledDate}T${m.scheduledStartTime}`
        if (until > 0 && until <= MEETING_LEAD_MS && !(local.meetingsNudged ?? []).includes(key)) {
          writePetLocal({ meetingsNudged: [...(local.meetingsNudged ?? []), key].slice(-50) })
          say(line(['meeting'], { title: m.title, time: Math.max(1, Math.ceil(until / 60_000)) }), { auto: true, act: 'jump' })
          return
        }
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
      const today = localDate(now)
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

      // 4) overdue tasks — at most every 4 hours, not in the first minute.
      if (overdueCount > 0 && nowMs - mountedAt.current > 60_000 && nowMs - (local.overdueNudgedAt ?? 0) > OVERDUE_GAP_MS) {
        writePetLocal({ overdueNudgedAt: nowMs })
        say(line(['overdue'], { count: overdueCount }), { auto: true })
        return
      }

      // 5) idle chatter: ~40% tips, ~40% absurd/jokes, ~20% real reminder.
      if (nowMs >= nextIdleAt.current) {
        nextIdleAt.current = nowMs + jitter()
        const r = Math.random()
        if (isNightHour(hour) && r < 0.5) return say(line(['night'], { time: clock(now) }), { auto: true })
        if (r < 0.4) return say(line(['tip']), { auto: true })
        if (r < 0.8) return say(line(['absurd', 'joke', 'work']), { auto: true })
        if (overdueCount > 0) {
          writePetLocal({ overdueNudgedAt: nowMs })
          return say(line(['overdue'], { count: overdueCount }), { auto: true })
        }
        return say(line(['tip', 'absurd']), { auto: true })
      }
    }
    const id = window.setInterval(() => void tick(), TICK_MS)
    return () => window.clearInterval(id)
  }, [pageHidden, pet.chattiness, canAuto, workspaces, overdueCount, say, line])

  // ── idle body language (blink, look around, a few steps, doze) ────────
  const animate = shown && !pageHidden && !reduced
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
    }
  }, [animate, isMobile, pose, bubble, menuOpen, playAct])

  // ── interaction ───────────────────────────────────────────────────────
  const onTap = () => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
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

  const menuAction = (kind: 'joke' | 'hour' | 'today' | 'settings') => {
    setMenuOpen(false)
    if (kind === 'joke') return say(line(['joke']), { act: 'hop' })
    if (kind === 'hour') {
      writePetLocal({ mutedUntil: Date.now() + 60 * 60 * 1000 })
      return say(t('好，我安靜一小時。'), { act: '' })
    }
    if (kind === 'today') {
      writePetLocal({ mutedDate: localDate() })
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
    >
      <div className={styles.mover} style={{ transform: `translateX(${offsetX}px)` }}>
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
        >
          <span className={styles.facing} data-flip={flip ? '' : undefined}>
            <span key={actKey} className={styles.act} data-act={act || undefined}>
              <PetSprite color={pet.color} accessory={pet.accessory} pose={pose} blink={blink} blush={blush} />
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

        {/* Persistent polite live region: the bubble text is announced once. */}
        <div aria-live="polite" aria-atomic="true" aria-label={t('企鵝說的話')}>
          {bubble && (
            <div
              key={bubble.n}
              ref={bubbleRef}
              className={styles.bubble}
              data-side={side}
              data-pet-bubble
              onPointerEnter={() => window.clearTimeout(bubbleTimer.current)}
              onPointerLeave={() => {
                window.clearTimeout(bubbleTimer.current)
                bubbleTimer.current = window.setTimeout(() => setBubble(null), 2500)
              }}
            >
              <span className={styles.bubbleName}>{pet.name}</span>
              {bubble.text}
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
