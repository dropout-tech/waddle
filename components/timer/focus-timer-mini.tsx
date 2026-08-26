'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, Maximize2, PictureInPicture2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { formatFocusDuration } from '@/lib/timer-format'
import { useIsScrolling, useControlYield, freeHitArea } from './use-floating-dodge'

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
  completion?: {
    kind: 'work' | 'break' | 'manual'
    exiting: boolean
    /** Non-null for a praised session — random line + actual duration. */
    praise?: { key: string; seconds: number } | null
  } | null
  onPause: () => void
  onResume: () => void
  onExpand: () => void
  /** Long-hold stop, mirrors the immersive exit pattern. */
  onStop: () => void
  /** Tap the pill during the completion sequence → skip to the end state. */
  onSkipCompletion?: () => void
  /** 這個瀏覽器支援「永遠置頂的懸浮視窗」時才顯示彈出鈕。 */
  canFloat?: boolean
  /** 懸浮視窗現在開著（按鈕變成「收回」）。 */
  isFloating?: boolean
  onToggleFloat?: () => void
}

// Slightly shorter than the immersive exit hold — the corner pill is a quick
// surface, so 600ms feels snappy without being accident-prone.
const STOP_HOLD_MS = 600

/** How long the phone pill stays open after the last touch before it folds
 *  back into glance mode. */
const EXPANDED_IDLE_MS = 5000

/** True while a full-screen modal/sheet is open (anything marked
 *  aria-modal, except the onboarding tour — its copy points at the pill's
 *  usual corner). The pill lives at the bottom-right, exactly where the
 *  drawer/dialog footers put their primary buttons, so while a modal is up
 *  it slides to the bottom-left instead of covering them. */
function useModalDodge() {
  const [dodge, setDodge] = useState(false)
  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      setDodge(!!document.querySelector('[aria-modal="true"]:not([data-onboarding-tour])'))
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check) }
    check()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal'],
    })
    return () => {
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return dodge
}

