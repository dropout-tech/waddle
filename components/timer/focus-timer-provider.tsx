'use client'

// Cross-route focus timer controller. This owns the entire state machine
// that used to live inside FocusTimer (components/timer/focus-timer.tsx) —
// mode/phase/elapsed/session/BGM prefs/the gentle completion sequence — so a
// running session survives client-side navigation to any route (e.g.
// /notebook), not just while MainLayout happens to be mounted.
//
// Mounted once in app/layout.tsx, inside AuthProvider. Two consumers:
//  • useFocusTimer() — the idle setup card (focus-timer.tsx), rendered only
//    inside MainLayout, reads/writes state through this context.
//  • This component itself — while a session is running/paused/completed it
//    portals FocusTimerMini or FocusTimerImmersive onto document.body, so
//    the overlay is visible on every route regardless of where the DOM tree
//    for that route lives.
//
// Cost discipline: an anonymous or idle (never-touched-the-timer) user must
// not pay for BGM setup (no AudioContext, no <audio> elements, no audio
// fetches). See the `engaged` gate below — audio wiring only turns on once
// the user opens the setup card or a session is actually running.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import {
  Brain, BookOpen, Dumbbell, Coffee,
} from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { playTimerSound, type TimerSoundKind } from '@/lib/timer-sound'
import {
  BGM_MUSIC, BGM_AMBIENT, getBgmEngine,
  type AmbientPref, type BgmMusicId, type BgmAmbientId,
} from '@/lib/timer-bgm'
import { loadPomodoroCount, recordPomodoroCompletion, type PomodoroDayCount } from '@/lib/pomodoro-count'
import { formatTime, formatTimeHHMM, formatDateISO } from '@/lib/timer-format'
import { FocusTimerImmersive } from './focus-timer-immersive'
import { FocusTimerMini } from './focus-timer-mini'

export type TimerMode = 'pomodoro' | 'stopwatch'
export type TimerState = 'idle' | 'running' | 'paused' | 'completed'
export type TimerPhase = 'work' | 'break'

/** What just ended — drives the completion copy in the display layers. */
export type CompletionKind = 'work' | 'break' | 'manual'

export interface CompletionState {
  kind: CompletionKind
  /** Where the sequence lands: auto-break continues, everything else idles. */
  next: 'break' | 'idle'
  /** Whether the session gets the ✓ suffix when recorded to the calendar. */
  completedFlag: boolean
}

// Gentle completion sequence (「溫柔收尾」). When a timer ends we no longer
// unmount the session screen in the same tick — the view holds in a
// 'completed' state so the chime, the ~1.5s BGM fade-out and the celebration
// all land, then the surface fades out over COMPLETION_EXIT_MS
// (opacity-only, ease-out-quart) before finalizing. Tapping anywhere skips.
const COMPLETION_HOLD_MS = 2600
const COMPLETION_HOLD_MANUAL_MS = 1400 // manual early end — shorter farewell
const COMPLETION_EXIT_MS = 400
const COMPLETION_BGM_FADE_S = 1.5

export interface TimerSession {
  mode: TimerMode
  /** Whether this session is a work block or a break block (for pomodoro). */
  phase: TimerPhase
  startedAt: Date
  /** Total ms accumulated across previous pause→resume cycles. */
  pausedMs: number
  /** Wall-clock when the current pause started, or null if running. */
  pausedAt: Date | null
  /** For pomodoro: target duration in seconds (locked at start). */
  targetSeconds: number
  label: string
  color: string
  taskId?: string
}

export interface TimerPrefs {
  breakMinutes: number
  autoStartBreak: boolean
  sound: TimerSoundKind
  music: BgmMusicId | null
  musicVolume: number
  ambient: Record<BgmAmbientId, AmbientPref>
  openInImmersive: boolean
}

