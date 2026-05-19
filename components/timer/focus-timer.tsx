'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Pause, Square, RotateCcw, Timer, Clock,
  ChevronDown, ChevronUp, Settings2, Check, X,
  Coffee, Brain, Dumbbell, BookOpen, Volume2, VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Task, Workspace } from '@/lib/types'
import { toDateString } from '@/lib/calendar-utils'
import { playTimerSound, TIMER_SOUND_LABELS, type TimerSoundKind } from '@/lib/timer-sound'
import {
  BGM_MUSIC, BGM_AMBIENT, getBgmEngine, summarizeBgm,
  ALL_MUSIC_ID, ALL_MUSIC_LABEL, ALL_MUSIC_EMOJI,
  type AmbientPref, type BgmMusicId, type BgmAmbientId,
} from '@/lib/timer-bgm'
import { Music2 } from 'lucide-react'
import { FocusTimerImmersive } from './focus-timer-immersive'

interface FocusTimerProps {
  workspaces: Workspace[]
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string) => void
}

type TimerMode = 'pomodoro' | 'stopwatch'
type TimerState = 'idle' | 'running' | 'paused'
type TimerPhase = 'work' | 'break'

interface TimerSession {
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

interface TimerPrefs {
  breakMinutes: number
  autoStartBreak: boolean
  sound: TimerSoundKind
  // Background music during the session (null = off). At most one.
  music: BgmMusicId | null
  musicVolume: number
  // Stackable ambient overlays, each with its own enable + volume.
  ambient: Record<BgmAmbientId, AmbientPref>
}

const TIMER_PREFS_KEY = 'waddle-timer-prefs-v1'
// Derive default ambient state from the BGM_AMBIENT manifest so adding a new
// overlay needs only one edit (in lib/timer-bgm.ts).
const DEFAULT_AMBIENT = Object.fromEntries(
  BGM_AMBIENT.map((a) => [a.id, { enabled: false, volume: 0.5 }]),
) as Record<BgmAmbientId, AmbientPref>
const VALID_MUSIC_IDS: readonly BgmMusicId[] = [...BGM_MUSIC.map((m) => m.id), ALL_MUSIC_ID]
const VALID_AMBIENT_IDS: readonly BgmAmbientId[] = BGM_AMBIENT.map((a) => a.id)
const DEFAULT_PREFS: TimerPrefs = {
  breakMinutes: 5,
  autoStartBreak: true,
  sound: 'chime',
  music: null,
  musicVolume: 0.5,
  ambient: DEFAULT_AMBIENT,
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
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const POMODORO_PRESETS = [
  { minutes: 25, label: '番茄鐘', color: '#e07b5a' },
  { minutes: 15, label: '短專注', color: '#7da2b8' },
  { minutes: 45, label: '長專注', color: '#8fae8b' },
  { minutes: 5, label: '短休息', color: '#c4a4b5' },
  { minutes: 10, label: '長休息', color: '#d4a76a' },
]

const FOCUS_TYPES = [
  { key: 'focus', label: '專注工作', icon: Brain, color: '#e07b5a' },
  { key: 'deep', label: '深度工作', icon: BookOpen, color: '#7da2b8' },
  { key: 'exercise', label: '運動', icon: Dumbbell, color: '#8fae8b' },
  { key: 'break', label: '休息', icon: Coffee, color: '#c4a4b5' },
]

export function FocusTimer({ workspaces, onCreateTimeBlock }: FocusTimerProps) {
  const isMobile = useIsMobile()
  const [isExpanded, setIsExpanded] = useState(false)
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const [state, setState] = useState<TimerState>('idle')
  const [selectedPreset, setSelectedPreset] = useState(0)
  const [customMinutes, setCustomMinutes] = useState(25)
  const [useCustom, setUseCustom] = useState(false)
  const [focusType, setFocusType] = useState(FOCUS_TYPES[0])
  const [customLabel, setCustomLabel] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  // Sound/music subsection collapse — default closed so the settings panel
  // doesn't look like a wall of chips and sliders the first time it opens.
  const [showBgmSettings, setShowBgmSettings] = useState(false)
  // Standalone music playback — independent of timer state so the user can
  // listen without starting a session. Combined with timer state below so
  // running a timer still auto-plays as before.
  const [bgmManualPlaying, setBgmManualPlaying] = useState(false)
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(25 * 60) // seconds for pomodoro
  const [elapsed, setElapsed] = useState(0) // seconds for stopwatch
  const [session, setSession] = useState<TimerSession | null>(null)

  // User preferences (break length, auto-break, sound choice). Loaded from
  // localStorage on mount and persisted on every change so they survive
  // refreshes and dev hot reloads.
  const [prefs, setPrefs] = useState<TimerPrefs>(DEFAULT_PREFS)
  useEffect(() => { setPrefs(loadPrefs()) }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(TIMER_PREFS_KEY, JSON.stringify(prefs)) } catch {}
  }, [prefs])

