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
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
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
import {
  closeFloatingHub, getHubServerState, getHubState, hubAvailable,
  openFloatingHub, setHubTab, subscribeHub,
} from '@/lib/floating-hub'
import { FloatingTimerCard } from './floating-timer-card'
import { FocusTimerImmersive } from './focus-timer-immersive'
import { FocusTimerMini } from './focus-timer-mini'
import { FocusSessionLogModal } from './focus-session-log-modal'

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
  /** Non-null for a >=60s completed *work* session — drives the random
   *  praise line + actual duration in place of the generic completion copy.
   *  `seconds` is the actual focused time (pauses excluded), captured once
   *  at completion so it doesn't keep ticking during the wind-down hold. */
  praise: { key: string; seconds: number } | null
}

// One gentle voice, many variations — picked at random per completed work
// session so the ending doesn't feel like the same canned line every time.
// Keys double as i18n dictionary keys (lib/i18n/dict/timer.ts); `{duration}`
// is filled via formatFocusDuration.
const PRAISE_KEYS = [
  '這次又專注了 {duration}，超棒！',
  '剛剛專注了 {duration}，給自己一點掌聲！',
  '{duration} 的專注入袋，繼續保持！',
  '好穩，這一段專注了 {duration}！',
  '又累積了 {duration} 的專注，太厲害了！',
  '專注 {duration} 達成，小企鵝為你驕傲 🐧',
]

/** Actual focused seconds for `s` right now — wall-clock elapsed minus every
 *  pause (completed pauses via pausedMs, an in-progress one via pausedAt).
 *  Pure function of `s` + Date.now(), no component state involved. */
function focusedSecondsOf(s: TimerSession): number {
  const ms = Date.now() - s.startedAt.getTime() - s.pausedMs
    - (s.pausedAt ? Date.now() - s.pausedAt.getTime() : 0)
  return Math.max(0, Math.floor(ms / 1000))
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
  notes?: string,
) => void

interface PendingCalendarRecord {
  date: string; startTime: string; endTime: string; type: string; label: string; color: string
  notes?: string
}
const PENDING_QUEUE_KEY = 'waddle-timer-pending-records-v1'
const MAX_PENDING_QUEUE = 20
// A completed work session's record while its optional "what did you get
// done?" dialog is still open — survives a stray reload so an unanswered
// dialog doesn't silently lose the session (see the mount-time recovery
// effect below, next to pendingQueueRef's own load).
const SESSION_LOG_PENDING_KEY = 'waddle-timer-pending-log-v1'

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
      && typeof r.label === 'string' && typeof r.color === 'string'
      && (r.notes === undefined || typeof r.notes === 'string'))
  } catch {
    return []
  }
}

/** Same shape check as loadPendingQueue's filter, for the single record
 *  parked under SESSION_LOG_PENDING_KEY. */
function isPendingCalendarRecord(r: unknown): r is PendingCalendarRecord {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return typeof o.date === 'string' && typeof o.startTime === 'string'
    && typeof o.endTime === 'string' && typeof o.type === 'string'
    && typeof o.label === 'string' && typeof o.color === 'string'
    && (o.notes === undefined || typeof o.notes === 'string')
}
function savePendingQueue(records: PendingCalendarRecord[]) {
  if (typeof window === 'undefined') return
  try {
    if (records.length === 0) window.localStorage.removeItem(PENDING_QUEUE_KEY)
    else window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(records.slice(-MAX_PENDING_QUEUE)))
  } catch {}
}

/** Pure calendar-record shape for a session — `null` if it was too short to
 *  bother recording (<1 wall-clock minute), same threshold the original
 *  recordSessionToCalendar always used. No side effects; committing it
 *  (writing to the DB or the offline queue) is a separate step so the
 *  post-session dialog can hold the record and let the user retitle it
 *  before it's actually written. */
function buildSessionRecord(s: TimerSession, completed: boolean): PendingCalendarRecord | null {
  const now = new Date()
  const startTime = formatTimeHHMM(s.startedAt)
  const endTime = formatTimeHHMM(now)
  const date = formatDateISO(s.startedAt)
  const durationMinutes = Math.floor((now.getTime() - s.startedAt.getTime()) / 60000)
  if (durationMinutes < 1) return null
  const blockType = s.phase === 'break' ? 'break' : s.mode === 'pomodoro' ? 'pomodoro' : 'focus'
  const label = s.label + (completed ? ' ✓' : '')
  return { date, startTime, endTime, type: blockType, label, color: s.color }
}