const TIMER_PREFS_KEY = 'waddle-timer-prefs-v1'
const DEFAULT_AMBIENT = Object.fromEntries(
  BGM_AMBIENT.map((a) => [a.id, { enabled: false, volume: 0.5 }]),
) as Record<BgmAmbientId, AmbientPref>
const VALID_MUSIC_IDS: readonly BgmMusicId[] = [...BGM_MUSIC.map((m) => m.id), 'all']
const VALID_AMBIENT_IDS: readonly BgmAmbientId[] = BGM_AMBIENT.map((a) => a.id)
export const DEFAULT_PREFS: TimerPrefs = {
  breakMinutes: 5,
  autoStartBreak: true,
  sound: 'chime',
  music: null,
  musicVolume: 0.5,
  ambient: DEFAULT_AMBIENT,
  openInImmersive: false,
}
const BREAK_COLOR = '#9bbfac' // sage — calmer than the focus oranges

function loadPrefs(): TimerPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(TIMER_PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    const mergedAmbient = { ...DEFAULT_AMBIENT }
    if (parsed.ambient && typeof parsed.ambient === 'object') {
      for (const id of VALID_AMBIENT_IDS) {
        const a = parsed.ambient[id]
        if (a && typeof a === 'object') {
          mergedAmbient[id] = {
            enabled: !!a.enabled,
            volume: typeof a.volume === 'number' ? Math.max(0, Math.min(1, a.volume)) : 0.5,
          }
        }
      }
    }
    return {
      breakMinutes: typeof parsed.breakMinutes === 'number' ? parsed.breakMinutes : DEFAULT_PREFS.breakMinutes,
      autoStartBreak: typeof parsed.autoStartBreak === 'boolean' ? parsed.autoStartBreak : DEFAULT_PREFS.autoStartBreak,
      sound: ['chime', 'bell', 'beep', 'silent'].includes(parsed.sound) ? parsed.sound : DEFAULT_PREFS.sound,
      music: VALID_MUSIC_IDS.includes(parsed.music) ? parsed.music : null,
      musicVolume: typeof parsed.musicVolume === 'number' ? Math.max(0, Math.min(1, parsed.musicVolume)) : DEFAULT_PREFS.musicVolume,
      ambient: mergedAmbient,
      openInImmersive: typeof parsed.openInImmersive === 'boolean' ? parsed.openInImmersive : DEFAULT_PREFS.openInImmersive,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export const POMODORO_PRESETS = [
  { minutes: 25, label: '番茄鐘', color: '#e07b5a' },
  { minutes: 15, label: '短專注', color: '#7da2b8' },
  { minutes: 45, label: '長專注', color: '#8fae8b' },
  { minutes: 5, label: '短休息', color: '#c4a4b5' },
  { minutes: 10, label: '長休息', color: '#d4a76a' },
]

export const FOCUS_TYPES = [
  { key: 'focus', label: '專注工作', icon: Brain, color: '#e07b5a' },
  { key: 'deep', label: '深度工作', icon: BookOpen, color: '#7da2b8' },
  { key: 'exercise', label: '運動', icon: Dumbbell, color: '#8fae8b' },
  { key: 'break', label: '休息', icon: Coffee, color: '#c4a4b5' },
]
export type FocusTypeOption = (typeof FOCUS_TYPES)[number]

// ── Cross-route calendar-recording registration ────────────────────────
// MainLayout is the only place with the real `onCreateCalendarTimeBlock`
// mutation (it needs workspaces/categories to decide task-vs-time-block).
// It registers that function here on mount and unregisters on unmount.
// If a session finishes while no recorder is registered (user is on
// /notebook, or any route without MainLayout), the record is queued —
// in memory AND localStorage, so it survives a stray full reload too — and
// flushed the moment a recorder re-registers.
type RecorderFn = (
  date: string, startTime: string, endTime: string, type: string, label: string, color: string,
) => void

interface PendingCalendarRecord {
  date: string; startTime: string; endTime: string; type: string; label: string; color: string
}
const PENDING_QUEUE_KEY = 'waddle-timer-pending-records-v1'
const MAX_PENDING_QUEUE = 20

function loadPendingQueue(): PendingCalendarRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is PendingCalendarRecord =>
      r && typeof r === 'object'
      && typeof r.date === 'string' && typeof r.startTime === 'string'
      && typeof r.endTime === 'string' && typeof r.type === 'string'
      && typeof r.label === 'string' && typeof r.color === 'string')
  } catch {
    return []
  }
}
function savePendingQueue(records: PendingCalendarRecord[]) {
  if (typeof window === 'undefined') return
  try {
    if (records.length === 0) window.localStorage.removeItem(PENDING_QUEUE_KEY)
    else window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(records.slice(-MAX_PENDING_QUEUE)))
  } catch {}
}