  // Sync prefs → BGM engine. Engine handles crossfades + per-track volume.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const eng = getBgmEngine()
    if (!eng) return
    eng.setMusic(prefs.music)
    eng.setMusicVolume(prefs.musicVolume)
    for (const a of BGM_AMBIENT) {
      const p = prefs.ambient[a.id]
      eng.setAmbient(a.id, p.enabled, p.volume)
    }
  }, [prefs.music, prefs.musicVolume, prefs.ambient])

  // Track which audio files have 404'd so the UI can disable those buttons
  // and show a hint. The engine reports unavailability the first time a
  // track tries to load and fails; we re-render to reflect that.
  const [unavailableSrcs, setUnavailableSrcs] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const eng = getBgmEngine()
    if (!eng) return
    // Pull current state + subscribe. We rebuild the Set on each notify so
    // React sees a new reference and re-renders.
    const snapshot = () => {
      const next = new Set<string>()
      for (const m of BGM_MUSIC) if (!eng.isAvailable(m.src)) next.add(m.src)
      for (const a of BGM_AMBIENT) if (!eng.isAvailable(a.src)) next.add(a.src)
      setUnavailableSrcs(next)
    }
    // Eagerly instantiate every track so the `error` listener fires before
    // the user clicks anything — otherwise missing files don't show as
    // disabled until first selection.
    eng.preload()
    snapshot()
    return eng.subscribe(snapshot)
  }, [])

  // Drive the engine play/pause from timer state. Running = on, anything
  // else (idle / paused) = off so audio doesn't keep playing while paused.
  // Re-runs of the prefs-sync effect above set the targets; this one flips
  // the master playing switch.
  // Audio is also killed on unmount so the timer module doesn't leak sound
  // when the panel closes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const eng = getBgmEngine()
    if (!eng) return
    eng.setPlaying(bgmManualPlaying || state === 'running')
  }, [state, bgmManualPlaying])
  // If the user clears all selections, drop the manual-playing flag so the
  // play button doesn't appear "on" with nothing to play.
  useEffect(() => {
    const hasSelection = !!prefs.music || BGM_AMBIENT.some(a => prefs.ambient[a.id]?.enabled)
    if (!hasSelection && bgmManualPlaying) setBgmManualPlaying(false)
  }, [prefs.music, prefs.ambient, bgmManualPlaying])
  useEffect(() => {
    return () => {
      const eng = typeof window !== 'undefined' ? getBgmEngine() : null
      eng?.setPlaying(false)
    }
  }, [])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get current timer duration based on mode
  const getTargetSeconds = useCallback(() => {
    if (useCustom) return customMinutes * 60
    return POMODORO_PRESETS[selectedPreset].minutes * 60
  }, [useCustom, customMinutes, selectedPreset])

  // Format time display
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format time to HH:mm
  const formatTimeHHMM = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  // Format date to YYYY-MM-DD (local)
  const formatDateISO = (date: Date) => toDateString(date)

  // Start a fresh work session.
  const startTimer = () => {
    // Sync-resume the AudioContext from this user gesture so BGM can
    // actually play when state flips to 'running' (Web Audio autoplay
    // policy gates resume() on a hot gesture token).
    getBgmEngine()?.unlockAudio()
    const now = new Date()
    const label = customLabel || (mode === 'pomodoro'
      ? (useCustom ? `${customMinutes}分鐘專注` : POMODORO_PRESETS[selectedPreset].label)
      : focusType.label)
    const color = mode === 'pomodoro'
      ? (useCustom ? focusType.color : POMODORO_PRESETS[selectedPreset].color)
      : focusType.color
    const targetSeconds = getTargetSeconds()

    setSession({
      mode,
      phase: 'work',
      startedAt: now,
      pausedMs: 0,
      pausedAt: null,
      targetSeconds,
      label,
      color,
    })

    if (mode === 'pomodoro') {
      setTimeLeft(targetSeconds)
    } else {
      setElapsed(0)
    }

    setState('running')
  }

  // Begin a break session of the configured length. Used both as the
  // automatic continuation after a work pomodoro and as the manual button
  // when auto-break is off.
  const startBreak = useCallback(() => {
    const breakSeconds = Math.max(1, Math.floor(prefs.breakMinutes)) * 60
    setSession({
      mode: 'pomodoro',
      phase: 'break',
      startedAt: new Date(),
      pausedMs: 0,
      pausedAt: null,
      targetSeconds: breakSeconds,
      label: `休息 ${prefs.breakMinutes} 分`,
      color: BREAK_COLOR,
    })
    setTimeLeft(breakSeconds)
    setState('running')
  }, [prefs.breakMinutes])

  // Pause timer — record the wall-clock so we can subtract paused duration
  // from the running total. Without this, idle time during pause would still
  // be counted toward elapsed.
  const pauseTimer = () => {
    setSession((s) => (s ? { ...s, pausedAt: new Date() } : s))
    setState('paused')
  }

  // Resume timer — fold the just-finished pause into pausedMs and clear the
  // pausedAt anchor so the next tick reads only running time.
  const resumeTimer = () => {
    getBgmEngine()?.unlockAudio()
    setSession((s) => {
      if (!s) return s
      const addedPause = s.pausedAt ? Date.now() - s.pausedAt.getTime() : 0
      return { ...s, pausedAt: null, pausedMs: s.pausedMs + addedPause }
    })
    setState('running')
  }

  // Persist a finished/aborted session as a time block on today's calendar.
  // Pulled out of stopTimer so we can record a work pomodoro before
  // transitioning into the auto-break without going through idle.
  const recordSessionToCalendar = useCallback(
    (s: TimerSession, completed: boolean) => {
      if (!onCreateTimeBlock) return
      const now = new Date()
      const startTime = formatTimeHHMM(s.startedAt)
      const endTime = formatTimeHHMM(now)
      const date = formatDateISO(s.startedAt)
      const durationMinutes = Math.floor((now.getTime() - s.startedAt.getTime()) / 60000)
      if (durationMinutes < 1) return
      // Break sessions are typed as 'break' so they color-code differently
      // and don't get counted as focus time in any future analytics.
      const blockType =
        s.phase === 'break' ? 'break' : s.mode === 'pomodoro' ? 'pomodoro' : 'focus'
      onCreateTimeBlock(
        date,
        startTime,
        endTime,
        blockType,
        s.label + (completed ? ' ✓' : ''),
        s.color,
      )
    },
    [onCreateTimeBlock],
  )

  // Stop and save timer
  const stopTimer = (completed: boolean = false) => {
    if (session) recordSessionToCalendar(session, completed)
    resetTimer()
  }

  // Reset timer
  const resetTimer = () => {
    setState('idle')
    setSession(null)
    setTimeLeft(getTargetSeconds())
    setElapsed(0)
    setCustomLabel('')
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }

  // Timer tick — wall-clock based.
  //
  // setInterval only triggers a recompute; the actual time comes from
  // (Date.now() - startedAt) so it stays accurate even after the tab was
  // backgrounded, the laptop slept, or the OS throttled timers.
  //
  // On completion: play the configured sound, then either auto-start a
  // break (if work phase + autoStartBreak) or finalize via stopTimer.
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
          // Stop ticking immediately so we don't double-fire while React
          // batches the next state update / effect re-run.
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          playTimerSound(prefs.sound)
          setTimeLeft(0)
          if (session.phase === 'work' && prefs.autoStartBreak) {
            // Record the work block, then transition to a break session
            // without dropping into idle.
            recordSessionToCalendar(session, true)
            startBreak()
          } else {
            stopTimer(true)
          }
          return
        }
        setTimeLeft(remaining)
      } else {
        setElapsed(runningSec)
      }
    }
    tick() // immediate update so state reflects reality on resume / restart
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, session, prefs.sound, prefs.autoStartBreak])

  // Update timeLeft when preset changes (only when idle)
  useEffect(() => {
    if (state === 'idle') {
      setTimeLeft(getTargetSeconds())
    }
  }, [selectedPreset, customMinutes, useCustom, state, getTargetSeconds])

  // Calculate progress for pomodoro
  const progress = mode === 'pomodoro' 
    ? ((getTargetSeconds() - timeLeft) / getTargetSeconds()) * 100
    : 0

  const displayTime = mode === 'pomodoro' ? timeLeft : elapsed

  // Mobile expanded mode renders as a backdrop + bottom sheet (full-width,
  // slide-up from above the tab bar). Desktop keeps the corner card.
  const mobileExpanded = isMobile && isExpanded

  // On mobile, once a session is running/paused, the experience takes over
  // the full screen instead of sitting in a sheet. The sheet remains the
  // setup surface (idle state only).
  const showImmersive = isMobile && isExpanded && state !== 'idle' && session !== null

  if (showImmersive && session) {
    return (
      <FocusTimerImmersive
        visible
        state={state}
        phase={session.phase}
        label={session.label}
        color={session.color}
        timeText={formatTime(displayTime)}
        progress={mode === 'pomodoro' ? progress : Math.min(100, (elapsed % 3600) / 36)}
        startedAtText={formatTimeHHMM(session.startedAt)}
        music={prefs.music}
        ambient={prefs.ambient}
        bgmPlaying={(bgmManualPlaying || state === 'running')}
        onPause={pauseTimer}
        onResume={resumeTimer}
        onExit={() => { stopTimer(false); setIsExpanded(false) }}
        onToggleBgm={() => {
          getBgmEngine()?.unlockAudio()
          setBgmManualPlaying(v => !v)
        }}
      />
    )
  }

  return (
    <>
      {/* Mobile sheet backdrop — clicking it collapses the panel. */}
      {mobileExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Timer Button/Widget — sits above the bottom tab bar on
          mobile (with iOS safe-area-inset-bottom). On mobile, the expanded
          panel becomes a full-width bottom sheet that slides up from the
          screen edge. */}
      <div
        className={cn(
          "fixed z-40 transition-all duration-300",
          // Collapsed mobile: floating chip in the right corner above the
          // tab bar. Expanded mobile: full-width sheet anchored to bottom.
          mobileExpanded
            ? 'inset-x-0 bottom-0 animate-in slide-in-from-bottom duration-300'
            : isMobile
              ? 'right-3'
              : 'bottom-6 right-6',
          !isMobile && (isExpanded ? "w-80 max-w-[calc(100vw-2rem)]" : "w-auto")
        )}
        style={isMobile && !mobileExpanded ? { bottom: 'calc(78px + env(safe-area-inset-bottom))' } : undefined}
      >
        {/* Expanded Panel */}
        {isExpanded ? (
          <div
            className={cn(
              "bg-card",
              mobileExpanded
                ? "border-t border-border rounded-t-3xl shadow-2xl max-h-[88dvh] overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),0.5rem)]"
                : "overflow-hidden border border-border rounded-2xl shadow-xl"
            )}
          >
            {/* Mobile sheet grab handle */}
            {mobileExpanded && (
              <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                <span className="block w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  state === 'running' ? "bg-success" :
                  state === 'paused' ? "bg-urgency-medium" : "bg-muted-foreground"
                )} />
                <span className="text-sm font-medium">
                  {state === 'idle'
                    ? '專注計時'
                    : session?.phase === 'break'
                      ? state === 'running' ? '休息中' : '休息暫停'
                      : state === 'running' ? '計時中' : '已暫停'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    showSettings ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"
                  )}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Settings Panel */}
            {showSettings && state === 'idle' && (
              <div className="px-4 py-3 border-b border-border bg-muted/20 space-y-3">
                {/* Mode Toggle */}
                <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
                  <button
                    onClick={() => setMode('pomodoro')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                      mode === 'pomodoro' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    番茄鐘
                  </button>
                  <button
                    onClick={() => setMode('stopwatch')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                      mode === 'stopwatch' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    正計時
                  </button>
                </div>

                {/* Pomodoro Presets */}
                {mode === 'pomodoro' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {POMODORO_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedPreset(idx)
                            setUseCustom(false)
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                            !useCustom && selectedPreset === idx
                              ? "text-white"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                          )}
                          style={!useCustom && selectedPreset === idx ? { backgroundColor: preset.color } : {}}
                        >
                          {preset.minutes}分
                        </button>
                      ))}
                    </div>
                    
                    {/* Custom Duration */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setUseCustom(true)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                          useCustom ? "bg-primary/10 text-primary" : "bg-secondary/50 text-muted-foreground"
                        )}
                      >
                        自訂
                      </button>
                      {useCustom && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            max={120}
                            value={customMinutes}
                            onChange={(e) => setCustomMinutes(parseInt(e.target.value) || 25)}
                            className="w-16 h-7 text-xs text-center"
                          />
                          <span className="text-xs text-muted-foreground">分鐘</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Focus Type (for stopwatch) */}
                {mode === 'stopwatch' && (
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS_TYPES.map((type) => (
                      <button
                        key={type.key}
                        onClick={() => setFocusType(type)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                          focusType.key === type.key
                            ? "text-white"
                            : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                        )}
                        style={focusType.key === type.key ? { backgroundColor: type.color } : {}}
                      >
                        <type.icon className="w-3.5 h-3.5" />
                        {type.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom Label */}
                <Input
                  placeholder="自訂標籤（選填）"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="h-8 text-xs"
                />

                {/* Pomodoro flow settings — break length, auto-start, sound */}
                {mode === 'pomodoro' && (
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground" htmlFor="timer-break-mins">
                        休息時長（分）
                      </label>
                      <Input
                        id="timer-break-mins"
                        type="number"
                        min={1}
                        max={60}
                        value={prefs.breakMinutes}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setPrefs((p) => ({ ...p, breakMinutes: Number.isFinite(v) && v > 0 ? v : 5 }))
                        }}
                        className="w-16 h-7 text-xs text-center"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, autoStartBreak: !p.autoStartBreak }))}
                      aria-pressed={prefs.autoStartBreak}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 text-left"
                    >
                      <span className="text-[11px] text-muted-foreground">完成後自動進入休息</span>
                      <span
                        className={cn(
                          'relative w-8 h-4 rounded-full transition-colors flex-shrink-0',
                          prefs.autoStartBreak ? 'bg-primary' : 'bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                            prefs.autoStartBreak ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </span>
                    </button>

                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        {prefs.sound === 'silent' ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        提示音
                      </label>
                      <div className="flex gap-1">
                        {(['chime', 'bell', 'beep', 'silent'] as TimerSoundKind[]).map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setPrefs((p) => ({ ...p, sound: k }))
                              // Preview the sound when picking, except for silent.
                              if (k !== 'silent') playTimerSound(k)
                            }}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                              prefs.sound === k
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                            )}
                          >
                            {TIMER_SOUND_LABELS[k]}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {/* Background music + ambient overlays — collapsible so the
                    settings panel stays scannable. Available in both pomodoro
                    and stopwatch. When closed, summarizes the active selection
                    so the user knows whether anything is playing. */}
                {(() => {
                  const allMissing = BGM_MUSIC.every(m => unavailableSrcs.has(m.src))
                    && BGM_AMBIENT.every(a => unavailableSrcs.has(a.src))
                  // Pull the summary string from the shared util so the
                  // immersive bar (focus-timer-immersive.tsx) and this
                  // settings panel render the same canonical text.
                  const { summary, hasSelection } = summarizeBgm(prefs.music, prefs.ambient, { allMissing })
                  const isPlaying = bgmManualPlaying || (state as TimerState) === 'running'
                  return (
                <div className="pt-2 border-t border-border/60">
                  <div className="w-full flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded-md hover:bg-secondary/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasSelection || allMissing) return
                        // Web Audio autoplay policy: must resume the
                        // context synchronously from the click handler,
                        // before any awaits / React re-renders eat the
                        // user-gesture token. Without this, the play
                        // button "does nothing" — ctx stays suspended.
                        getBgmEngine()?.unlockAudio()
                        setBgmManualPlaying(v => !v)
                      }}
                      disabled={!hasSelection || allMissing}
                      aria-pressed={isPlaying}
                      title={!hasSelection ? '請先選擇音樂或環境音' : isPlaying ? '暫停' : '播放'}
                      className={cn(
                        'w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors',
                        !hasSelection || allMissing
                          ? 'bg-secondary/30 text-muted-foreground/40 cursor-not-allowed'
                          : isPlaying
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-secondary/60 text-foreground hover:bg-secondary',
                      )}
                    >
                      {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 translate-x-[0.5px]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBgmSettings(v => !v)}
                      aria-expanded={showBgmSettings}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <Music2 className="w-3 h-3" />
                        背景音 / 環境音
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-[10px] truncate max-w-[140px]',
                          allMissing ? 'text-muted-foreground/60 italic' : 'text-foreground/70'
                        )}>
                          {summary}
                        </span>
                        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', showBgmSettings && 'rotate-180')} />
                      </span>
                    </button>
                  </div>
                  {showBgmSettings && (
                <div className="space-y-2 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Music2 className="w-3 h-3" />
                        背景音樂
                      </label>
                      <div className="flex gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            getBgmEngine()?.unlockAudio()
                            setPrefs((p) => ({ ...p, music: null }))
                          }}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                            prefs.music === null
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                          )}
                        >
                          無
                        </button>
                        {BGM_MUSIC.map((m) => {
                          const missing = unavailableSrcs.has(m.src)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                getBgmEngine()?.unlockAudio()
                                setPrefs((p) => ({ ...p, music: m.id }))
                              }}
                              disabled={missing}
                              title={missing ? '音檔尚未加入（見 public/audio/README.md）' : undefined}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                                missing
                                  ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                  : prefs.music === m.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                              )}
                            >
                              <span>{m.emoji}</span>{m.label}
                            </button>
                          )
                        })}
                        {/* "全部循環" — engine cycles through every available music
                            track in order, dual-buffering the handoff so the
                            transition is seamless. Disabled iff every music file
                            is missing. */}
                        {(() => {
                          const everyMissing = BGM_MUSIC.every((m) => unavailableSrcs.has(m.src))
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                getBgmEngine()?.unlockAudio()
                                setPrefs((p) => ({ ...p, music: ALL_MUSIC_ID }))
                              }}
                              disabled={everyMissing}
                              title={everyMissing ? '尚未加入任何音檔（見 public/audio/README.md）' : '依序循環播放所有背景音樂'}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                                everyMissing
                                  ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                  : prefs.music === ALL_MUSIC_ID
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                              )}
                            >
                              <span>{ALL_MUSIC_EMOJI}</span>{ALL_MUSIC_LABEL}
                            </button>
                          )
                        })()}
                      </div>
                      {prefs.music && (
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={prefs.musicVolume}
                          onChange={(e) => setPrefs((p) => ({ ...p, musicVolume: parseFloat(e.target.value) }))}
                          aria-label="背景音樂音量"
                          className="w-full h-1 accent-primary"
                        />
                      )}
                    </div>

                    {/* Ambient overlays — multi-select, each with its own slider */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[11px] text-muted-foreground">
                        環境音（可疊加）
                      </label>
                      <div className="space-y-1">
                        {BGM_AMBIENT.map((a) => {
                          const p = prefs.ambient[a.id]
                          const missing = unavailableSrcs.has(a.src)
                          return (
                            <div key={a.id} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  getBgmEngine()?.unlockAudio()
                                  setPrefs((prev) => ({
                                    ...prev,
                                    ambient: {
                                      ...prev.ambient,
                                      [a.id]: { ...prev.ambient[a.id], enabled: !prev.ambient[a.id].enabled },
                                    },
                                  }))
                                }}
                                aria-pressed={p.enabled}
                                disabled={missing}
                                title={missing ? '音檔尚未加入（見 public/audio/README.md）' : undefined}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 w-[68px] justify-start',
                                  missing
                                    ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                    : p.enabled
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                                )}
                              >
                                <span>{a.emoji}</span>{a.label}
                              </button>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={p.volume}
                                disabled={!p.enabled || missing}
                                onChange={(e) => setPrefs((prev) => ({
                                  ...prev,
                                  ambient: {
                                    ...prev.ambient,
                                    [a.id]: { ...prev.ambient[a.id], volume: parseFloat(e.target.value) },
                                  },
                                }))}
                                aria-label={`${a.label}音量`}
                                className="flex-1 h-1 accent-primary disabled:opacity-40"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {(unavailableSrcs.size > 0) && (
                      <p className="text-[10px] text-muted-foreground/70 italic pt-0.5">
                        灰色項目尚未放入音檔 · 詳見 public/audio/README.md
                      </p>
                    )}
                  </div>
                  )}
                </div>
                  )
                })()}
              </div>
            )}

            {/* Timer Display */}
            <div className="px-4 py-6 flex flex-col items-center">
              {/* Progress Ring (for pomodoro) */}
              {mode === 'pomodoro' && state !== 'idle' && (
                <div className="relative mb-2">
                  <svg className="w-32 h-32 -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      className="fill-none stroke-secondary"
                      strokeWidth="8"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      className="fill-none transition-all duration-1000"
                      stroke={session?.color || '#e07b5a'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress / 100)}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-mono font-bold tabular-nums">
                      {formatTime(displayTime)}
                    </span>
                  </div>
                </div>
              )}

              {/* Simple Display (for stopwatch or idle pomodoro) */}
              {(mode === 'stopwatch' || state === 'idle') && (
                <div className="text-center mb-4">
                  <span className="text-4xl font-mono font-bold tabular-nums">
                    {formatTime(displayTime)}
                  </span>
                  {session && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.label}
                    </p>
                  )}
                </div>
              )}

              {/* Session Info */}
              {state !== 'idle' && session && (
                <p className="text-xs text-muted-foreground mb-3">
                  開始於 {formatTimeHHMM(session.startedAt)}
                </p>
              )}

              {/* Controls */}
              <div className="flex items-center gap-2">
                {state === 'idle' ? (
                  <Button
                    onClick={startTimer}
                    className="gap-2"
                    style={{ backgroundColor: mode === 'pomodoro' 
                      ? (useCustom ? focusType.color : POMODORO_PRESETS[selectedPreset].color)
                      : focusType.color 
                    }}
                  >
                    <Play className="w-4 h-4" />
                    開始專注
                  </Button>
                ) : (
                  <>
                    {state === 'running' ? (
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={pauseTimer}
                      >
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        onClick={resumeTimer}
                        style={{ backgroundColor: session?.color }}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => stopTimer(false)}
                      title="停止並儲存"
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={resetTimer}
                      title="重置"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Footer Hint */}
            {state !== 'idle' && (
              <div className="px-4 py-2 border-t border-border bg-muted/20">
                <p className="text-[10px] text-muted-foreground text-center">
                  結束後會自動記錄到今天的日曆
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Collapsed Button */
          <button
            data-tour="focus-timer"
            onClick={() => setIsExpanded(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg transition-all hover:scale-105",
              "bg-card border border-border",
              state === 'running' && "ring-2 ring-offset-2",
            )}
            style={state === 'running' ? {
              ['--tw-ring-color' as string]: session?.color,
              borderColor: session?.color,
            } : undefined}
          >
            <div className={cn(
              "w-2.5 h-2.5 rounded-full",
              state === 'running' ? "animate-pulse" : "",
              state === 'idle' && "bg-muted-foreground"
            )} style={state !== 'idle' ? { backgroundColor: session?.color } : {}} />
            
            {state === 'idle' ? (
              <>
                <Timer className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">專注計時</span>
              </>
            ) : (
              <>
                <span className="text-sm font-mono font-bold tabular-nums">
                  {formatTime(displayTime)}
                </span>
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              </>
            )}
          </button>
        )}
      </div>
    </>
  )
}
