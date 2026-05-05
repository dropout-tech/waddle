'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Play, Pause, Square, RotateCcw, Timer, Clock, 
  ChevronDown, ChevronUp, Settings2, Check, X,
  Coffee, Brain, Dumbbell, BookOpen
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Task, Workspace } from '@/lib/types'
import { toDateString } from '@/lib/calendar-utils'

interface FocusTimerProps {
  workspaces: Workspace[]
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string) => void
}

type TimerMode = 'pomodoro' | 'stopwatch'
type TimerState = 'idle' | 'running' | 'paused'

interface TimerSession {
  mode: TimerMode
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
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(25 * 60) // seconds for pomodoro
  const [elapsed, setElapsed] = useState(0) // seconds for stopwatch
  const [session, setSession] = useState<TimerSession | null>(null)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  // Start timer
  const startTimer = () => {
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
    setSession((s) => {
      if (!s) return s
      const addedPause = s.pausedAt ? Date.now() - s.pausedAt.getTime() : 0
      return { ...s, pausedAt: null, pausedMs: s.pausedMs + addedPause }
    })
    setState('running')
  }

  // Stop and save timer
  const stopTimer = (completed: boolean = false) => {
    if (session && onCreateTimeBlock) {
      const now = new Date()
      const startTime = formatTimeHHMM(session.startedAt)
      const endTime = formatTimeHHMM(now)
      const date = formatDateISO(session.startedAt)
      
      // Only create time block if at least 1 minute passed
      const durationMinutes = Math.floor((now.getTime() - session.startedAt.getTime()) / 60000)
      if (durationMinutes >= 1) {
        onCreateTimeBlock(
          date,
          startTime,
          endTime,
          session.mode === 'pomodoro' ? 'pomodoro' : 'focus',
          session.label + (completed ? ' ✓' : ''),
          session.color
        )
      }
    }
    
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
  // The previous implementation incremented a counter on each setInterval
  // tick, which silently broke when browsers throttled background tabs.
  // Now setInterval only triggers a recompute; the actual time comes from
  // (Date.now() - startedAt) so it stays accurate even after the tab was
  // backgrounded, the laptop slept, or the OS throttled timers.
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
          if (audioRef.current) audioRef.current.play().catch(() => {})
          setTimeLeft(0)
          stopTimer(true)
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
  }, [state, session])

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

  return (
    <>
      {/* Hidden audio element for completion sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp6YjHhsa3N/ipWXkYZ6c3Z/ipOUjYN5dXh/ho2PioB3c3Z7goqMiYB2c3V6gIeLiYF3c3V5f4WJh4B2cnR4fYOHhX92cXN3e4GFg352cXJ2eX+DgX12cHF1d3yAf3x1cHBzdXl8fnt0cG9xcnV4e3p4c29ucXJ0dnh3dnJub3BxcnR2dnVyb25vcHFydHV0c29ubm9wcXJzdHNyb25ubm9wcXJyc3JwbmxubW9wb3BwcW9ubGxtbW5vb29wb25sbGxsbW1ubm5vbm1sa2tsbGxtbW1tbWxra2pqa2tsbGxsbGtqamppamtqa2tqaWlpaWlpamppaWlpaGhoaGhpaWhoaGdnZ2dnZ2doZ2dnZmZmZmZmZmdmZmZlZWVlZWVlZWVlZGRkZGRkZGRkZGRjY2NjY2NjY2NjYmJiYmJiYmJiYmJhYWFhYWFhYWFhYGBgYGBgYGBgYGBfX19fX19fX19fXl5eXl5eXl5eXl5dXV1dXV1dXV1dXFxcXFxcXFxcXFtbW1tbW1tbW1taWlpaWlpaWlpaWllZWVlZWVlZWVlYWFhYWFhYWFhYV1dXV1dXV1dXV1ZWVlZWVlZWVlZVVVVVVVVVVVVVVFRUVFRUVFRUVFNTU1NTU1NTU1NSUlJSUlJSUlJSUVFRUVFRUVFRUVBQUFBQUFBQUFBPT09PT09PT09PTk5OTk5OTk5OTk1NTU1NTU1NTU1MTExMTExMTExMS0tLS0tLS0tLS0pKSkpKSkpKSkpJSUlJSUlJSUlJSEhISEhISEhISEdHR0dHR0dHR0dGRkZGRkZGRkZGRUVFRUVFRUVFRURERERERERERENDQ0NDQ0NDQ0NCQkJCQkJCQkJCQUFBQUFBQUFBQUBAQEBAQEBAQEA/Pz8/Pz8/Pz8+Pj4+Pj4+Pj4+PT09PT09PT09PTw8PDw8PDw8PDw7Ozs7Ozs7Ozs7Ojo6Ojo6Ojo6Ojk5OTk5OTk5OTk4ODg4ODg4ODg4Nzc3Nzc3Nzc3NzY2NjY2NjY2NjY1NTU1NTU1NTU1NDQ0NDQ0NDQ0NDMzMzMzMzMzMzMyMjIyMjIyMjIyMTExMTExMTExMTAwMDAwMDAwMDAvLy8vLy8vLy8vLi4uLi4uLi4uLi0tLS0tLS0tLS0sLCwsLCwsLCwsKysrKysrKysrKyoqKioqKioqKiknJycnJycnJyc=" />

      {/* Floating Timer Button/Widget — sits above the bottom tab bar on
          mobile (with iOS safe-area-inset-bottom). */}
      <div
        className={cn(
          "fixed right-4 z-40 transition-all duration-300",
          isMobile ? '' : 'bottom-6 right-6',
          isExpanded ? "w-80 max-w-[calc(100vw-2rem)]" : "w-auto"
        )}
        style={isMobile ? { bottom: 'calc(78px + env(safe-area-inset-bottom))' } : undefined}
      >
        {/* Expanded Panel */}
        {isExpanded ? (
          <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  state === 'running' ? "bg-green-500 animate-pulse" : 
                  state === 'paused' ? "bg-amber-500" : "bg-muted-foreground"
                )} />
                <span className="text-sm font-medium">
                  {state === 'running' ? '計時中' : state === 'paused' ? '已暫停' : '專注計時'}
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