// ── Context surface consumed by the idle setup card (focus-timer.tsx) ──
export interface FocusTimerContextValue {
  state: TimerState
  session: TimerSession | null
  displayTime: number

  isExpanded: boolean
  setIsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
  mode: TimerMode
  setMode: (v: TimerMode) => void
  selectedPreset: number
  setSelectedPreset: (v: number) => void
  customMinutes: number
  setCustomMinutes: (v: number) => void
  useCustom: boolean
  setUseCustom: (v: boolean) => void
  focusType: FocusTypeOption
  setFocusType: (v: FocusTypeOption) => void
  customLabel: string
  setCustomLabel: (v: string) => void
  showSettings: boolean
  setShowSettings: (v: boolean | ((prev: boolean) => boolean)) => void
  showBgmSettings: boolean
  setShowBgmSettings: (v: boolean | ((prev: boolean) => boolean)) => void
  bgmManualPlaying: boolean
  setBgmManualPlaying: (v: boolean | ((prev: boolean) => boolean)) => void
  prefs: TimerPrefs
  setPrefs: (v: TimerPrefs | ((prev: TimerPrefs) => TimerPrefs)) => void
  unavailableSrcs: Set<string>

  startTimer: (opts?: { immersive?: boolean }) => void
  /** MainLayout registers its onCreateCalendarTimeBlock here on mount;
   *  returns the unregister function for the effect cleanup. */
  registerRecorder: (fn: RecorderFn) => () => void
}

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null)

export function useFocusTimer(): FocusTimerContextValue {
  const ctx = useContext(FocusTimerContext)
  if (!ctx) throw new Error('useFocusTimer must be used within FocusTimerProvider')
  return ctx
}

// Mobile /notebook has no bottom tab bar but does have a full-width editor
// toolbar docked to the bottom edge (components/notebook/editor-toolbar.tsx)
// — a simple bigger offset keeps the mini pill from sitting on top of it.
const NOTEBOOK_MOBILE_MINI_BOTTOM_PX = 64