// ── Cross-reload session persistence ────────────────────────────────────
// Closing the tab/browser used to lose a running session outright (state
// lived only in React memory). The tick loop is already wall-clock based
// (Date.now() - startedAt), so persisting the session's *inputs* is enough
// to resume it losslessly on the next load — no separate "elapsed so far"
// bookkeeping needed.
const ACTIVE_SESSION_KEY = 'waddle-timer-active-session-v1'
// A zombie session (tab left open/forgotten far longer than any real focus
// block) shouldn't silently resume days later — give up past this age.
const ACTIVE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Defensive parse of the persisted session, mirroring loadPendingQueue's
 *  strict per-field validation — malformed/tampered localStorage must never
 *  crash the restore path, just fall back to discarding it. */
function parsePersistedSession(raw: string): TimerSession | null {
  try {
    const p = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    if (p.mode !== 'pomodoro' && p.mode !== 'stopwatch') return null
    if (p.phase !== 'work' && p.phase !== 'break') return null
    if (typeof p.startedAt !== 'string') return null
    const startedAt = new Date(p.startedAt)
    if (Number.isNaN(startedAt.getTime())) return null
    if (typeof p.pausedMs !== 'number' || !Number.isFinite(p.pausedMs) || p.pausedMs < 0) return null
    let pausedAt: Date | null = null
    if (p.pausedAt !== null && p.pausedAt !== undefined) {
      if (typeof p.pausedAt !== 'string') return null
      pausedAt = new Date(p.pausedAt)
      if (Number.isNaN(pausedAt.getTime())) return null
    }
    if (typeof p.targetSeconds !== 'number' || !Number.isFinite(p.targetSeconds) || p.targetSeconds <= 0) return null
    if (typeof p.label !== 'string') return null
    if (typeof p.color !== 'string') return null
    if (p.taskId !== undefined && typeof p.taskId !== 'string') return null
    return {
      mode: p.mode, phase: p.phase, startedAt, pausedMs: p.pausedMs, pausedAt,
      targetSeconds: p.targetSeconds, label: p.label, color: p.color,
      ...(p.taskId !== undefined ? { taskId: p.taskId as string } : {}),
    }
  } catch {
    return null
  }
}

/** Record for a pomodoro that fully elapsed while the tab was closed —
 *  restored post-hoc, so there's no live completion animation to run; the
 *  calendar block's end-time reflects when the session WOULD have ended
 *  (start + target + accumulated pauses), not the wall-clock moment the tab
 *  happened to reopen (which could be hours later). */
