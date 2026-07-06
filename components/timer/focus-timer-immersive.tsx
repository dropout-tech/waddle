'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, X, ChevronUp, ChevronDown, Music2, Maximize2, Minimize2, Minimize } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BGM_MUSIC, BGM_AMBIENT, summarizeBgm,
  ALL_MUSIC_ID, ALL_MUSIC_LABEL, ALL_MUSIC_EMOJI,
  type AmbientPref, type BgmMusicId, type BgmAmbientId,
} from '@/lib/timer-bgm'

export interface ImmersiveProps {
  visible: boolean
  state: 'idle' | 'running' | 'paused'
  phase: 'work' | 'break'
  label: string
  color: string
  timeText: string
  progress: number
  startedAtText: string
  /** Total seconds for the current session — drives end-time + tick spacing. */
  targetSeconds: number
  /** Anchor used to compute the projected end-time chip. */
  startedAt: Date
  /** Pomodoro mode: seconds left so we know when to warm-shift the ring. Null for stopwatch. */
  remainingSeconds: number | null
  /** Today's completed *work* pomodoro count for the progress dots row. */
  pomodoroCount: number
  music: BgmMusicId | null
  musicVolume: number
  ambient: Record<BgmAmbientId, AmbientPref>
  bgmPlaying: boolean
  unavailableSrcs: Set<string>
  onPause: () => void
  onResume: () => void
  onExit: () => void
  /** Shrink to corner mini pill without ending the session. */
  onMinimize: () => void
  onToggleBgm: () => void
  // Music picker callbacks so the bar can swap tracks mid-session. Each must
  // unlock the audio context (Web Audio autoplay policy) before mutating prefs.
  onSelectMusic: (id: BgmMusicId | null) => void
  onMusicVolumeChange: (volume: number) => void
  onToggleAmbient: (id: BgmAmbientId) => void
  onAmbientVolumeChange: (id: BgmAmbientId, volume: number) => void
}

const EXIT_HOLD_MS = 900
const DIM_DELAY_MS = 5000

