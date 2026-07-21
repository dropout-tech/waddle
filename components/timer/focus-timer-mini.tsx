'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Maximize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

export interface FocusTimerMiniProps {
  state: 'running' | 'paused' | 'completed'
  phase: 'work' | 'break'
  color: string
  /** Pre-formatted timer text like "24:13" or "1:02:05". */
  timeText: string
  /** 0–100 progress for the mini ring. */
  progress: number
  /** Session label (used as tooltip on the time text). */
  label: string
  isMobile?: boolean
  /** Override the mobile bottom offset (px, above safe-area-inset-bottom).
   *  Default (undefined) assumes the app's bottom tab bar (78px). Routes
   *  without a tab bar — e.g. /notebook, which instead has a bottom-docked
   *  editor toolbar — pass a smaller value so the pill clears it. */
  mobileBottomOffsetPx?: number
  /** Non-null while the gentle completion sequence is playing. */
  completion?: { kind: 'work' | 'break' | 'manual'; exiting: boolean } | null
  onPause: () => void
  onResume: () => void
  onExpand: () => void
  /** Long-hold stop, mirrors the immersive exit pattern. */
  onStop: () => void
  /** Tap the pill during the completion sequence → skip to the end state. */
  onSkipCompletion?: () => void
}

// Slightly shorter than the immersive exit hold — the corner pill is a quick
// surface, so 600ms feels snappy without being accident-prone.
const STOP_HOLD_MS = 600