function buildExpiredWhileClosedRecord(s: TimerSession): PendingCalendarRecord {
  const endedAt = new Date(s.startedAt.getTime() + s.targetSeconds * 1000 + s.pausedMs)
  const blockType = s.phase === 'break' ? 'break' : s.mode === 'pomodoro' ? 'pomodoro' : 'focus'
  return {
    date: formatDateISO(s.startedAt),
    startTime: formatTimeHHMM(s.startedAt),
    endTime: formatTimeHHMM(endedAt),
    type: blockType,
    label: s.label + ' ✓',
    color: s.color,
  }
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

  /** `presetIndex` 指定 POMODORO_PRESETS 直接開跑；`stopwatch` 直接開正計時
   *  （兩者都是懸浮工作站快速開始用的捷徑）；`forceMini` 跳過「開始時進沉浸
   *  畫面」偏好——從懸浮視窗啟動時，主視窗突然蓋上全螢幕會嚇到人。 */
  startTimer: (opts?: { immersive?: boolean; presetIndex?: number; stopwatch?: boolean; forceMini?: boolean }) => void
  /** MainLayout registers its onCreateCalendarTimeBlock here on mount;
   *  returns the unregister function for the effect cleanup. */
  registerRecorder: (fn: RecorderFn) => () => void

  // ── 懸浮工作站（子母畫面）────────────────────────────
  /** 懸浮視窗裡的計時卡（<FloatingHub> 的計時器分頁渲染它）。
   *  idle 時為 null——那時工作站顯示快速開始畫面。 */
  floatingTimerCard: React.ReactNode
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

  // Post-session "what did you get done?" dialog. Set once a completed work
  // session's calendar record is ready but before it's actually written —
  // see finalizeSession/resolveSessionLog below. Independent of `state`/
  // `session` so it survives straight through an auto-started break or a
  // brand new session starting underneath it.
  const [sessionLog, setSessionLog] = useState<{
    record: PendingCalendarRecord
    completed: boolean
    focusedSeconds: number
  } | null>(null)

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
  //
  // Session default is now MUTED, not autoplay: startTimer() sets
  // bgmOverride to 'off' unless the user was already previewing music from
  // idle. It only turns on again when the user does something in-session
  // that clearly means "play it" — the immersive bar's play/pause toggle,
  // picking a track, or switching an ambient sound on (see onSelectMusic /
  // onToggleAmbient below, both call setBgmOverride('on')). Nobody should
  // have to hit pause every single session just to get silence.
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

  const startTimer = useCallback((opts?: { immersive?: boolean; presetIndex?: number; stopwatch?: boolean; forceMini?: boolean }) => {
    const eng = getBgmEngine()
    eng?.unlockAudio()
    eng?.prepareMusic(prefs.music)
    // A new session owns the audio lifecycle: drop any idle-preview flag.
    // BGM now defaults OFF for a session (users found "always plays, have
    // to manually pause every time" annoying) — UNLESS the user was already
    // previewing music from idle (bgmManualPlaying), which is an explicit
    // signal they want to keep listening straight into the session.
    setBgmManualPlaying(false)
    setBgmOverride(bgmManualPlaying ? null : 'off')
    // 懸浮工作站的快速開始：指定 preset（倒數）或 stopwatch（正計時）直接
    // 開跑，不吃設定卡當下的 mode/custom 狀態（也把它們同步過去，回主視窗
    // 看到的選擇才一致）。
    const preset = opts?.presetIndex != null ? POMODORO_PRESETS[opts.presetIndex] : null
    if (preset) {
      setMode('pomodoro')
      setSelectedPreset(opts!.presetIndex!)
      setUseCustom(false)
    } else if (opts?.stopwatch) {
      setMode('stopwatch')
    }
    const effMode: TimerMode = preset ? 'pomodoro' : opts?.stopwatch ? 'stopwatch' : mode
    const now = new Date()
    const label = preset
      ? (customLabel || t(preset.label))
      : opts?.stopwatch
        ? (customLabel || t(focusType.label))
        : customLabel || (mode === 'pomodoro'
          ? (useCustom ? t('{minutes}分鐘專注', { minutes: customMinutes }) : t(POMODORO_PRESETS[selectedPreset].label))
          : t(focusType.label))
    const color = preset
      ? preset.color
      : opts?.stopwatch || mode !== 'pomodoro'
        ? focusType.color
        : (useCustom ? focusType.color : POMODORO_PRESETS[selectedPreset].color)
    const targetSeconds = preset ? preset.minutes * 60 : getTargetSeconds()

    setSession({
      mode: effMode, phase: 'work', startedAt: now, pausedMs: 0, pausedAt: null,
      targetSeconds, label, color,
    })
    if (effMode === 'pomodoro') setTimeLeft(targetSeconds)
    else setElapsed(0)
    setView(
      opts?.forceMini ? 'mini'
      : opts?.immersive || prefs.openInImmersive || isMobile ? 'immersive'
      : 'mini',
    )
    setState('running')
  }, [customLabel, mode, useCustom, customMinutes, selectedPreset, focusType, prefs.music, prefs.openInImmersive, isMobile, getTargetSeconds, t, bgmManualPlaying])

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
  // On mount: load the offline queue, and fold in a session-log record that
  // was left parked under SESSION_LOG_PENDING_KEY (the user closed/reloaded
  // the tab while the "what did you get done?" dialog was still open — the
  // record itself was already safe to write, just missing its title/notes,
  // so it's treated as a plain completed focus session and queued normally).
  useEffect(() => {
    const queue = loadPendingQueue()
    let merged = queue
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(SESSION_LOG_PENDING_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (isPendingCalendarRecord(parsed)) merged = [...merged, parsed]
        }
      } catch {}
      try { window.localStorage.removeItem(SESSION_LOG_PENDING_KEY) } catch {}
    }
    pendingQueueRef.current = merged
    if (merged.length !== queue.length) savePendingQueue(merged)
  }, [])

  const flushPendingQueue = useCallback((fn: RecorderFn) => {
    if (pendingQueueRef.current.length === 0) return
    const queue = pendingQueueRef.current
    pendingQueueRef.current = []
    savePendingQueue([])
    for (const r of queue) fn(r.date, r.startTime, r.endTime, r.type, r.label, r.color, r.notes)
  }, [])

  const registerRecorder = useCallback((fn: RecorderFn) => {
    recorderRef.current = fn
    flushPendingQueue(fn)
    return () => {
      if (recorderRef.current === fn) recorderRef.current = null
    }
  }, [flushPendingQueue])

  // Actually writes a built record — to the registered recorder if one's
  // mounted (MainLayout), otherwise the offline queue. Split out from
  // buildSessionRecord so the post-session dialog can hold a built record,
  // let the user retitle/annotate it, and only commit once resolved.
  const commitRecord = useCallback((record: PendingCalendarRecord) => {
    if (recorderRef.current) {
      recorderRef.current(record.date, record.startTime, record.endTime, record.type, record.label, record.color, record.notes)
    } else {
      pendingQueueRef.current = [...pendingQueueRef.current, record]
      savePendingQueue(pendingQueueRef.current)
    }
  }, [])

  // ── Cross-reload session recovery ──────────────────────────────────
  // Mount-once restore. Declared BEFORE the persistence-write effect below
  // (same reasoning as pendingQueueRef's load vs. flushPendingQueue): on the
  // very first commit both effects still close over the pre-restore state
  // ('idle'/null), so ordering here doesn't change *that* — but this one
  // must physically run first so it gets to read the key before anything
  // else touches it. It deletes the key unconditionally up front; if the
  // session is worth resuming, the persistence-write effect below re-writes
  // it fresh on the very next render (triggered by this effect's setState
  // calls), so nothing is lost either way.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let raw: string | null = null
    try { raw = window.localStorage.getItem(ACTIVE_SESSION_KEY) } catch {}
    if (!raw) return
    try { window.localStorage.removeItem(ACTIVE_SESSION_KEY) } catch {}
    const restored = parsePersistedSession(raw)
    if (!restored) return // malformed/tampered — discard
    if (Date.now() - restored.startedAt.getTime() > ACTIVE_SESSION_MAX_AGE_MS) return // zombie session — discard

    if (restored.pausedAt) {
      // Paused sessions never expire — resume frozen at the exact instant
      // they were paused, same math pauseTimer/resumeTimer already use.
      const frozenMs = restored.pausedAt.getTime() - restored.startedAt.getTime() - restored.pausedMs
      const frozenSec = Math.max(0, Math.floor(frozenMs / 1000))
      setSession(restored)
      setMode(restored.mode)
      if (restored.mode === 'pomodoro') setTimeLeft(Math.max(0, restored.targetSeconds - frozenSec))
      else setElapsed(frozenSec)
      setState('paused')
      setView('mini')
      return
    }

    const runningSec = Math.floor((Date.now() - restored.startedAt.getTime() - restored.pausedMs) / 1000)
    if (restored.mode === 'pomodoro' && runningSec >= restored.targetSeconds) {
      // Fully elapsed while the tab was closed — nobody was there to see
      // the completion animation or praise, so just record it and land at
      // idle, same bookkeeping tick() would have done for a completed work
      // block (today's pomodoro-dot count included).
      commitRecord(buildExpiredWhileClosedRecord(restored))
      if (restored.phase === 'work') setPomodoroCount(recordPomodoroCompletion())
      return
    }

    setSession(restored)
    setMode(restored.mode)
    if (restored.mode === 'pomodoro') setTimeLeft(Math.max(0, restored.targetSeconds - runningSec))
    else setElapsed(Math.max(0, runningSec))
    setState('running')
    setView('mini')
    // Reopening the page always resumes muted — consistent with the
    // session-default-off behavior in startTimer (see requirement A above).
    setBgmOverride('off')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the running/paused session's *inputs* (not derived display
  // state) so a reload can reconstruct it losslessly — the tick loop is
  // already wall-clock based, so restoring startedAt/pausedMs/pausedAt is
  // enough. Cleared the moment the session leaves running/paused (idle or
  // completed), so a stale key can never outlive the session it describes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((state === 'running' || state === 'paused') && session) {
      try {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
          mode: session.mode,
          phase: session.phase,
          startedAt: session.startedAt.toISOString(),
          pausedMs: session.pausedMs,
          pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
          targetSeconds: session.targetSeconds,
          label: session.label,
          color: session.color,
          ...(session.taskId !== undefined ? { taskId: session.taskId } : {}),
        }))
      } catch {}
    } else {
      try { window.localStorage.removeItem(ACTIVE_SESSION_KEY) } catch {}
    }
  }, [state, session])

  // Ends a session's recording lifecycle. Break blocks (and anything too
  // short to record) commit immediately, unchanged from before. A completed
  // *work* block instead holds its record in `sessionLog` and parks a copy
  // in localStorage — commitRecord only actually runs once the "what did you
  // get done?" dialog resolves (resolveSessionLog below), whether that's an
  // explicit save, a skip, or the reload-recovery path above.
  const finalizeSession = useCallback((s: TimerSession, completed: boolean) => {
    const record = buildSessionRecord(s, completed)
    if (!record) return
    if (s.phase !== 'work') {
      commitRecord(record)
      return
    }
    const focusedSeconds = focusedSecondsOf(s)
    setSessionLog({ record, completed, focusedSeconds })
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(SESSION_LOG_PENDING_KEY, JSON.stringify(record)) } catch {}
    }
  }, [commitRecord])

  // Resolves the post-session dialog: `input` non-null applies a trimmed
  // title/note onto the held record before committing (title replaces the
  // label, re-appending the ✓ the original label carried; note fills
  // `notes`); `input` null (skip, Esc, or backdrop click) commits the record
  // exactly as built. Either way the record always gets written — this only
  // decides whether it gets a custom title/notes.
  const resolveSessionLog = useCallback((input: { title: string; note: string } | null) => {
    if (!sessionLog) return
    let finalRecord = sessionLog.record
    if (input) {
      const title = input.title.trim()
      const note = input.note.trim()
      finalRecord = {
        ...finalRecord,
        ...(title ? { label: title + (sessionLog.completed ? ' ✓' : '') } : {}),
        ...(note ? { notes: note } : {}),
      }
    }
    commitRecord(finalRecord)
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(SESSION_LOG_PENDING_KEY) } catch {}
    }
    setSessionLog(null)
  }, [sessionLog, commitRecord])

  const resetTimer = useCallback(() => {
    setState('idle')
    setSession(null)
    // 計時結束**不**收掉懸浮工作站——回到 idle 時計時器分頁會換成
    // 快速開始畫面（而且記事本/白板分頁可能還在用）。
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
    // Praise only for a completed *work* stretch of real substance: natural
    // pomodoro/stopwatch completion (`kind === 'work'`), or a manual stop
    // mid-work-session — never a break ending (kind 'break'), and never a
    // <60s session (the "先到這裡也很好" fallback stays for those).
    const praiseEligible = (kind === 'work' || (kind === 'manual' && s.phase === 'work'))
      && focusedSecondsOf(s) >= 60
    const praise = praiseEligible
      ? { key: PRAISE_KEYS[Math.floor(Math.random() * PRAISE_KEYS.length)], seconds: focusedSecondsOf(s) }
      : null
    setCompletion({ kind, next, completedFlag, praise })
    setCompletionExiting(false)
    const finish = next === 'break'
      ? () => {
          finalizeSession(s, true)
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
            finalizeSession(s, completedFlag)
            setCompletion(null)
            setCompletionExiting(false)
            resetTimer()
          }, COMPLETION_EXIT_MS)]
        }
    completionTimersRef.current = [window.setTimeout(finish, holdMs)]
  }, [clearCompletionTimers, finalizeSession, startBreak, resetTimer])

  const skipCompletion = useCallback(() => {
    if (!completion) return
    clearCompletionTimers()
    if (completion.next === 'break') {
      if (state === 'completed' && session) {
        finalizeSession(session, true)
        startBreak()
      }
      setCompletion(null)
      setCompletionExiting(false)
    } else {
      if (session) finalizeSession(session, completion.completedFlag)
      setCompletion(null)
      setCompletionExiting(false)
      resetTimer()
    }
  }, [completion, state, session, clearCompletionTimers, finalizeSession, startBreak, resetTimer])

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

  // ── 懸浮工作站（Document Picture-in-Picture）────────────────────────
  // 那顆唯一的置頂視窗現在由 lib/floating-hub.ts + <FloatingHub> 管；
  // 這裡只負責兩件事：⑴ 判斷這環境能不能懸浮（決定迷你膠囊的彈出鈕顯不
  // 顯示）；⑵ 產出計時卡節點交給工作站的計時器分頁渲染。計時卡是 portal
  // 內容、仍屬這棵 React 樹，所以懸浮視窗裡的暫停/繼續/結束吃的就是上面
  // 那台 state machine——不需要跨視窗同步。
  const [canFloatTimer, setCanFloatTimer] = useState(false)
  useEffect(() => { setCanFloatTimer(hubAvailable()) }, [])
  const hub = useSyncExternalStore(subscribeHub, getHubState, getHubServerState)
  const hubOpenOnTimer = hub.window !== null && hub.tab === 'timer'

  // 計時卡節點（idle 時 null，工作站那邊會改顯示快速開始畫面）。
  const floatingTimerCard: React.ReactNode = session && state !== 'idle' ? (
    <FloatingTimerCard
      state={state}
      phase={session.phase}
      color={session.color}
      timeText={formatTime(displayTime)}
      progress={mode === 'pomodoro' ? progress : Math.min(100, (elapsed % 3600) / 36)}
      label={session.label}
      completion={completion ? { kind: completion.kind, exiting: completionExiting, praise: completion.praise } : null}
      onPause={pauseTimer}
      onResume={resumeTimer}
      onStop={() => beginCompletion(session, 'manual', 'idle', false, COMPLETION_HOLD_MANUAL_MS)}
      onSkipCompletion={skipCompletion}
      onReturn={closeFloatingHub}
    />
  ) : null

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
    floatingTimerCard,
  }), [
    state, session, displayTime, isExpanded, mode, selectedPreset, customMinutes,
    useCustom, focusType, customLabel, showSettings, showBgmSettings, bgmManualPlaying,
    prefs, unavailableSrcs, startTimer, registerRecorder, floatingTimerCard,
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
          completion={completion ? { kind: completion.kind, next: completion.next, exiting: completionExiting, praise: completion.praise } : null}
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
            // Picking a track mid-session is an explicit "play it" signal —
            // session BGM now defaults off (see startTimer), so this is the
            // only way music would ever start without the play/pause toggle.
            setBgmOverride('on')
          }}
          onMusicVolumeChange={(v) => setPrefs((p) => ({ ...p, musicVolume: v }))}
          onToggleAmbient={(id) => {
            getBgmEngine()?.unlockAudio()
            // Only turning an ambient sound ON counts as "play it"; turning
            // one off shouldn't yank the override away from whatever else
            // might still be selected. Read from the outer `prefs` (not the
            // updater's `prevP`) since we need "was it off a moment ago",
            // not the post-toggle value.
            const wasEnabled = prefs.ambient[id]?.enabled
            setPrefs((prevP) => ({
              ...prevP,
              ambient: { ...prevP.ambient, [id]: { ...prevP.ambient[id], enabled: !prevP.ambient[id].enabled } },
            }))
            if (!wasEnabled) setBgmOverride('on')
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
          completion={completion ? { kind: completion.kind, exiting: completionExiting, praise: completion.praise } : null}
          onPause={pauseTimer}
          onResume={resumeTimer}
          onExpand={() => setView('immersive')}
          onStop={() => beginCompletion(session, 'manual', 'idle', false, COMPLETION_HOLD_MANUAL_MS)}
          onSkipCompletion={skipCompletion}
          canFloat={canFloatTimer}
          isFloating={hubOpenOnTimer}
          onToggleFloat={() => {
            // 沒開 → 開工作站到計時器分頁；開著但停在別的分頁 → 切過去；
            // 已經在看計時器 → 收回。
            if (!hub.window) void openFloatingHub('timer')
            else if (hub.tab !== 'timer') setHubTab('timer')
            else closeFloatingHub()
          }}
        />
      )
    }
  }

  return (
    <FocusTimerContext.Provider value={contextValue}>
      {children}
      {canPortal && overlay ? createPortal(overlay, document.body) : null}
      {/* Independent of `state`/`session` on purpose — an auto-started break
          or a brand new session must not clear an unanswered dialog. */}
      {sessionLog && (
        <FocusSessionLogModal
          focusedSeconds={sessionLog.focusedSeconds}
          onSave={(title, note) => resolveSessionLog({ title, note })}
          onSkip={() => resolveSessionLog(null)}
        />
      )}
    </FocusTimerContext.Provider>
  )
}
