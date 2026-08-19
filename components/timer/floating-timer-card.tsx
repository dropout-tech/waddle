'use client'

/**
 * 懸浮計時器的內容（塞進 Document PiP 視窗裡的那張卡）。
 *
 * 設計取捨：PiP 視窗小、而且會蓋在使用者正在做的事情上面，所以只放三件事
 * ——剩餘時間、正在做什麼、以及暫停／繼續／結束。細部設定（BGM、音效）留在
 * 主視窗，這裡不重複。
 *
 * 版面用 `cqw`（container query 單位）跟著視窗寬度縮放，使用者把視窗拉大拉小
 * 都不會破版；PiP 視窗可以被拖到很扁，所以還加了高度上的保護。
 */
import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

const STOP_HOLD_MS = 600

export interface FloatingTimerCardProps {
  state: 'running' | 'paused' | 'completed'
  phase: 'work' | 'break'
  color: string
  /** 已排版好的時間字串，例如 "24:13"。 */
  timeText: string
  /** 0–100，畫進度環用。 */
  progress: number
  /** 這段在做什麼（使用者輸入的標籤或預設名稱）。 */
  label: string
  /** 溫柔收尾播放中時非 null。 */
  completion?: { kind: 'work' | 'break' | 'manual'; exiting: boolean } | null
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSkipCompletion?: () => void
  /** 回到主視窗（把懸浮視窗收起來）。 */
  onReturn: () => void
}

export function FloatingTimerCard({
  state, phase, color, timeText, progress, label,
  completion, onPause, onResume, onStop, onSkipCompletion, onReturn,
}: FloatingTimerCardProps) {
  const { t } = useI18n()
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
  useEffect(() => () => cancelStopHold(), [])

  const isPaused = state === 'paused'
  const R = 46
  const C = 2 * Math.PI * R

  const doneLabel =
    completion?.kind === 'work' ? t('這段專注完成了')
    : completion?.kind === 'break' ? t('休息結束')
    : t('先到這裡也很好')

  return (
    <div
      data-floating-timer
      className="flex h-full w-full flex-col items-center justify-center gap-[2cqh] bg-background px-[4cqw] py-[3cqh] text-foreground"
      style={{ containerType: 'size' }}
      onClick={completion && !completion.exiting ? onSkipCompletion : undefined}
    >
      {/* 進度環＋時間。環用 min(…) 綁在較短的那一邊，視窗被拉扁也不會被切掉。 */}
      <div className="relative grid shrink place-items-center" style={{ width: 'min(52cqh, 44cqw)', height: 'min(52cqh, 44cqw)' }}>
        <svg className="-rotate-90 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={`color-mix(in oklch, ${color} 20%, var(--secondary))`}
            strokeWidth="6"
          />
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={isPaused ? `color-mix(in oklch, ${color} 50%, var(--muted))` : color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(progress, 100) / 100)}
            style={{ transition: 'stroke-dashoffset 1000ms linear, stroke 500ms ease-out' }}
          />
        </svg>
        <span
          className="absolute font-mono font-semibold tabular-nums tracking-tight"
          style={{
            fontSize: 'min(13cqh, 11cqw)',
            color: isPaused ? 'var(--muted-foreground)' : 'var(--foreground)',
            transition: 'color 300ms ease-out',
          }}
        >
          {timeText}
        </span>
      </div>

      {/* 正在做什麼 */}
      <p
        className="max-w-full truncate text-center font-medium text-muted-foreground"
        style={{ fontSize: 'min(5cqh, 4.5cqw)' }}
        title={label}
      >
        {completion ? doneLabel : label}
      </p>

      {!completion && (
        <div className="flex shrink-0 items-center gap-[3cqw]">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              aria-label={t('繼續')}
              title={t('繼續')}
              className="grid shrink-0 place-items-center rounded-full text-white transition-transform active:scale-95"
              style={{ backgroundColor: color, width: 'min(13cqh, 12cqw)', height: 'min(13cqh, 12cqw)', minWidth: 34, minHeight: 34 }}
            >
              <Play className="h-1/2 w-1/2 translate-x-[5%]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              aria-label={t('暫停')}
              title={t('暫停')}
              className="grid shrink-0 place-items-center rounded-full bg-secondary/70 text-foreground/75 transition-colors hover:bg-secondary"
              style={{ width: 'min(13cqh, 12cqw)', height: 'min(13cqh, 12cqw)', minWidth: 34, minHeight: 34 }}
            >
              <Pause className="h-1/2 w-1/2" />
            </button>
          )}

          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startStopHold() }}
            onPointerUp={cancelStopHold}
            onPointerCancel={cancelStopHold}
            onPointerLeave={cancelStopHold}
            aria-label={t('長按結束（0.6 秒）')}
            title={t('長按結束並儲存到日曆')}
            className={cn(
              'relative grid shrink-0 place-items-center rounded-full text-foreground/45',
              'touch-none transition-colors hover:bg-secondary/70 hover:text-foreground',
            )}
            style={{ width: 'min(13cqh, 12cqw)', height: 'min(13cqh, 12cqw)', minWidth: 34, minHeight: 34 }}
          >
            <X className="h-1/2 w-1/2" />
            {stopProgress > 0 && (
              <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 28 28">
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

          <button
            type="button"
            onClick={onReturn}
            aria-label={t('回到主視窗')}
            title={t('回到主視窗')}
            className="grid shrink-0 place-items-center rounded-full text-foreground/45 transition-colors hover:bg-secondary/70 hover:text-foreground"
            style={{ width: 'min(13cqh, 12cqw)', height: 'min(13cqh, 12cqw)', minWidth: 34, minHeight: 34 }}
          >
            <ExternalLink className="h-1/2 w-1/2" />
          </button>
        </div>
      )}

      {/* 休息時給一點顏色線索，跟專注區分開 */}
      {phase === 'break' && !completion && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, color }}>
          {t('休息中')}
        </span>
      )}
    </div>
  )
}