export function FocusTimerMini({
  state, phase, color, timeText, progress, label,
  isMobile, mobileBottomOffsetPx, completion, onPause, onResume, onExpand, onStop, onSkipCompletion,
}: FocusTimerMiniProps) {
  const { t } = useI18n()
  const mobileStyle = isMobile
    ? {
        bottom: `calc(${mobileBottomOffsetPx ?? 78}px + env(safe-area-inset-bottom))`,
        right: '0.75rem',
      }
    : undefined
  const [stopProgress, setStopProgress] = useState(0)
  const holdRef = useRef<{ raf: number; cleared: boolean } | null>(null)

  const startStopHold = () => {
    if (holdRef.current) return
    const start = performance.now()
    const ref = { raf: 0, cleared: false }
    holdRef.current = ref
    const step = (now: number) => {
      if (ref.cleared) return
      const pct = Math.min(1, (now - start) / STOP_HOLD_MS)
      setStopProgress(pct)
      if (pct >= 1) {
        ref.cleared = true
        holdRef.current = null
        setStopProgress(0)
        onStop()
        return
      }
      ref.raf = requestAnimationFrame(step)
    }
    ref.raf = requestAnimationFrame(step)
  }
  const cancelStopHold = () => {
    if (!holdRef.current) return
    holdRef.current.cleared = true
    cancelAnimationFrame(holdRef.current.raf)
    holdRef.current = null
    setStopProgress(0)
  }
  // If we unmount mid-hold the raf step would still try to setState. Cancel
  // proactively so accidental re-renders don't fire onStop after teardown.
  useEffect(() => () => cancelStopHold(), [])

  const R = 9
  const C = 2 * Math.PI * R
  const isPaused = state === 'paused'

  // Gentle completion state — same wind-down the immersive screen gets, in
  // pill form: a small check, one soft line, tap to skip, fade out.
  if (completion) {
    const doneLabel =
      completion.kind === 'work' ? t('這段專注完成了')
      : completion.kind === 'break' ? t('休息結束')
      : t('先到這裡也很好')
    return (
      <div
        className="fixed z-40 bottom-6 right-6"
        style={mobileStyle}
        role="region"
        aria-label={t('計時完成')}
      >
        <button
          type="button"
          onClick={onSkipCompletion}
          aria-label={t('{label}，點一下繼續', { label: doneLabel })}
          className="flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full shadow-lg bg-card border animate-in fade-in slide-in-from-bottom-2"
          style={{
            borderColor: `color-mix(in oklch, ${color} 38%, var(--border))`,
            boxShadow: `0 6px 24px -8px color-mix(in oklch, ${color} 35%, transparent), 0 2px 6px -2px color-mix(in oklch, ${color} 20%, transparent)`,
            opacity: completion.exiting ? 0 : 1,
            transition: 'opacity 400ms var(--ease-quart)',
            pointerEvents: completion.exiting ? 'none' : 'auto',
          }}
        >
          <span
            className="h-5 w-5 rounded-full grid place-items-center text-white shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          >
            <Check className="w-3 h-3" />
          </span>
          <span className="text-[13px] font-medium text-foreground">{doneLabel}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed z-40 bottom-6 right-6"
      style={mobileStyle}
      role="region"
      aria-label={phase === 'break' ? t('休息計時迷你顯示') : t('專注計時迷你顯示')}
    >
      <div
        className={cn(
          'flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-full shadow-lg',
          'bg-card border transition-all duration-300',
          'animate-in fade-in slide-in-from-bottom-2',
        )}
        style={{
          borderColor: `color-mix(in oklch, ${color} 38%, var(--border))`,
          boxShadow: `0 6px 24px -8px color-mix(in oklch, ${color} 35%, transparent), 0 2px 6px -2px color-mix(in oklch, ${color} 20%, transparent)`,
        }}
      >
        {/* Mini progress ring */}
        <div className="relative shrink-0 grid place-items-center" aria-hidden>
          <svg className="-rotate-90" width="22" height="22" viewBox="0 0 22 22">
            <circle
              cx="11" cy="11" r={R}
              fill="none"
              stroke={`color-mix(in oklch, ${color} 22%, var(--secondary))`}
              strokeWidth="2.5"
            />
            <circle
              cx="11" cy="11" r={R}
              fill="none"
              stroke={isPaused ? `color-mix(in oklch, ${color} 50%, var(--muted))` : color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.min(progress, 100) / 100)}
              style={{ transition: 'stroke-dashoffset 1000ms linear, stroke 500ms ease-out' }}
            />
          </svg>
          {/* Subtle running pulse — a soft dot in the ring center. Skipped while
              paused so the pill feels visually frozen. */}
          {!isPaused && (
            <span
              data-waddle-mini-pulse
              className="absolute w-1 h-1 rounded-full"
              style={{
                backgroundColor: color,
                animation: 'waddle-mini-pulse 2.4s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Time text */}
        <span
          className="ml-0.5 font-mono font-semibold tabular-nums tracking-tight text-[13px] min-w-[3.25rem]"
          style={{
            color: isPaused ? 'var(--muted-foreground)' : 'var(--foreground)',
            transition: 'color 300ms ease-out',
          }}
          title={label}
        >
          {timeText}
        </span>

        {/* Expand to immersive */}
        <button
          type="button"
          onClick={onExpand}
          aria-label={t('展開為全畫面')}
          title={t('展開為全畫面')}
          className="h-7 w-7 rounded-full grid place-items-center text-foreground/55 hover:text-foreground hover:bg-secondary/70 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Pause / Resume */}
        {isPaused ? (
          <button
            type="button"
            onClick={onResume}
            aria-label={t('繼續')}
            className="h-7 w-7 rounded-full grid place-items-center text-white transition-transform active:scale-95"
            style={{ backgroundColor: color }}
          >
            <Play className="w-3.5 h-3.5 translate-x-[1px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            aria-label={t('暫停')}
            className="h-7 w-7 rounded-full grid place-items-center bg-secondary/70 text-foreground/75 hover:bg-secondary transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Long-hold stop */}
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); startStopHold() }}
          onPointerUp={cancelStopHold}
          onPointerCancel={cancelStopHold}
          onPointerLeave={cancelStopHold}
          aria-label={t('長按結束（0.6 秒）')}
          title={t('長按結束並儲存到日曆')}
          className="relative h-7 w-7 rounded-full grid place-items-center text-foreground/45 hover:text-foreground hover:bg-secondary/70 transition-colors touch-none"
        >
          <X className="w-3.5 h-3.5" />
          {stopProgress > 0 && (
            <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 28 28">
              <circle
                cx="14" cy="14" r="12"
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 12}
                strokeDashoffset={2 * Math.PI * 12 * (1 - stopProgress)}
                style={{ transition: 'stroke-dashoffset 60ms linear' }}
              />
            </svg>
          )}
        </button>

        <style>{`
          @keyframes waddle-mini-pulse {
            0%, 100% { opacity: 0.35; transform: scale(0.9); }
            50% { opacity: 0.95; transform: scale(1.2); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-waddle-mini-pulse] { animation: none !important; }
          }
        `}</style>
      </div>
    </div>
  )
}
