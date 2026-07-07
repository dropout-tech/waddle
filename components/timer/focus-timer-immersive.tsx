'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, X, ChevronUp, ChevronDown, Music2, Minimize } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { useDisplayColor } from '@/hooks/use-display-color'
import {
  BGM_MUSIC, BGM_AMBIENT, summarizeBgm,
  ALL_MUSIC_ID, ALL_MUSIC_LABEL, ALL_MUSIC_EMOJI,
  type AmbientPref, type BgmMusicId, type BgmAmbientId,
} from '@/lib/timer-bgm'

/** Gentle wind-down state passed by the controller while a session ends. */
export interface ImmersiveCompletion {
  kind: 'work' | 'break' | 'manual'
  /** 'break' keeps the session going underneath; 'idle' returns to setup. */
  next: 'break' | 'idle'
  /** True during the final 400ms opacity fade before finalizing. */
  exiting: boolean
}

export interface ImmersiveProps {
  visible: boolean
  state: 'idle' | 'running' | 'paused' | 'completed'
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
  /** Non-null while the completion sequence is playing. */
  completion: ImmersiveCompletion | null
  onPause: () => void
  onResume: () => void
  onExit: () => void
  /** Tap-anywhere skip for the completion sequence. */
  onSkipCompletion: () => void
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

// Break accent — sage, from DESIGN.md's secondary / urgency-low domain. The
// 78/22 mix with --secondary-foreground pins its lightness to the same band
// as --primary (≈0.68 light / ≈0.72 dark), so work and break carry equal
// visual weight in both themes without hand-tuning a dark variant.
const BREAK_ACCENT = 'color-mix(in oklch, var(--urgency-low) 78%, var(--secondary-foreground))'

// Completion copy — one gentle voice for all three endings. No urgency, no
// guilt; the celebration itself (penguin + halo) is reserved for finished
// work sessions so it keeps meaning.
const COMPLETION_COPY: Record<ImmersiveCompletion['kind'], { title: string; sub: string }> = {
  work:   { title: '這段專注完成了', sub: '辛苦了，慢慢喘口氣' },
  break:  { title: '休息結束', sub: '準備好了，隨時開始下一段' },
  manual: { title: '先到這裡也很好', sub: '想繼續時，隨時回來' },
}

function formatClockHHMM(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function FocusTimerImmersive(props: ImmersiveProps) {
  const {
    visible, state, phase, label, color, timeText, progress, startedAtText,
    targetSeconds, startedAt, remainingSeconds, pomodoroCount,
    music, musicVolume, ambient, bgmPlaying, unavailableSrcs, completion,
    onPause, onResume, onExit, onSkipCompletion, onMinimize, onToggleBgm,
    onSelectMusic, onMusicVolumeChange, onToggleAmbient, onAmbientVolumeChange,
  } = props

  const [dimmed, setDimmed] = useState(false)
  const [showBgmBar, setShowBgmBar] = useState(false)
  const [exitHoldProgress, setExitHoldProgress] = useState(0)
  // Ambient "now" clock (B8). Updates on the minute boundary so the display
  // changes in sync with the OS clock rather than drifting by N seconds.
  const [nowText, setNowText] = useState(() => formatClockHHMM(new Date()))
  // Maps the stored light-mode session color to its dark-safe display value.
  const display = useDisplayColor()

  const dimTimerRef = useRef<NodeJS.Timeout | null>(null)
  const exitHoldRef = useRef<{ raf: number; cleared: boolean } | null>(null)

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

  // Direction A「暖紙陶瓷」— the scene is warm cream paper for both phases.
  // The session/workspace color no longer floods the background; it lives
  // only in the mode chip's dot (through the useDisplayColor pipeline so
  // dark mode never goes neon). Everything else keys off a per-phase accent:
  // terracotta (--primary) at work, sage at break — same composition, one
  // world, two temperatures.
  const accent = isBreak ? BREAK_ACCENT : 'var(--primary)'
  const chipDotColor = display(color) ?? color
  // A whisper of the old warmth journey survives in the central bloom only:
  // it deepens slightly as a work session progresses. Felt, not read.
  const warmth = !isBreak && targetSeconds > 0 && state !== 'idle'
    ? Math.max(0, Math.min(1, progress / 100))
    : 0
  // Ring pulse is reserved for the final 10 seconds only — a quiet heartbeat
  // at the arrival, not a nervous tic for the last 5% of every session.
  const inFinalTen = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 10
  // Completion → idle fades the whole surface out; completion → break keeps
  // the surface (the break continues underneath) and fades only the overlay.
  const rootExiting = !!completion?.exiting && completion.next === 'idle'

  const ringRadius = 152
  const ringCenter = 170
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
        cx: ringCenter + ringRadius * Math.cos(angle + Math.PI / 2), // +PI/2 to map back into the rotated SVG coords
        cy: ringCenter + ringRadius * Math.sin(angle + Math.PI / 2),
      })
    }
    return out
  }, [targetSeconds])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-tour flex flex-col select-none overflow-hidden"
      style={{
        // Warm cream paper (or warm charcoal in dark) — a flat token surface.
        // The phase tint happens in the bloom layer below, never here.
        backgroundColor: 'var(--background)',
        opacity: rootExiting ? 0 : 1,
        transition: 'opacity 400ms var(--ease-quart)',
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
          40% { transform: scale(1.02); }
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
          .waddle-breath-scale-target { animation: none !important; transform: scale(1) !important; }
          .waddle-celebrate-penguin { animation: none !important; }
          .waddle-celebrate-bloom { animation: none !important; opacity: 0 !important; }
        }
      `}</style>

      {/* Central bloom — the glaze warmth of Direction A. An extremely faint
          accent wash breathing at the paper's center; recomputes with warmth
          each tick (steps far too small to see), so no background transition
          is needed — animating background would violate the
          transform/opacity/filter rule anyway. */}
      <div
        aria-hidden="true"
        className="waddle-breathe-bg pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(1100px 760px at 50% 36%, color-mix(in oklch, ${accent} ${Math.round(6 + warmth * 3)}%, transparent), transparent 72%)`,
          animation: state === 'running' ? 'waddle-breathe 8s ease-in-out infinite' : 'none',
          opacity: state === 'running' ? undefined : 0.55,
        }}
      />

      {/* Snow mound + small Waddle at the lower right — the diagonal
          counterweight to the centered ring. */}
      <SnowMoundWaddle />

      {/* HEADER */}
      <div
        className="relative z-panel flex items-start justify-between px-5 sm:px-8 pt-[max(env(safe-area-inset-top),1rem)] sm:pt-6 pb-3"
        style={{
          opacity: dimmed ? 0.25 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex flex-col">
          <span
            className="text-[11px] font-medium tracking-[0.22em]"
            style={{ color: `color-mix(in oklch, ${accent} 62%, var(--foreground))` }}
          >
            {isBreak ? '休息中' : '專注中'}
          </span>
          <span className="font-mono text-[13px] text-muted-foreground tabular-nums mt-1.5">
            現在 {nowText}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {!isBreak && pomodoroCount > 0 && (
            <PomodoroDots count={pomodoroCount} color={accent} />
          )}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onMinimize}
              aria-label="縮小到角落"
              title="縮小到角落（不停止計時）"
              className="h-11 w-11 rounded-full grid place-items-center text-foreground/55 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Minimize className="w-4 h-4" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); startExitHold() }}
              onPointerUp={cancelExitHold}
              onPointerCancel={cancelExitHold}
              onPointerLeave={cancelExitHold}
              aria-label="長按結束（0.9 秒）"
              title="長按結束並儲存到日曆"
              className="relative h-11 w-11 rounded-full grid place-items-center text-foreground/55 hover:text-foreground hover:bg-foreground/5 transition-colors touch-none"
            >
              <X className="w-5 h-5" />
              {exitHoldProgress > 0 && (
                <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 44 44">
                  <circle
                    cx="22" cy="22" r="19"
                    fill="none"
                    stroke={accent}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 19}
                    strokeDashoffset={2 * Math.PI * 19 * (1 - exitHoldProgress)}
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
        className="relative z-panel flex-1 flex flex-col items-center justify-center px-6"
        style={{
          animation: 'waddle-immersive-in 380ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Intention chip — the only place the session/workspace color
            survives, as the small dot (dark-adapted via useDisplayColor). */}
        {label && (
          <div
            className="mb-8 sm:mb-10 px-4 py-[7px] rounded-full border bg-card/70"
            style={{
              borderColor: `color-mix(in oklch, ${accent} 30%, var(--border))`,
              opacity: dimmed ? 0.35 : 1,
              transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              animation: 'waddle-chip-in 520ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <span className="text-[13px] text-foreground/85 flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: chipDotColor }}
                aria-hidden
              />
              {label}
            </span>
          </div>
        )}

        <div className="relative">
          <svg
            className="-rotate-90 waddle-ring-pulse w-[min(340px,78vw,44vh)] h-auto"
            viewBox="0 0 340 340"
            style={{
              animation: state === 'running' && inFinalTen ? 'waddle-ring-pulse 2.2s ease-in-out infinite' : undefined,
            }}
          >
            {/* Track — visible but reticent warm gray, one step off the paper */}
            <circle
              cx={ringCenter} cy={ringCenter} r={ringRadius}
              fill="none"
              stroke={`color-mix(in oklch, ${accent} 19%, var(--card))`}
              strokeWidth="9"
            />
            {/* 5-min tick dots overlaid on the track */}
            {ticks.map((t, i) => (
              <circle
                key={i}
                cx={t.cx} cy={t.cy} r="2.5"
                fill={`color-mix(in oklch, ${accent} 32%, var(--background))`}
              />
            ))}
            {/* Progress arc — the single saturated protagonist of the screen */}
            <circle
              cx={ringCenter} cy={ringCenter} r={ringRadius}
              fill="none"
              stroke={state === 'paused'
                ? `color-mix(in oklch, ${accent} 50%, var(--muted))`
                : accent}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringCirc * (1 - Math.min(progress, 100) / 100)}
              style={{
                transition: 'stroke-dashoffset 1000ms linear, stroke 400ms ease-out',
                // A faint constant glow while running; paused turns it off so
                // the ring reads as "held". filter-only — never layout.
                filter: state === 'running'
                  ? `drop-shadow(0 0 5px color-mix(in oklch, ${accent} 30%, transparent))`
                  : undefined,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Typography — Geist Mono, regular weight: a quiet clock face,
                not a shouting billboard. ~84px desktop, scales with vw. */}
            <span
              className="font-mono font-normal tabular-nums"
              style={{
                fontSize: timeText.length > 5 ? 'clamp(2.6rem, 13vw, 3.6rem)' : 'clamp(3.75rem, 19vw, 5.25rem)',
                lineHeight: 1,
                letterSpacing: '-0.045em',
                color: state === 'paused' ? 'var(--muted-foreground)' : 'var(--foreground)',
                transition: 'color 400ms ease-out',
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
          <p className="text-[12.5px] text-muted-foreground tabular-nums tracking-[0.02em] flex items-center gap-2.5">
            <span>開始於 {startedAtText}</span>
            {endTimeText && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>預計 {endTimeText} 結束</span>
              </>
            )}
          </p>
          {isBreak && state === 'running' && <BreathPacer color={accent} />}
        </div>
      </div>

      {/* FOOTER */}
      <div
        className="relative z-panel flex flex-col items-stretch px-5 pb-[max(env(safe-area-inset-bottom),1rem)] gap-3"
        style={{
          opacity: dimmed ? 0 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        {/* Mockup hierarchy: the ceramic pause button first, the BGM pill
            tucked quietly at the very bottom edge below it. */}
        <div className="flex justify-center">
          {state === 'paused' && (
            <button
              type="button"
              onClick={onResume}
              aria-label="繼續"
              className="h-16 w-16 rounded-full grid place-items-center active:scale-95 transition-transform"
              style={{ backgroundColor: accent, color: 'var(--primary-foreground)', boxShadow: 'var(--shadow-ceramic)' }}
            >
              <Play className="w-6 h-6 translate-x-[2px]" />
            </button>
          )}
          {state === 'running' && (
            <button
              type="button"
              onClick={onPause}
              aria-label="暫停"
              className="h-16 w-16 rounded-full grid place-items-center bg-card border border-border text-foreground/70 hover:text-foreground active:scale-95 transition-[transform,color]"
              style={{ boxShadow: 'var(--shadow-ceramic)' }}
            >
              <Pause className="w-6 h-6" />
            </button>
          )}
        </div>
        <BgmBar
          music={music}
          musicVolume={musicVolume}
          ambient={ambient}
          playing={bgmPlaying}
          color={accent}
          expanded={showBgmBar}
          unavailableSrcs={unavailableSrcs}
          onToggleExpand={() => setShowBgmBar(v => !v)}
          onTogglePlay={onToggleBgm}
          onSelectMusic={onSelectMusic}
          onMusicVolumeChange={onMusicVolumeChange}
          onToggleAmbient={onToggleAmbient}
          onAmbientVolumeChange={onAmbientVolumeChange}
        />
      </div>

      {completion && (
        <div
          role="button"
          tabIndex={0}
          onClick={onSkipCompletion}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSkipCompletion() }}
          aria-label="收尾中，點一下繼續"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center outline-none"
          style={{
            // Solid tinted overlay, no backdrop-blur (DESIGN.md bans the
            // glassmorphism defaults). Same warm-paper world as the timer:
            // a deeper accent bloom at center settling into the paper edge.
            background: `radial-gradient(circle at 50% 42%, color-mix(in oklch, ${accent} 15%, var(--background)) 0%, color-mix(in oklch, ${accent} 7%, var(--background)) 55%, var(--background) 100%)`,
            animation: 'waddle-completion-in 500ms var(--ease-quart)',
            // completion → break: only the overlay fades, revealing the break
            // screen already running underneath. completion → idle: the root
            // fades instead, and this overlay rides along with it.
            opacity: completion.exiting && completion.next === 'break' ? 0 : 1,
            transition: 'opacity 400ms var(--ease-quart)',
            pointerEvents: completion.exiting ? 'none' : 'auto',
          }}
        >
          {/* A warm halo blooms outward once, behind a penguin that does a
              small celebratory waddle. On-brand reward, no confetti. The
              full celebration is reserved for completed work sessions —
              break endings and manual stops get the calm, still penguin. */}
          <div className="relative mb-7 grid place-items-center">
            {completion.kind === 'work' && (
              <span
                aria-hidden
                className="waddle-celebrate-bloom pointer-events-none absolute rounded-full"
                style={{
                  width: 240, height: 240,
                  background: `radial-gradient(circle, color-mix(in oklch, ${accent} 45%, transparent) 0%, transparent 66%)`,
                  animation: 'waddle-celebrate-bloom 1.6s ease-out both',
                }}
              />
            )}
            <div
              className="waddle-celebrate-penguin relative"
              style={{
                animation: completion.kind === 'work'
                  ? 'waddle-celebrate-penguin 1.9s var(--ease-quart) both'
                  : undefined,
                transformOrigin: '50% 90%',
              }}
            >
              {/* The one true brand penguin — same hand-drawn Waddle that
                  stands on the snow mound behind the timer. */}
              <WaddleMascot className="w-24 h-auto" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">
            {COMPLETION_COPY[completion.kind].title}
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {COMPLETION_COPY[completion.kind].sub}
          </p>
          <p
            className="text-[11px] text-muted-foreground/55 mt-10"
            style={{ animation: 'waddle-chip-in 700ms var(--ease-quart) 600ms both' }}
          >
            點一下畫面繼續
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper presentational components
// ---------------------------------------------------------------------------

/**
 * Snow mound rising from the lower-right corner with a small Waddle standing
 * on it — the diagonal counterweight to the centered ring (mockup-a). One
 * step brighter than the paper (var(--card)), a soft contour line so the
 * ground "is there", and a foot shadow so the penguin stands rather than
 * floats. Static; phase-neutral by design — the mound belongs to the paper
 * world, not to the session color.
 */
function SnowMoundWaddle() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-0 z-0 w-[min(560px,88vw)]"
    >
      <svg viewBox="0 0 560 190" className="block w-full h-auto">
        <defs>
          <linearGradient id="waddle-mound-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--card)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--card)" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <path
          d="M 560 40 Q 430 22 330 72 Q 230 122 100 152 Q 40 166 0 190 L 560 190 Z"
          fill="url(#waddle-mound-fade)"
        />
        {/* Contour line along the crest */}
        <path
          d="M 560 40 Q 430 22 330 72 Q 230 122 100 152 Q 40 166 0 190"
          fill="none"
          stroke="var(--border)"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
      </svg>
      {/* Waddle + foot shadow, positioned relative to the mound so they ride
          its responsive scaling and never drift off the crest. */}
      <div className="absolute" style={{ right: '22%', bottom: '46%' }}>
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-[3px] h-2.5 w-[130%] rounded-full"
          style={{ background: 'radial-gradient(closest-side, oklch(0.45 0.03 55 / 0.16), transparent)' }}
        />
        <WaddleMascot className="relative w-[clamp(44px,6vw,58px)] h-auto" />
      </div>
    </div>
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
          // width so the scene behind (snow mound + Waddle) shows through
          // and the bottom edge doesn't create a hard horizontal strip.
          // No backdrop-blur — the paper world stays matte (DESIGN.md).
          : 'rounded-full bg-card/65 border border-border/50 mx-auto max-w-sm',
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