function formatClockHHMM(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function FocusTimerImmersive(props: ImmersiveProps) {
  const {
    visible, state, phase, label, color, timeText, progress, startedAtText,
    targetSeconds, startedAt, remainingSeconds, pomodoroCount,
    music, musicVolume, ambient, bgmPlaying, unavailableSrcs,
    onPause, onResume, onExit, onMinimize, onToggleBgm,
    onSelectMusic, onMusicVolumeChange, onToggleAmbient, onAmbientVolumeChange,
  } = props

  const [dimmed, setDimmed] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [showBgmBar, setShowBgmBar] = useState(false)
  const [exitHoldProgress, setExitHoldProgress] = useState(0)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  // Ambient "now" clock (B8). Updates on the minute boundary so the display
  // changes in sync with the OS clock rather than drifting by N seconds.
  const [nowText, setNowText] = useState(() => formatClockHHMM(new Date()))

  const containerRef = useRef<HTMLDivElement | null>(null)
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null)
  const exitHoldRef = useRef<{ raf: number; cleared: boolean } | null>(null)
  const prevPhaseRef = useRef<'work' | 'break'>(phase)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Mirror the browser's fullscreen state so the toggle stays in sync even
  // when the user hits Esc to leave native fullscreen. Pressing Esc only
  // drops out of OS-level fullscreen — we DON'T exit the immersive overlay
  // or stop the timer, so the experience degrades gracefully to the CSS
  // overlay (chrome reappears, but timer continues).
  useEffect(() => {
    if (typeof document === 'undefined') return
    setFullscreenSupported(!!document.fullscreenEnabled)
    const onChange = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Now-clock ticking. Align to the next minute boundary so updates land
  // exactly when the OS clock does, then once per minute.
  useEffect(() => {
    if (!visible) return
    setNowText(formatClockHHMM(new Date()))
    const msToNextMinute = 60000 - (Date.now() % 60000)
    let interval: NodeJS.Timeout | null = null
    const timeout = setTimeout(() => {
      setNowText(formatClockHHMM(new Date()))
      interval = setInterval(() => setNowText(formatClockHHMM(new Date())), 60000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [visible])

  const toggleNativeFullscreen = () => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* Esc may have already exited */ })
    } else if (containerRef.current?.requestFullscreen) {
      void containerRef.current.requestFullscreen().catch(() => { /* permission/timing */ })
    }
  }

  // Drop OS-level fullscreen when the immersive view unmounts (long-press
  // exit / session end / minimize). Without this, leaving immersive would
  // strand the browser in fullscreen with no way to undo it.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  const resetDim = () => {
    setDimmed(false)
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current)
    if (state === 'running') {
      dimTimerRef.current = setTimeout(() => setDimmed(true), DIM_DELAY_MS)
    }
  }

  useEffect(() => {
    if (!visible) return
    resetDim()
    return () => { if (dimTimerRef.current) clearTimeout(dimTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, state])

  useEffect(() => {
    if (!visible) return
    if (prevPhaseRef.current === 'work' && phase === 'break') {
      setShowCompletion(true)
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current)
      completionTimeoutRef.current = setTimeout(() => setShowCompletion(false), 2400)
    }
    prevPhaseRef.current = phase
    return () => { if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current) }
  }, [phase, visible])

  const startExitHold = () => {
    if (exitHoldRef.current) return
    const startedAt = performance.now()
    const ref = { raf: 0, cleared: false }
    exitHoldRef.current = ref
    const step = (now: number) => {
      if (ref.cleared) return
      const elapsed = now - startedAt
      const pct = Math.min(1, elapsed / EXIT_HOLD_MS)
      setExitHoldProgress(pct)
      if (pct >= 1) {
        ref.cleared = true
        exitHoldRef.current = null
        setExitHoldProgress(0)
        onExit()
        return
      }
      ref.raf = requestAnimationFrame(step)
    }
    ref.raf = requestAnimationFrame(step)
  }
  const cancelExitHold = () => {
    if (!exitHoldRef.current) return
    exitHoldRef.current.cleared = true
    cancelAnimationFrame(exitHoldRef.current.raf)
    exitHoldRef.current = null
    setExitHoldProgress(0)
  }

  // Ensure an in-flight long-press RAF doesn't outlive the component.
  useEffect(() => {
    return () => {
      if (exitHoldRef.current) {
        exitHoldRef.current.cleared = true
        cancelAnimationFrame(exitHoldRef.current.raf)
        exitHoldRef.current = null
      }
    }
  }, [])

  // ---- Derived values ----
  const isBreak = phase === 'break'
  // Projected end-time chip. For stopwatch (targetSeconds=0) we skip it.
  const endTimeText = useMemo(
    () => targetSeconds > 0
      ? formatClockHHMM(new Date(startedAt.getTime() + targetSeconds * 1000))
      : null,
    [startedAt, targetSeconds],
  )

  // The warmth journey — the signature move. As a focus session progresses,
  // the whole screen drifts from the calm session color toward a warm amber,
  // so time passing is something you *feel*, not just read. Only for pomodoro
  // work: a stopwatch has no endpoint to warm toward, and a break should stay
  // calm. WARM_ANCHOR stays inside the warm OKLCH band (hue ~48), so the drift
  // never crosses into cold blue, honoring DESIGN.md's palette.
  const WARM_ANCHOR = 'oklch(0.72 0.16 48)'
  const warmth = !isBreak && targetSeconds > 0 && state !== 'idle'
    ? Math.max(0, Math.min(1, progress / 100))
    : 0
  // The last minute gets an extra nudge so short timers still feel the arrival.
  const isFinalMinute = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 60
  const ringStrokeActive = isFinalMinute
    ? `color-mix(in oklch, ${color} 42%, oklch(0.7 0.18 38))`
    : warmth > 0
      ? `color-mix(in oklch, ${color} ${Math.round(100 - warmth * 45)}%, ${WARM_ANCHOR})`
      : color
  // Background base drifts warmer + slightly more saturated as warmth rises.
  const sessionTone = `color-mix(in oklch, ${color} ${16 + warmth * 12}%, var(--background))`
  const bgColor = warmth > 0
    ? `color-mix(in oklch, ${sessionTone} ${Math.round(100 - warmth * 26)}%, ${WARM_ANCHOR})`
    : sessionTone

  const ringRadius = 130
  const ringCirc = 2 * Math.PI * ringRadius

  // 5-minute tick marks. Skip the 12-o'clock position so the dot doesn't
  // visually duplicate the ring's start; also skip when total < 5 minutes
  // (a 3-minute custom timer doesn't need ticks).
  const ticks = useMemo(() => {
    const totalMin = targetSeconds / 60
    if (totalMin < 5) return []
    const count = Math.floor(totalMin / 5)
    const out: { cx: number; cy: number }[] = []
    for (let i = 1; i < count; i++) {
      const fraction = (i * 5) / totalMin
      // -PI/2 because the parent SVG is `-rotate-90` so the start is "up"
      const angle = fraction * Math.PI * 2 - Math.PI / 2
      out.push({
        cx: 150 + ringRadius * Math.cos(angle + Math.PI / 2), // +PI/2 to map back into the rotated SVG coords
        cy: 150 + ringRadius * Math.sin(angle + Math.PI / 2),
      })
    }
    return out
  }, [targetSeconds])

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-[80] flex flex-col select-none overflow-hidden',
        'transition-colors duration-700 ease-out',
      )}
      style={{
        backgroundColor: bgColor,
      }}
      onPointerDown={resetDim}
      onTouchMove={resetDim}
      role="dialog"
      aria-modal="true"
      aria-label={isBreak ? '休息計時中' : '專注計時中'}
    >
      <style>{`
        @keyframes waddle-breathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.04); }
        }
        @keyframes waddle-ring-pulse {
          0% { transform: scale(1); }
          40% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes waddle-immersive-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes waddle-completion-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        /* Completion: the penguin does a small celebratory waddle (a gentle
           rock, not a bounce) and a warm halo blooms outward once. */
        @keyframes waddle-celebrate-penguin {
          0%   { transform: rotate(0deg) translateY(8px); }
          16%  { transform: rotate(0deg) translateY(0); }
          38%  { transform: rotate(-5deg); }
          60%  { transform: rotate(5deg); }
          80%  { transform: rotate(-3.5deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes waddle-celebrate-bloom {
          0%   { transform: scale(0.6); opacity: 0; }
          40%  { opacity: 0.85; }
          100% { transform: scale(1.18); opacity: 0; }
        }
        @keyframes waddle-chip-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Floating particles drift from below the viewport up past the top
           edge over a long lazy cycle. Composed with a horizontal sway
           animation on the same element via animation-name pairing. */
        @keyframes waddle-particle-rise {
          0% { transform: translate3d(0, 30vh, 0); opacity: 0; }
          12% { opacity: var(--waddle-particle-opacity, 0.32); }
          88% { opacity: var(--waddle-particle-opacity, 0.32); }
          100% { transform: translate3d(0, -130vh, 0); opacity: 0; }
        }
        /* Box-breath-ish pacer for break phase. 4-7-8 cycle = 19s. */
        @keyframes waddle-breath-scale {
          0%   { transform: scale(1); }
          21%  { transform: scale(1.55); }
          58%  { transform: scale(1.55); }
          100% { transform: scale(1); }
        }
        @keyframes waddle-breath-inhale {
          0%, 21% { opacity: 1; }
          22%, 100% { opacity: 0; }
        }
        @keyframes waddle-breath-hold {
          0%, 21% { opacity: 0; }
          22%, 58% { opacity: 1; }
          59%, 100% { opacity: 0; }
        }
        @keyframes waddle-breath-exhale {
          0%, 58% { opacity: 0; }
          59%, 100% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .waddle-breathe-bg { animation: none !important; opacity: 0.75 !important; }
          .waddle-ring-pulse { animation: none !important; }
          .waddle-particle { animation: none !important; opacity: 0 !important; }
          .waddle-breath-scale-target { animation: none !important; transform: scale(1) !important; }
          .waddle-celebrate-penguin { animation: none !important; }
          .waddle-celebrate-bloom { animation: none !important; opacity: 0 !important; }
        }
      `}</style>

      {/* Breathing aurora. Larger + slower than a plain glow, and its core
          picks up the warmth journey so the bloom warms alongside the ring. */}
      <div
        aria-hidden="true"
        className="waddle-breathe-bg pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 40%, color-mix(in oklch, ${ringStrokeActive} ${26 + warmth * 16}%, transparent) 0%, color-mix(in oklch, ${color} 10%, transparent) 46%, transparent 80%)`,
          animation: state === 'running' ? 'waddle-breathe 8s ease-in-out infinite' : 'none',
          opacity: state === 'running' ? undefined : 0.55,
          transition: 'background 900ms ease-out',
        }}
      />

      {/* B2: drifting particles. Six positions, varied size/delay/duration so
          the motion never feels grid-aligned. translate3d only — never
          width/height animations (per DESIGN.md). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {[
          { left: '8%',  delay: 0,    duration: 42, size: 6, opacity: 0.28 },
          { left: '22%', delay: -12,  duration: 55, size: 4, opacity: 0.22 },
          { left: '38%', delay: -28,  duration: 38, size: 7, opacity: 0.32 },
          { left: '54%', delay: -6,   duration: 48, size: 5, opacity: 0.24 },
          { left: '72%', delay: -22,  duration: 60, size: 8, opacity: 0.3  },
          { left: '88%', delay: -18,  duration: 44, size: 4, opacity: 0.2  },
        ].map((p, i) => (
          <span
            key={i}
            className="waddle-particle absolute rounded-full"
            style={{
              left: p.left,
              bottom: 0,
              width: p.size, height: p.size,
              background: `color-mix(in oklch, ${color} 65%, var(--background))`,
              animation: `waddle-particle-rise ${p.duration}s linear ${p.delay}s infinite`,
              ['--waddle-particle-opacity' as string]: p.opacity,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* B1: horizon + sitting Waddle silhouette behind the foreground. */}
      <HorizonWithWaddle color={color} />

      {/* HEADER */}
      <div
        className="relative z-10 flex items-start justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3"
        style={{
          opacity: dimmed ? 0.25 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex flex-col">
          <span
            className="text-[11px] font-medium tracking-[0.18em] uppercase"
            style={{ color: `color-mix(in oklch, ${color} 70%, var(--foreground))` }}
          >
            {isBreak ? 'Break' : 'Focus'}
          </span>
          <span className="font-mono text-base font-medium text-foreground/65 tabular-nums tracking-tight mt-1">
            {nowText}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!isBreak && pomodoroCount > 0 && (
            <PomodoroDots count={pomodoroCount} color={color} />
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMinimize}
              aria-label="縮小到角落"
              title="縮小到角落（不停止計時）"
              className="h-10 w-10 rounded-full grid place-items-center text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Minimize className="w-4 h-4" />
            </button>
            {fullscreenSupported && (
              <button
                type="button"
                onClick={toggleNativeFullscreen}
                aria-label={isNativeFullscreen ? '退出全螢幕' : '進入瀏覽器全螢幕'}
                title={isNativeFullscreen ? '退出全螢幕（或按 Esc）' : '進入瀏覽器全螢幕'}
                className="h-10 w-10 rounded-full grid place-items-center text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {isNativeFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); startExitHold() }}
              onPointerUp={cancelExitHold}
              onPointerCancel={cancelExitHold}
              onPointerLeave={cancelExitHold}
              aria-label="長按結束（0.9 秒）"
              title="長按結束並儲存到日曆"
              className="relative h-10 w-10 rounded-full grid place-items-center text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors touch-none"
            >
              <X className="w-5 h-5" />
              {exitHoldProgress > 0 && (
                <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 40 40">
                  <circle
                    cx="20" cy="20" r="18"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 18}
                    strokeDashoffset={2 * Math.PI * 18 * (1 - exitHoldProgress)}
                    style={{ transition: 'stroke-dashoffset 60ms linear' }}
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center px-6"
        style={{
          animation: 'waddle-immersive-in 380ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* B5: intention chip */}
        {label && (
          <div
            className="mb-7 px-3.5 py-1.5 rounded-full border bg-card/55"
            style={{
              borderColor: `color-mix(in oklch, ${color} 38%, var(--border))`,
              opacity: dimmed ? 0.35 : 1,
              transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              animation: 'waddle-chip-in 520ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <span className="text-xs text-foreground/80 flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              {label}
            </span>
          </div>
        )}

        <div className="relative">
          <svg
            className={cn('-rotate-90', state === 'running' && progress > 95 && 'waddle-ring-pulse')}
            width="300"
            height="300"
            viewBox="0 0 300 300"
            style={{
              animation: state === 'running' && progress > 95 ? 'waddle-ring-pulse 1.4s ease-in-out infinite' : undefined,
            }}
          >
            <circle
              cx="150" cy="150" r={ringRadius}
              fill="none"
              stroke={`color-mix(in oklch, ${color} 18%, var(--card))`}
              strokeWidth="6"
            />
            {/* B4: 5-min tick dots overlaid on the track */}
            {ticks.map((t, i) => (
              <circle
                key={i}
                cx={t.cx} cy={t.cy} r="2.25"
                fill={`color-mix(in oklch, ${color} 40%, var(--card))`}
              />
            ))}
            <circle
              cx="150" cy="150" r={ringRadius}
              fill="none"
              stroke={state === 'paused'
                ? `color-mix(in oklch, ${color} 50%, var(--muted))`
                : ringStrokeActive}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringCirc * (1 - Math.min(progress, 100) / 100)}
              style={{
                transition: 'stroke-dashoffset 1000ms linear, stroke 700ms ease-out, filter 900ms ease-out',
                // Soft outer bloom on the progress arc that intensifies as the
                // session warms. Paused freezes the glow off so the ring reads
                // as "held". filter-only, so it never triggers layout.
                filter: state === 'running'
                  ? `drop-shadow(0 0 ${Math.round(5 + warmth * 11)}px color-mix(in oklch, ${ringStrokeActive} ${Math.round(45 + warmth * 25)}%, transparent))`
                  : undefined,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* B3: typography — Geist Mono medium, tight tracking, larger size */}
            <span
              className="font-mono font-medium tabular-nums"
              style={{
                fontSize: timeText.length > 5 ? '4.25rem' : '5.75rem',
                lineHeight: 1,
                letterSpacing: '-0.05em',
                color: state === 'paused'
                  ? 'var(--muted-foreground)'
                  // Digits hold foreground for contrast, warming only a touch
                  // in the final stretch so the arrival feels earned.
                  : warmth > 0.85
                    ? `color-mix(in oklch, var(--foreground) ${Math.round(100 - (warmth - 0.85) * 200)}%, ${WARM_ANCHOR})`
                    : 'var(--foreground)',
                transition: 'color 700ms ease-out',
              }}
            >
              {timeText}
            </span>
            {state === 'paused' && (
              <span className="text-xs text-muted-foreground mt-2 tracking-wider">已暫停</span>
            )}
          </div>
        </div>

        {/* B7: started + projected end; B9: break breath pacer */}
        <div
          className="mt-8 flex flex-col items-center gap-3"
          style={{ opacity: dimmed ? 0 : 1, transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          <p className="text-[11px] text-muted-foreground tabular-nums tracking-wide flex items-center gap-2">
            <span>開始於 {startedAtText}</span>
            {endTimeText && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>預計 {endTimeText} 結束</span>
              </>
            )}
          </p>
          {isBreak && state === 'running' && <BreathPacer color={color} />}
        </div>
      </div>

      {/* FOOTER */}
      <div
        className="relative z-10 flex flex-col items-stretch px-5 pb-[max(env(safe-area-inset-bottom),1rem)] gap-3"
        style={{
          opacity: dimmed ? 0 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        <BgmBar
          music={music}
          musicVolume={musicVolume}
          ambient={ambient}
          playing={bgmPlaying}
          color={color}
          expanded={showBgmBar}
          unavailableSrcs={unavailableSrcs}
          onToggleExpand={() => setShowBgmBar(v => !v)}
          onTogglePlay={onToggleBgm}
          onSelectMusic={onSelectMusic}
          onMusicVolumeChange={onMusicVolumeChange}
          onToggleAmbient={onToggleAmbient}
          onAmbientVolumeChange={onAmbientVolumeChange}
        />
        <div className="flex justify-center pt-1">
          {state === 'paused' ? (
            <button
              type="button"
              onClick={onResume}
              aria-label="繼續"
              className="h-16 w-16 rounded-full grid place-items-center text-white shadow-lg active:scale-95 transition-transform"
              style={{ backgroundColor: color }}
            >
              <Play className="w-6 h-6 translate-x-[2px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              aria-label="暫停"
              className="h-16 w-16 rounded-full grid place-items-center bg-card border border-border text-foreground/70 active:scale-95 transition-transform"
            >
              <Pause className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {showCompletion && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          style={{
            // Solid tinted overlay, no backdrop-blur (DESIGN.md bans the
            // glassmorphism defaults). All alpha via color-mix so the
            // gradient works for non-hex color inputs too.
            background: `radial-gradient(circle at 50% 42%, color-mix(in oklch, ${color} 36%, var(--background)) 0%, color-mix(in oklch, ${color} 16%, var(--background)) 50%, color-mix(in oklch, ${color} 8%, var(--background)) 100%)`,
            animation: 'waddle-completion-in 500ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* A warm halo blooms outward once, behind a penguin that does a
              small celebratory waddle. On-brand reward, no confetti. */}
          <div className="relative mb-7 grid place-items-center">
            <span
              aria-hidden
              className="waddle-celebrate-bloom pointer-events-none absolute rounded-full"
              style={{
                width: 240, height: 240,
                background: `radial-gradient(circle, color-mix(in oklch, ${WARM_ANCHOR} 48%, transparent) 0%, transparent 66%)`,
                animation: 'waddle-celebrate-bloom 1.6s ease-out both',
              }}
            />
            <div
              className="waddle-celebrate-penguin relative"
              style={{ animation: 'waddle-celebrate-penguin 1.9s cubic-bezier(0.22, 1, 0.36, 1) both', transformOrigin: '50% 90%' }}
            >
              <svg viewBox="-30 -45 60 86" className="w-24 h-auto">
                {/* Body */}
                <path
                  d="M 0 -30 C -3 -42, -18 -42, -22 -30 C -28 -20, -28 0, -22 18 C -18 26, -10 30, 0 30 C 10 30, 18 26, 22 18 C 28 0, 28 -20, 22 -30 C 18 -42, 3 -42, 0 -30 Z"
                  fill={`color-mix(in oklch, ${color} 68%, var(--foreground))`}
                />
                {/* Belly */}
                <path
                  d="M -10 -8 C -12 0, -12 14, -8 22 C -4 26, 4 26, 8 22 C 12 14, 12 0, 10 -8 C 6 -12, -6 -12, -10 -8 Z"
                  fill="var(--card)"
                />
                {/* Eyes */}
                <circle cx="-6" cy="-15" r="1.7" fill="var(--foreground)" />
                <circle cx="6" cy="-15" r="1.7" fill="var(--foreground)" />
                {/* Beak */}
                <path d="M -3 -10 L 3 -10 L 0 -6 Z" fill="oklch(0.78 0.16 60)" />
                {/* Feet */}
                <ellipse cx="-7" cy="32" rx="4.5" ry="2" fill="oklch(0.78 0.16 60)" />
                <ellipse cx="7" cy="32" rx="4.5" ry="2" fill="oklch(0.78 0.16 60)" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">辛苦了</h2>
          <p className="text-sm text-muted-foreground mt-2">慢慢搖擺，喝口水吧</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper presentational components
// ---------------------------------------------------------------------------

/**
 * B1 — Distant horizon ridge + foreground iceberg with a tiny Waddle silhouette
 * sitting on it, watching the timer. Static (no animation) so it doesn't
 * compete with the ring for attention. All fills derive from the session
 * color via `color-mix` so the scene picks up the focus/break palette.
 */
function HorizonWithWaddle({ color }: { color: string }) {
  // Two layers: (1) the horizon ridges drawn as a full-bleed SVG band that
  // fades to transparent at the very bottom so it doesn't meet the footer
  // as a hard horizontal strip, (2) the Waddle silhouette as a separate
  // absolutely-positioned element so its position is in viewport coords and
  // never gets cropped by the SVG `slice` cover-fit on narrow screens.
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0"
        style={{ height: '38vh', minHeight: 260 }}
      >
        <svg
          viewBox="0 0 1200 400"
          preserveAspectRatio="xMidYEnd slice"
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <linearGradient id="waddle-ridge-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor={`color-mix(in oklch, ${color} 16%, var(--background))`} stopOpacity="0.85" />
              <stop offset="65%" stopColor={`color-mix(in oklch, ${color} 12%, var(--background))`} stopOpacity="0.5" />
              <stop offset="100%" stopColor={`color-mix(in oklch, ${color} 8%, var(--background))`} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="waddle-iceberg-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor={`color-mix(in oklch, ${color} 24%, var(--background))`} stopOpacity="0.92" />
              <stop offset="70%" stopColor={`color-mix(in oklch, ${color} 18%, var(--background))`} stopOpacity="0.45" />
              <stop offset="100%" stopColor={`color-mix(in oklch, ${color} 10%, var(--background))`} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Distant back ridge */}
          <path
            d="M 0 240 Q 200 200, 380 220 T 720 210 T 1040 225 T 1200 220 L 1200 400 L 0 400 Z"
            fill="url(#waddle-ridge-fade)"
          />
          {/* Front iceberg with a soft swell on the right side where Waddle
              visually sits. */}
          <path
            d="M 0 320 Q 120 295, 280 300 Q 420 308, 540 298 Q 660 306, 800 282 Q 900 268, 980 275 Q 1090 288, 1200 296 L 1200 400 L 0 400 Z"
            fill="url(#waddle-iceberg-fade)"
          />
        </svg>
      </div>
      {/* Waddle penguin — viewport-positioned so it's never cropped by the
          SVG cover-fit. Sits in the right portion of the screen, clear of
          the centered play button and above the footer. Sizes shrink with
          viewport width so the silhouette doesn't dominate small screens. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-0"
        style={{
          // Far enough above the footer that BgmBar + play button don't
          // crop the body. Tuned to the footer's combined height (~ pill +
          // play button + paddings ≈ 130–150px).
          bottom: 'clamp(140px, 19vh, 220px)',
          right: 'clamp(32px, 8vw, 140px)',
        }}
      >
        <svg
          viewBox="-30 -45 60 80"
          className="w-[clamp(56px,7vw,84px)] h-auto"
          style={{ opacity: 0.78 }}
        >
          {/* Body */}
          <path
            d="M 0 -30 C -3 -42, -18 -42, -22 -30 C -28 -20, -28 0, -22 18 C -18 26, -10 30, 0 30 C 10 30, 18 26, 22 18 C 28 0, 28 -20, 22 -30 C 18 -42, 3 -42, 0 -30 Z"
            fill="color-mix(in oklch, var(--foreground) 50%, transparent)"
          />
          {/* Belly */}
          <path
            d="M -10 -8 C -12 0, -12 14, -8 22 C -4 26, 4 26, 8 22 C 12 14, 12 0, 10 -8 C 6 -12, -6 -12, -10 -8 Z"
            fill="color-mix(in oklch, var(--background) 80%, transparent)"
          />
          {/* Tiny beak */}
          <ellipse cx="0" cy="-18" rx="1.6" ry="2.2" fill="color-mix(in oklch, var(--foreground) 72%, transparent)" />
          {/* Feet barely visible at base */}
          <ellipse cx="-7" cy="32" rx="4" ry="1.6" fill="color-mix(in oklch, var(--foreground) 50%, transparent)" />
          <ellipse cx="7"  cy="32" rx="4" ry="1.6" fill="color-mix(in oklch, var(--foreground) 50%, transparent)" />
        </svg>
      </div>
    </>
  )
}

/**
 * B6 — Row of small dots showing today's completed work pomodoros. Hidden on
 * narrow screens (header gets too tight) and always padded to a minimum of 4
 * empty slots so day-one feels like "1/4 done" instead of a lone dot.
 */
function PomodoroDots({ count, color }: { count: number; color: string }) {
  const goal = Math.max(4, Math.min(8, count))
  const filled = Math.min(count, goal)
  return (
    <div
      className="hidden sm:flex items-center gap-1.5"
      role="status"
      aria-label={`今日已完成 ${count} 顆番茄`}
      title={`今日已完成 ${count} 顆番茄`}
    >
      {Array.from({ length: goal }).map((_, i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full transition-colors"
          style={{
            backgroundColor: i < filled
              ? color
              : `color-mix(in oklch, ${color} 18%, var(--border))`,
          }}
        />
      ))}
      {count > goal && (
        <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">+{count - goal}</span>
      )}
    </div>
  )
}

/**
 * B9 — 4-7-8 breath pacer for break phases. Circle grows during inhale,
 * holds during the breath-hold, then shrinks during exhale. Label below
 * cycles through three stacked spans whose opacity keyframes are offset
 * to match the breathing phases. Whole cycle = 19 seconds.
 */
function BreathPacer({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center gap-2 mt-1">
      <div
        className="waddle-breath-scale-target h-10 w-10 rounded-full"
        style={{
          backgroundColor: `color-mix(in oklch, ${color} 25%, transparent)`,
          border: `1px solid color-mix(in oklch, ${color} 55%, transparent)`,
          animation: 'waddle-breath-scale 19s ease-in-out infinite',
        }}
      />
      <div className="relative h-4 w-24 text-center">
        <span className="absolute inset-0 text-[11px] text-muted-foreground" style={{ animation: 'waddle-breath-inhale 19s ease-in-out infinite' }}>吸氣 · 4 秒</span>
        <span className="absolute inset-0 text-[11px] text-muted-foreground" style={{ animation: 'waddle-breath-hold 19s ease-in-out infinite' }}>屏息 · 7 秒</span>
        <span className="absolute inset-0 text-[11px] text-muted-foreground" style={{ animation: 'waddle-breath-exhale 19s ease-in-out infinite' }}>吐氣 · 8 秒</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BgmBar — unchanged behavior, kept in this file for proximity to the
// immersive footer that hosts it.
// ---------------------------------------------------------------------------

interface BgmBarProps {
  music: BgmMusicId | null
  musicVolume: number
  ambient: Record<BgmAmbientId, AmbientPref>
  playing: boolean
  color: string
  expanded: boolean
  unavailableSrcs: Set<string>
  onToggleExpand: () => void
  onTogglePlay: () => void
  onSelectMusic: (id: BgmMusicId | null) => void
  onMusicVolumeChange: (v: number) => void
  onToggleAmbient: (id: BgmAmbientId) => void
  onAmbientVolumeChange: (id: BgmAmbientId, v: number) => void
}

function BgmBar({
  music, musicVolume, ambient, playing, color, expanded, unavailableSrcs,
  onToggleExpand, onTogglePlay,
  onSelectMusic, onMusicVolumeChange, onToggleAmbient, onAmbientVolumeChange,
}: BgmBarProps) {
  // Source of truth for the "what's playing" string lives in lib/timer-bgm
  // so the desktop settings panel and this mobile bar can't drift. The
  // emoji formatting is a presentation choice we apply on top.
  const { hasSelection, activeAmbients, musicMeta, isShuffle } = summarizeBgm(music, ambient, { offLabel: '靜音專注' })
  const musicChip = isShuffle
    ? `${ALL_MUSIC_EMOJI} ${ALL_MUSIC_LABEL}`
    : musicMeta
      ? `${musicMeta.emoji} ${musicMeta.label}`
      : null
  const summary = !hasSelection
    ? '靜音專注'
    : [
        musicChip,
        activeAmbients.length > 0 ? activeAmbients.map((a) => a.emoji).join('') : null,
      ].filter(Boolean).join(' · ')

  return (
    <div
      className={cn(
        'overflow-hidden transition-all duration-300',
        expanded
          // Expanded: full card so the chips/sliders have a real surface.
          ? 'rounded-2xl bg-card border border-border/60'
          // Collapsed: slim pill, semi-transparent, centered with a max
          // width so the scene behind (iceberg + Waddle) shows through and
          // the bottom edge doesn't create a hard horizontal strip.
          : 'rounded-full bg-card/60 border border-border/35 mx-auto max-w-sm backdrop-blur-[4px]',
      )}
    >
      <div className={cn('flex items-center gap-2', expanded ? 'px-3 py-2' : 'pl-2 pr-3 py-1.5')}>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!hasSelection}
          aria-pressed={playing && hasSelection}
          className={cn(
            'shrink-0 rounded-full grid place-items-center transition-colors',
            expanded ? 'h-9 w-9' : 'h-7 w-7',
            !hasSelection
              ? 'bg-secondary/40 text-muted-foreground/40'
              : playing
                ? 'text-white'
                : 'bg-secondary/70 text-foreground/70',
          )}
          style={hasSelection && playing ? { backgroundColor: color } : undefined}
        >
          {playing && hasSelection
            ? <Pause className={expanded ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            : <Play className={cn('translate-x-[1px]', expanded ? 'w-4 h-4' : 'w-3.5 h-3.5')} />
          }
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <Music2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground/80 truncate">{summary}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border/40 space-y-3">
          {/* Music picker — chips for None / each track / 全部循環. Mirror
              of the desktop setup panel, so users can swap tracks without
              leaving focus mode. */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Music2 className="w-3 h-3" />
              背景音樂
            </label>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectMusic(null)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                  music === null
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
                    onClick={() => onSelectMusic(m.id)}
                    disabled={missing}
                    title={missing ? '音檔尚未加入（見 public/audio/README.md）' : undefined}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                      missing
                        ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                        : music === m.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span>{m.emoji}</span>{m.label}
                  </button>
                )
              })}
              {(() => {
                const everyMissing = BGM_MUSIC.every((m) => unavailableSrcs.has(m.src))
                return (
                  <button
                    type="button"
                    onClick={() => onSelectMusic(ALL_MUSIC_ID)}
                    disabled={everyMissing}
                    title={everyMissing ? '尚未加入任何音檔（見 public/audio/README.md）' : '依序循環播放所有背景音樂'}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                      everyMissing
                        ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                        : music === ALL_MUSIC_ID
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span>{ALL_MUSIC_EMOJI}</span>{ALL_MUSIC_LABEL}
                  </button>
                )
              })()}
            </div>
            {music && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={musicVolume}
                onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
                aria-label="背景音樂音量"
                className="w-full h-1 accent-primary"
              />
            )}
          </div>

          {/* Ambient overlays — multi-select, independent volumes. */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">
              環境音（可疊加）
            </label>
            <div className="space-y-1">
              {BGM_AMBIENT.map((a) => {
                const p = ambient[a.id]
                const missing = unavailableSrcs.has(a.src)
                return (
                  <div key={a.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAmbient(a.id)}
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
                      onChange={(e) => onAmbientVolumeChange(a.id, parseFloat(e.target.value))}
                      aria-label={`${a.label}音量`}
                      className="flex-1 h-1 accent-primary disabled:opacity-40"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