export function FocusTimerMini({
  state, phase, color, timeText, progress, label,
  isMobile, mobileBottomOffsetPx, completion, onPause, onResume, onExpand, onStop, onSkipCompletion,
  canFloat, isFloating, onToggleFloat,
}: FocusTimerMiniProps) {
  const { t } = useI18n()
  const dodgeLeft = useModalDodge()
  const rootRef = useRef<HTMLDivElement>(null)
  // Phone only: the pill starts as a glance chip (ring + time) and opens on
  // tap. Desktop keeps the full pill it always had.
  // `openedAt` doubles as "last touched" — any scroll started after it wins,
  // so scrolling away folds the pill without a second piece of state.
  const [openedAt, setOpenedAt] = useState(0)
  const phone = !!isMobile && !completion
  const { scrolling, scrollAt } = useIsScrolling(phone)
  const expanded = phone && openedAt > 0 && openedAt > scrollAt
  const collapsed = phone && !expanded
  const blocked = useControlYield(collapsed && !scrolling, rootRef)
  // Glance mode's tap area — the part of the chip that isn't standing on
  // someone else's control (null = nothing safe left, glance only).
  const hitArea = useMemo(() => freeHitArea(blocked), [blocked])
  // "Visible but not clickable": mid-scroll, or parked on someone else's
  // touch target. Never on desktop, never during the completion sequence.
  const quiet = phone && (scrolling || (collapsed && !!blocked))

  // Auto-fold after a quiet beat; every touch inside the pill restarts it.
  useEffect(() => {
    if (!expanded) return
    const timer = setTimeout(() => setOpenedAt(0), EXPANDED_IDLE_MS)
    return () => clearTimeout(timer)
  }, [expanded, openedAt])
  // Tapping anywhere else folds it immediately.
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenedAt(0)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [expanded])

  const mobileStyle = isMobile
    ? {
        bottom: `calc(${mobileBottomOffsetPx ?? 78}px + env(safe-area-inset-bottom))`,
        right: '0.75rem',
      }
    : undefined
  // 彈窗開著 → 滑到左下角讓出送出按鈕；位移 = -(視窗寬 - 自身寬 - 兩側邊距)，
  // 100% 是自身寬，所以落點剛好是鏡像的左下角。
  const containerStyle = {
    ...mobileStyle,
    transform: dodgeLeft
      ? `translateX(calc(-100vw + 100% + ${isMobile ? '1.5rem' : '3rem'}))`
      : 'translateX(0)',
    // Still readable at a glance, but out of the way of the finger: clearly
    // dimmed mid-scroll, barely receded while it stands on someone's control.
    opacity: scrolling ? 0.45 : collapsed && blocked ? 0.85 : 1,
    // Collapsed = glance mode: the visible chip never takes a tap, only the
    // free strip below does (see hitArea).
    pointerEvents: collapsed || quiet ? ('none' as const) : ('auto' as const),
    transition: 'transform 480ms var(--ease-quart), opacity 180ms var(--ease-quart)',
  }
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
    const doneLabel = completion.praise
      ? t(completion.praise.key, { duration: formatFocusDuration(completion.praise.seconds, t) })
      : completion.kind === 'work' ? t('這段專注完成了')
      : completion.kind === 'break' ? t('休息結束')
      : t('先到這裡也很好')
    return (
      <div
        // z-toast（70）：計時膠囊要壓在任何 modal（50）之上——記事本彈窗、
        // 設定視窗開著時，角落的倒數也不能消失（這正是跨路由常駐計時的意義）。
        data-waddle-mini-root
        className="fixed z-toast bottom-6 right-6"
        style={containerStyle}
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

  const pillClass = cn(
    'flex items-center gap-1 rounded-full shadow-lg',
    'bg-card border',
    collapsed ? 'pl-2.5 pr-3 py-2.5' : 'pl-2.5 pr-1.5 py-1.5',
    // 手機會在收合／展開之間換寬度，DESIGN 禁止 animate width——只淡入淡出。
    phone ? 'transition-opacity duration-200' : 'transition-all duration-300',
    // 進場動畫掛在外層容器（收合／展開會換元素型別而重掛，動畫留在這裡才不會
    // 每按一次就重播一次滑入）。
    phone ? null : 'animate-in fade-in slide-in-from-bottom-2',
  )
  const pillStyle = {
    borderColor: `color-mix(in oklch, ${color} 38%, var(--border))`,
    boxShadow: `0 6px 24px -8px color-mix(in oklch, ${color} 35%, transparent), 0 2px 6px -2px color-mix(in oklch, ${color} 20%, transparent)`,
  }

  // Mini progress ring
  const ring = (
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
  )

  // Time text — the whole reason the pill exists, so it survives every state.
  const time = (
        <span
          data-timer-mini-time
          className={cn(
            'ml-0.5 font-mono font-semibold tabular-nums tracking-tight text-[13px]',
            collapsed ? 'min-w-[2.5rem]' : 'min-w-[3.25rem]',
          )}
          style={{
            color: isPaused ? 'var(--muted-foreground)' : 'var(--foreground)',
            transition: 'color 300ms ease-out',
          }}
          title={label}
        >
          {timeText}
        </span>
  )

  const controls = (
      <>
        {/* 彈出成懸浮視窗（永遠置頂，蓋在其他軟體上面） */}
        {canFloat && onToggleFloat && (
          <button
            type="button"
            data-timer-float-toggle
            onClick={onToggleFloat}
            aria-label={isFloating ? t('收回懸浮視窗') : t('彈出懸浮視窗')}
            title={isFloating ? t('收回懸浮視窗') : t('彈出懸浮視窗（永遠置頂）')}
            className={cn(
              'h-7 w-7 rounded-full grid place-items-center transition-colors',
              isFloating
                ? 'bg-secondary text-foreground'
                : 'text-foreground/55 hover:text-foreground hover:bg-secondary/70',
            )}
          >
            <PictureInPicture2 className="w-3.5 h-3.5" />
          </button>
        )}

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
      </>
  )

  return (
    <div
      // 同上：z-toast 讓膠囊不被 modal 蓋住。
      ref={rootRef}
      data-waddle-mini-root
      data-timer-mini-state={phone ? (collapsed ? 'collapsed' : 'expanded') : 'desktop'}
      data-timer-mini-quiet={quiet ? (scrolling ? 'scroll' : 'yield') : 'off'}
      className={cn('fixed z-toast bottom-6 right-6', phone && 'animate-in fade-in slide-in-from-bottom-2')}
      style={containerStyle}
      role="region"
      aria-label={phase === 'break' ? t('休息計時迷你顯示') : t('專注計時迷你顯示')}
    >
      {collapsed ? (
        // 手機收合＝純顯示模式：只有進度環＋時間。看得見的膠囊本身不吃點擊，
        // 點擊區是下面那顆透明按鈕——而且只鋪在「沒壓到別人控制項」的那一條。
        <>
          <div data-waddle-mini-pill className={pillClass} style={pillStyle}>
            {ring}
            {time}
          </div>
          {hitArea && (
            <button
              type="button"
              data-timer-mini-toggle
              aria-expanded={false}
              aria-label={t('{time}，點一下顯示計時控制', { time: timeText })}
              onClick={() => setOpenedAt(Date.now())}
              className="absolute rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ ...hitArea, pointerEvents: scrolling ? 'none' : 'auto' }}
            />
          )}
        </>
      ) : (
        <div
          data-waddle-mini-pill
          className={pillClass}
          style={pillStyle}
          onPointerDown={phone ? () => setOpenedAt(Date.now()) : undefined}
        >
          {phone ? (
            <button
              type="button"
              data-timer-mini-toggle
              aria-expanded
              aria-label={t('收合計時控制')}
              onClick={() => setOpenedAt(0)}
              className="flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ring}
              {time}
            </button>
          ) : (
            <>
              {ring}
              {time}
            </>
          )}
          {controls}
        </div>
      )}

      <style>{`
        @keyframes waddle-mini-pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 0.95; transform: scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-waddle-mini-pulse] { animation: none !important; }
          /* 位移不動畫，只留透明度——收合／讓路的狀態變化仍然看得懂。 */
          [data-waddle-mini-root] { transition: opacity 180ms linear !important; }
        }
      `}</style>
    </div>
  )
}