export function FocusTimerProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const { t } = useI18n()

  const [isExpanded, setIsExpanded] = useState(false)
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [state, setState] = useState<TimerState>('idle')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [customMinutes, setCustomMinutes] = useState(25)
  const [useCustom, setUseCustom] = useState(false)
  const [focusType, setFocusType] = useState<FocusTypeOption>(FOCUS_TYPES[0])
  const [customLabel, setCustomLabel] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showBgmSettings, setShowBgmSettings] = useState(false)
  const [bgmManualPlaying, setBgmManualPlaying] = useState(false)
  // Session-scoped BGM override driven by the immersive bar's play/pause
  // button: null = follow the timer (audible while running), 'off' = user
  // muted this session, 'on' = user forced audio on (e.g. wants music while
  // paused). Cleared on every session start and on every return to idle so
  // no stale flag can keep music alive after a session ends.
  const [bgmOverride, setBgmOverride] = useState<'on' | 'off' | null>(null)

  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [elapsed, setElapsed] = useState(0)
  const [session, setSession] = useState<TimerSession | null>(null)

  const [completion, setCompletion] = useState<CompletionState | null>(null)
  const [completionExiting, setCompletionExiting] = useState(false)
  const completionTimersRef = useRef<number[]>([])

  const [view, setView] = useState<'mini' | 'immersive'>('mini')

  const [pomodoroCount, setPomodoroCount] = useState<PomodoroDayCount | null>(null)
  useEffect(() => { setPomodoroCount(loadPomodoroCount()) }, [])

  const [prefs, setPrefs] = useState<TimerPrefs>(DEFAULT_PREFS)
  useEffect(() => { setPrefs(loadPrefs()) }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(TIMER_PREFS_KEY, JSON.stringify(prefs)) } catch {}
  }, [prefs])

  // Cost gate — audio/engine wiring only turns on once the user actually
  // opens the setup card or a session is running. Sticky: once engaged,
  // stays engaged (no teardown on close — that would just reload on the
  // next open for no benefit).
  const [engaged, setEngaged] = useState(false)
  useEffect(() => {
    if (!engaged && (isExpanded || state !== 'idle')) setEngaged(true)
  }, [engaged, isExpanded, state])

  // Sync prefs → BGM engine. Engine handles crossfades + per-track volume.
  useEffect(() => {
    if (typeof window === 'undefined' || !engaged) return
    const eng = getBgmEngine()
    if (!eng) return
    eng.setMusic(prefs.music)
    eng.setMusicVolume(prefs.musicVolume)
    for (const a of BGM_AMBIENT) {
      const p = prefs.ambient[a.id]
      eng.setAmbient(a.id, p.enabled, p.volume)
    }
  }, [engaged, prefs.music, prefs.musicVolume, prefs.ambient])

  // Track which audio files 404'd. Only starts probing once engaged.
  const [unavailableSrcs, setUnavailableSrcs] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (typeof window === 'undefined' || !engaged) return
    const eng = getBgmEngine()
    if (!eng) return
    const snapshot = () => {
      const next = new Set<string>()
      for (const m of BGM_MUSIC) if (!eng.isAvailable(m.src)) next.add(m.src)
      for (const a of BGM_AMBIENT) if (!eng.isAvailable(a.src)) next.add(a.src)
      setUnavailableSrcs(next)
    }
    eng.preload()
    snapshot()
    return eng.subscribe(snapshot)
  }, [engaged])

  // Single source of truth for "should BGM be audible right now".
  //  idle      → only the setup card's manual preview toggle
  //  completed → keeps playing only through a completed→break handoff; a
  //              completion that lands at idle ALWAYS winds down — this is
  //              what stops the music on 結束/中斷, and no manual flag can
  //              override it (the old `bgmManualPlaying || …` expression
  //              could get latched on and keep music playing forever)
  //  running   → audible unless the user muted; paused → silent unless the
  //              user explicitly pressed play while paused
  const bgmAudible =
    state === 'idle' ? bgmManualPlaying
    : bgmOverride === 'off' ? false
    : state === 'completed' ? completion?.next === 'break'
    : bgmOverride === 'on' ? true
    : state === 'running'

  // Drive the engine play/pause from the derived intent.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const eng = getBgmEngine()
    if (!eng) return
    if (bgmAudible) eng.setPlaying(true)
    else eng.setPlaying(false, state === 'completed' ? { fadeSeconds: COMPLETION_BGM_FADE_S } : undefined)
  }, [bgmAudible, state])
  useEffect(() => {
    const hasSelection = !!prefs.music || BGM_AMBIENT.some(a => prefs.ambient[a.id]?.enabled)
    if (!hasSelection && bgmManualPlaying) setBgmManualPlaying(false)
  }, [prefs.music, prefs.ambient, bgmManualPlaying])
  // Only stops audio / clears timers if the *provider itself* unmounts
  // (whole-app teardown, e.g. dev HMR of the root layout) — no longer on
  // route navigation, since the provider now lives above the router outlet.
  useEffect(() => {
    return () => {
      const eng = typeof window !== 'undefined' ? getBgmEngine() : null
      eng?.setPlaying(false)
      for (const t of completionTimersRef.current) window.clearTimeout(t)
      completionTimersRef.current = []
    }
  }, [])

  // Test-only debug accessor — lets Playwright confirm the BGM engine
  // wasn't stopped by a route navigation (the exact regression this
  // provider fixes) without reaching into lib/timer-bgm.ts's internals from
  // outside. Reads a field the class declares `private` in TS source, which
  // is not a runtime-enforced privacy boundary — harmless, read-only.
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as {
      __waddleTimerDebug?: {
        isBgmPlaying: () => boolean
        ctxState: () => string
        musicActive: () => boolean
        ambientStates: () => Array<{ id: string; paused: boolean; volume: number; targetVol: number }>
      }
    }).__waddleTimerDebug = {
      isBgmPlaying: () => Boolean((getBgmEngine() as unknown as { playing?: boolean } | null)?.playing),
      // `playing` is the *intent* flag; these two prove actual playback:
      // a live AudioContext and a connected music source node.
      ctxState: () => (getBgmEngine() as unknown as { ctx?: AudioContext | null } | null)?.ctx?.state ?? 'none',
      musicActive: () => {
        const eng = getBgmEngine() as unknown as { active?: unknown; activeStream?: unknown } | null
        return Boolean(eng?.active || eng?.activeStream)
      },
      // Ambient <audio> elements never enter the DOM (created via new
      // Audio()), so tests can't query them — surface their playback state
      // here instead. Same read-only private-field access as above.
      ambientStates: () => {
        const eng = getBgmEngine() as unknown as {
          ambient?: Map<string, { el: HTMLAudioElement; targetVol: number }>
        } | null
        if (!eng?.ambient) return []
        return Array.from(eng.ambient.entries()).map(([id, t]) => ({
          id, paused: t.el.paused, volume: t.el.volume, targetVol: t.targetVol,
        }))
      },
    }
  }, [])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const getTargetSeconds = useCallback(() => {
    if (useCustom) return customMinutes * 60
    return POMODORO_PRESETS[selectedPreset].minutes * 60
  }, [useCustom, customMinutes, selectedPreset])

  const startTimer = useCallback((opts?: { immersive?: boolean }) => {
    const eng = getBgmEngine()
    eng?.unlockAudio()
    eng?.prepareMusic(prefs.music)
    // A new session owns the audio lifecycle: drop any idle-preview flag or
    // previous session's mute so playback follows prefs + timer state again.
    setBgmManualPlaying(false)
    setBgmOverride(null)
    const now = new Date()
    const label = customLabel || (mode === 'pomodoro'
      ? (useCustom ? t('{minutes}分鐘專注', { minutes: customMinutes }) : t(POMODORO_PRESETS[selectedPreset].label))
      : t(focusType.label))
    const color = mode === 'pomodoro'
      ? (useCustom ? focusType.color : POMODORO_PRESETS[selectedPreset].color)
      : focusType.color
    const targetSeconds = getTargetSeconds()

    setSession({
      mode, phase: 'work', startedAt: now, pausedMs: 0, pausedAt: null,
      targetSeconds, label, color,
    })
    if (mode === 'pomodoro') setTimeLeft(targetSeconds)
    else setElapsed(0)
    setView(opts?.immersive || prefs.openInImmersive || isMobile ? 'immersive' : 'mini')
    setState('running')
  }, [customLabel, mode, useCustom, customMinutes, selectedPreset, focusType, prefs.music, prefs.openInImmersive, isMobile, getTargetSeconds, t])

  const startBreak = useCallback(() => {
    const breakSeconds = Math.max(1, Math.floor(prefs.breakMinutes)) * 60
    setSession({
      mode: 'pomodoro', phase: 'break', startedAt: new Date(), pausedMs: 0, pausedAt: null,
      targetSeconds: breakSeconds, label: t('休息 {min} 分', { min: prefs.breakMinutes }), color: BREAK_COLOR,
    })
    setTimeLeft(breakSeconds)
    setState('running')
  }, [prefs.breakMinutes, t])

  const pauseTimer = useCallback(() => {
    setSession((s) => (s ? { ...s, pausedAt: new Date() } : s))
    setState('paused')
  }, [])

  const resumeTimer = useCallback(() => {
    getBgmEngine()?.unlockAudio()
    setSession((s) => {
      if (!s) return s
      const addedPause = s.pausedAt ? Date.now() - s.pausedAt.getTime() : 0
      return { ...s, pausedAt: null, pausedMs: s.pausedMs + addedPause }
    })
    setState('running')
  }, [])

  // ── Recorder registration + offline queue ─────────────────────────
  const recorderRef = useRef<RecorderFn | null>(null)
  const pendingQueueRef = useRef<PendingCalendarRecord[]>([])
  useEffect(() => { pendingQueueRef.current = loadPendingQueue() }, [])

  const flushPendingQueue = useCallback((fn: RecorderFn) => {
    if (pendingQueueRef.current.length === 0) return
    const queue = pendingQueueRef.current
    pendingQueueRef.current = []
    savePendingQueue([])
    for (const r of queue) fn(r.date, r.startTime, r.endTime, r.type, r.label, r.color)
  }, [])

  const registerRecorder = useCallback((fn: RecorderFn) => {
    recorderRef.current = fn
    flushPendingQueue(fn)
    return () => {
      if (recorderRef.current === fn) recorderRef.current = null
    }
  }, [flushPendingQueue])

  const recordSessionToCalendar = useCallback((s: TimerSession, completed: boolean) => {
    const now = new Date()
    const startTime = formatTimeHHMM(s.startedAt)
    const endTime = formatTimeHHMM(now)
    const date = formatDateISO(s.startedAt)
    const durationMinutes = Math.floor((now.getTime() - s.startedAt.getTime()) / 60000)
    if (durationMinutes < 1) return
    const blockType = s.phase === 'break' ? 'break' : s.mode === 'pomodoro' ? 'pomodoro' : 'focus'
    const label = s.label + (completed ? ' ✓' : '')
    if (recorderRef.current) {
      recorderRef.current(date, startTime, endTime, blockType, label, s.color)
    } else {
      // No MainLayout mounted right now (e.g. the session ended while the
      // user was on /notebook) — queue it; the next registerRecorder() call
      // (MainLayout remounting) flushes it.
      const record: PendingCalendarRecord = { date, startTime, endTime, type: blockType, label, color: s.color }
      pendingQueueRef.current = [...pendingQueueRef.current, record]
      savePendingQueue(pendingQueueRef.current)
    }
  }, [])

  const resetTimer = useCallback(() => {
    setState('idle')
    setSession(null)
    setTimeLeft(getTargetSeconds())
    setElapsed(0)
    setCustomLabel('')
    // Every land-at-idle path funnels through here — returning to idle must
    // also return the audio to its silent baseline, whatever flags the
    // session (or a pre-session preview) left behind.
    setBgmManualPlaying(false)
    setBgmOverride(null)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [getTargetSeconds])
  // Update timeLeft when preset changes (only when idle) — same effect as
  // the original component; slightly redundant with resetTimer's own
  // setTimeLeft above (both fire when state flips to idle) but harmless and
  // kept to match original behavior exactly.
  useEffect(() => {
    if (state === 'idle') setTimeLeft(getTargetSeconds())
  }, [selectedPreset, customMinutes, useCustom, state, getTargetSeconds])

  const clearCompletionTimers = useCallback(() => {
    for (const t of completionTimersRef.current) window.clearTimeout(t)
    completionTimersRef.current = []
  }, [])

  const beginCompletion = useCallback((
    s: TimerSession, kind: CompletionKind, next: 'break' | 'idle', completedFlag: boolean, holdMs: number,
  ) => {
    clearCompletionTimers()
    setState('completed')
    setCompletion({ kind, next, completedFlag })
    setCompletionExiting(false)
    const finish = next === 'break'
      ? () => {
          recordSessionToCalendar(s, true)
          startBreak()
          setCompletionExiting(true)
          completionTimersRef.current = [window.setTimeout(() => {
            setCompletion(null)
            setCompletionExiting(false)
          }, COMPLETION_EXIT_MS)]
        }
      : () => {
          setCompletionExiting(true)
          completionTimersRef.current = [window.setTimeout(() => {
            recordSessionToCalendar(s, completedFlag)
            setCompletion(null)
            setCompletionExiting(false)
            resetTimer()
          }, COMPLETION_EXIT_MS)]
        }
    completionTimersRef.current = [window.setTimeout(finish, holdMs)]
  }, [clearCompletionTimers, recordSessionToCalendar, startBreak, resetTimer])

  const skipCompletion = useCallback(() => {
    if (!completion) return
    clearCompletionTimers()
    if (completion.next === 'break') {
      if (state === 'completed' && session) {
        recordSessionToCalendar(session, true)
        startBreak()
      }
      setCompletion(null)
      setCompletionExiting(false)
    } else {
      if (session) recordSessionToCalendar(session, completion.completedFlag)
      setCompletion(null)
      setCompletionExiting(false)
      resetTimer()
    }
  }, [completion, state, session, clearCompletionTimers, recordSessionToCalendar, startBreak, resetTimer])

  // Timer tick — wall-clock based. setInterval only triggers a recompute;
  // the actual elapsed time comes from (Date.now() - startedAt), so it stays
  // accurate across tab backgrounding, laptop sleep, OS throttling, AND
  // client-side route navigation (this effect never tears down on nav since
  // the provider itself doesn't unmount).
  useEffect(() => {
    if (state !== 'running' || !session) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    const tick = () => {
      const runningMs = Date.now() - session.startedAt.getTime() - session.pausedMs
      const runningSec = Math.max(0, Math.floor(runningMs / 1000))
      if (session.mode === 'pomodoro') {
        const remaining = session.targetSeconds - runningSec
        if (remaining <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          playTimerSound(prefs.sound)
          setTimeLeft(0)
          if (session.phase === 'work') {
            setPomodoroCount(recordPomodoroCompletion())
          }
          beginCompletion(
            session, session.phase,
            session.phase === 'work' && prefs.autoStartBreak ? 'break' : 'idle',
            true, COMPLETION_HOLD_MS,
          )
          return
        }
        setTimeLeft(remaining)
      } else {
        setElapsed(runningSec)
      }
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, session, prefs.sound, prefs.autoStartBreak])

  const activeTargetSeconds = session?.targetSeconds ?? getTargetSeconds()
  const progress = mode === 'pomodoro'
    ? ((activeTargetSeconds - timeLeft) / Math.max(1, activeTargetSeconds)) * 100
    : 0
  const displayTime = mode === 'pomodoro' ? timeLeft : elapsed

  // ── Portal target ready-check (SSR-safe: document doesn't exist on the
  // server render pass) ──
  const [canPortal, setCanPortal] = useState(false)
  useEffect(() => { setCanPortal(true) }, [])

  const contextValue = useMemo<FocusTimerContextValue>(() => ({
    state, session, displayTime,
    isExpanded, setIsExpanded,
    mode, setMode,
    selectedPreset, setSelectedPreset,
    customMinutes, setCustomMinutes,
    useCustom, setUseCustom,
    focusType, setFocusType,
    customLabel, setCustomLabel,
    showSettings, setShowSettings,
    showBgmSettings, setShowBgmSettings,
    bgmManualPlaying, setBgmManualPlaying,
    prefs, setPrefs,
    unavailableSrcs,
    startTimer,
    registerRecorder,
  }), [
    state, session, displayTime, isExpanded, mode, selectedPreset, customMinutes,
    useCustom, focusType, customLabel, showSettings, showBgmSettings, bgmManualPlaying,
    prefs, unavailableSrcs, startTimer, registerRecorder,
  ])

  let overlay: React.ReactNode = null
  if (state !== 'idle' && session) {
    const computedProgress = mode === 'pomodoro' ? progress : Math.min(100, (elapsed % 3600) / 36)
    if (view === 'immersive') {
      overlay = (
        <FocusTimerImmersive
          visible
          state={state}
          phase={session.phase}
          label={session.label}
          color={session.color}
          timeText={formatTime(displayTime)}
          progress={computedProgress}
          startedAtText={formatTimeHHMM(session.startedAt)}
          targetSeconds={session.targetSeconds}
          startedAt={session.startedAt}
          remainingSeconds={mode === 'pomodoro' ? timeLeft : null}
          pomodoroCount={pomodoroCount?.count ?? 0}
          music={prefs.music}
          musicVolume={prefs.musicVolume}
          ambient={prefs.ambient}
          completion={completion ? { kind: completion.kind, next: completion.next, exiting: completionExiting } : null}
          bgmPlaying={bgmAudible}
          unavailableSrcs={unavailableSrcs}
          onPause={pauseTimer}
          onResume={resumeTimer}
          onExit={() => {
            if (state === 'completed') { skipCompletion(); return }
            beginCompletion(session, 'manual', 'idle', false, COMPLETION_HOLD_MANUAL_MS)
            setIsExpanded(false)
          }}
          onSkipCompletion={skipCompletion}
          onMinimize={() => setView('mini')}
          onToggleBgm={() => {
            getBgmEngine()?.unlockAudio()
            // Real in-session mute/unmute (the old latch had no audible
            // effect while running): audible now → mute for this session;
            // silent (paused, or muted earlier) → force it on.
            setBgmOverride(bgmAudible ? 'off' : 'on')
          }}
          onSelectMusic={(id) => {
            const eng = getBgmEngine()
            eng?.unlockAudio()
            eng?.prepareMusic(id)
            setPrefs((p) => ({ ...p, music: id }))
          }}
          onMusicVolumeChange={(v) => setPrefs((p) => ({ ...p, musicVolume: v }))}
          onToggleAmbient={(id) => {
            getBgmEngine()?.unlockAudio()
            setPrefs((prevP) => ({
              ...prevP,
              ambient: { ...prevP.ambient, [id]: { ...prevP.ambient[id], enabled: !prevP.ambient[id].enabled } },
            }))
          }}
          onAmbientVolumeChange={(id, v) => setPrefs((prevP) => ({
            ...prevP,
            ambient: { ...prevP.ambient, [id]: { ...prevP.ambient[id], volume: v } },
          }))}
        />
      )
    } else {
      const onNotebook = pathname?.startsWith('/notebook') ?? false
      overlay = (
        <FocusTimerMini
          state={state}
          phase={session.phase}
          color={session.color}
          timeText={formatTime(displayTime)}
          progress={computedProgress}
          label={session.label}
          isMobile={isMobile}
          mobileBottomOffsetPx={isMobile && onNotebook ? NOTEBOOK_MOBILE_MINI_BOTTOM_PX : undefined}
          completion={completion ? { kind: completion.kind, exiting: completionExiting } : null}
          onPause={pauseTimer}
          onResume={resumeTimer}
          onExpand={() => setView('immersive')}
          onStop={() => beginCompletion(session, 'manual', 'idle', false, COMPLETION_HOLD_MANUAL_MS)}
          onSkipCompletion={skipCompletion}
        />
      )
    }
  }

  return (
    <FocusTimerContext.Provider value={contextValue}>
      {children}
      {canPortal && overlay ? createPortal(overlay, document.body) : null}
    </FocusTimerContext.Provider>
  )
}
