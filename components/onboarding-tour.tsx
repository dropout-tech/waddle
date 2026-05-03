'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { ArrowRight, ArrowLeft, X, Sparkles, LayoutTemplate, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { useIsMobile } from '@/hooks/use-mobile'

// ─────────────────────────────────────────────────────────
// Tour step definitions
// ─────────────────────────────────────────────────────────

interface TourStep {
  /** CSS selector for the element to highlight. Omit for a centered modal. */
  target?: string
  title: string
  body: string
  /** Where to place the tooltip relative to the spotlight. */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Padding (px) around the spotlight rectangle. */
  padding?: number
  /**
   * If true, clicking the highlighted element auto-advances to the next step
   * (and fires the confetti burst). Either way, the "Next" button still works.
   */
  interactive?: boolean
  /** Hint text under the body to nudge the user toward the action. */
  hint?: string
}

// 11 steps total. Mix of:
// - Center modals for high-level concepts (welcome, sync, drag, finale).
// - Spotlights for specific UI elements (panel, task row, calendar, view modes, scratchpad, timer, user menu).
// - Interactive steps where the user actually clicks the highlighted element to advance.
const DESKTOP_STEPS: TourStep[] = [
  {
    title: '歡迎來到 Waddle',
    body: '整合任務、時間排程、專注計時、日記反思的工作面板。慢慢搖擺，把事情做完。90 秒帶你走過。',
  },
  {
    target: '[data-tour="left-panel"]',
    title: '左側：三層結構',
    body: '工作區（工作 / 個人 / 學習）→ 分類（本週 / 待辦…）→ 任務。所有任務都在這。',
    placement: 'right',
    padding: 0,
  },
  {
    target: '[data-tour="task-row"]',
    title: '勾選 / 點開任務',
    body: '左邊圈圈 = 完成；點任務本身 = 打開詳細編輯。試試看。',
    placement: 'right',
    padding: 4,
    interactive: true,
    hint: '👉 試試點一下這個任務',
  },
  {
    title: '🔄 左邊 = 右邊',
    body: '左側清單和右側日曆是**同一份資料的兩種視圖**。在任一邊改動（完成、編輯、刪除）都會即時同步，不會重複。',
  },
  {
    target: '[data-tour="calendar-panel"]',
    title: '日曆：上方待排程 / 下方時間軸',
    body: '每一天上方那條是「待排程」（有日期沒時間）；下方時間軸是「已排時間」的任務。',
    placement: 'left',
    padding: 0,
  },
  {
    target: '[data-tour="calendar-panel"]',
    title: '🤚 拖曳就是排程',
    body: '把任務拖到時間軸 = 排時間。從時間軸拖回上方待排程 = 取消時間（日期保留）。完全自由。',
    placement: 'left',
    padding: 0,
  },
  {
    target: '[data-tour="view-modes"]',
    title: '切換 日 / 週 / 月',
    body: '看細節用日、週計畫用週、看大局用月。試試看。',
    placement: 'bottom',
    padding: 6,
    interactive: true,
    hint: '👉 點看看其他視圖',
  },
  {
    target: '[data-tour="scratchpad"]',
    title: '專注白板',
    body: '工作中冒出靈感？拉開白板丟文字、貼圖、連結。每天分開存。',
    placement: 'bottom',
    padding: 6,
    interactive: true,
    hint: '👉 點開試試',
  },
  {
    target: '[data-tour="focus-timer"]',
    title: '專注計時器',
    body: '右下角番茄鐘。設定 25 分鐘專心做一件事，時間到提醒。',
    placement: 'left',
    padding: 6,
    interactive: true,
    hint: '👉 點開計時器',
  },
  {
    target: '[data-tour="user-menu"]',
    title: '右上角：使用者選單',
    body: '登出在這。設定、日記、報告等其他功能散落在介面上，慢慢探索。',
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '✨ 你準備好了！',
    body: '最後一步：你想怎麼開始？',
  },
]

// Mobile gets a shorter, layout-appropriate tour. Targets that don't exist
// on mobile (segmented view-mode picker, scratchpad pull tab) are replaced
// or dropped; copy is rewritten for the bottom-tab + single-panel layout.
const MOBILE_STEPS: TourStep[] = [
  {
    title: '歡迎來到 Waddle',
    body: '整合任務、時間排程、專注計時、日記反思的工作面板。慢慢搖擺，把事情做完。',
  },
  {
    target: '[data-tour="left-panel"]',
    title: '任務分頁',
    body: '工作區 → 分類 → 任務的三層結構。所有任務都在這。',
    placement: 'top',
    padding: 0,
  },
  {
    target: '[data-tour="task-row"]',
    title: '點任務 = 編輯，長按 = 拖到日曆',
    body: '輕點任務開啟詳細頁；長按 0.3 秒後拖移可以直接排到日曆上的時間。',
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '🤚 左右滑動',
    body: '在「任務」分頁向左滑 → 切到日曆。日曆內向左右滑 → 切換昨天 / 明天。',
  },
  {
    target: '[data-tour="calendar-panel"]',
    title: '日曆：上方待排程 / 下方時間軸',
    body: '上方是「有日期沒時間」的任務；下方時間軸是「已排時間」的任務。',
    placement: 'top',
    padding: 0,
  },
  {
    title: '✨ 底部三分頁',
    body: '任務 / 白板 / 日曆。中間「白板」可以隨時記點子、貼圖、連結。',
  },
  {
    title: '✨ 你準備好了！',
    body: '最後一步：你想怎麼開始？',
  },
]

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

interface Rect { top: number; left: number; width: number; height: number }

const TOOLTIP_WIDTH = 380

function computeTooltipPosition(
  rect: Rect | null,
  placement: TourStep['placement'],
): { top: number; left: number; placement: TourStep['placement'] | 'center' } {
  if (!rect) {
    return {
      top: window.innerHeight / 2 - 140,
      left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
      placement: 'center',
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const tooltipH = 240
  const gap = 16

  const tryPlacement = (p: NonNullable<TourStep['placement']>): { top: number; left: number } => {
    switch (p) {
      case 'right':
        return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left + rect.width + gap }
      case 'left':
        return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left - TOOLTIP_WIDTH - gap }
      case 'bottom':
        return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2 }
      case 'top':
        return { top: rect.top - tooltipH - gap, left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2 }
    }
  }

  const pref = placement ?? 'bottom'
  let pos = tryPlacement(pref)
  let chosen: TourStep['placement'] = pref

  const fits = (p: { top: number; left: number }) =>
    p.left >= 8 && p.left + TOOLTIP_WIDTH <= vw - 8 && p.top >= 8 && p.top + tooltipH <= vh - 8

  if (!fits(pos)) {
    const fallbacks: NonNullable<TourStep['placement']>[] = ['bottom', 'top', 'right', 'left']
    for (const fb of fallbacks) {
      if (fb === pref) continue
      const candidate = tryPlacement(fb)
      if (fits(candidate)) { pos = candidate; chosen = fb; break }
    }
  }

  pos.left = Math.max(8, Math.min(vw - TOOLTIP_WIDTH - 8, pos.left))
  pos.top = Math.max(8, Math.min(vh - tooltipH - 8, pos.top))

  return { ...pos, placement: chosen }
}

// ─────────────────────────────────────────────────────────
// Confetti — small CSS particle burst
// ─────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7']

function Confetti({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-[110]"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      {Array.from({ length: 14 }).map((_, i) => {
        // Even spread around a circle, with a touch of randomness so it
        // doesn't look mechanical. Keep it deterministic per-particle so
        // re-renders during the animation don't jump positions.
        const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.2
        const distance = 60 + (i % 4) * 20
        const dx = Math.cos(angle) * distance
        const dy = Math.sin(angle) * distance
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const size = 6 + (i % 3) * 2
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              left: -size / 2,
              top: -size / 2,
              animation: `confetti-burst 700ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards`,
              ['--dx' as string]: `${dx}px`,
              ['--dy' as string]: `${dy}px`,
            }}
          />
        )
      })}
      <style jsx>{`
        @keyframes confetti-burst {
          0% {
            transform: translate(0, 0) scale(0.3);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

interface OnboardingTourProps {
  open: boolean
  /** Called when the user dismisses the tour (skip / close / final button). */
  onComplete: () => void
  /**
   * Called when user picks a starting point on the final step. We expect the
   * caller to call `onComplete` afterward (we do).
   */
  onChoose: (choice: 'template' | 'blank') => Promise<void> | void
}

export function OnboardingTour({ open, onComplete, onChoose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [tooltipPos, setTooltipPos] = useState({
    top: 0,
    left: 0,
    placement: 'center' as TourStep['placement'] | 'center',
  })
  const [mounted, setMounted] = useState(false)
  const [confetti, setConfetti] = useState<{ key: number; x: number; y: number } | null>(null)
  const [choosing, setChoosing] = useState<'template' | 'blank' | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()
  const STEPS = isMobile ? MOBILE_STEPS : DESKTOP_STEPS
  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  // Re-compute spotlight rect on step change / resize / scroll. useLayoutEffect
  // so the tooltip is positioned before paint to avoid flicker.
  useLayoutEffect(() => {
    if (!open) return

    function update() {
      if (!step.target) {
        setRect(null)
        setTooltipPos(computeTooltipPosition(null, step.placement))
        return
      }
      const el = document.querySelector<HTMLElement>(step.target)
      if (!el) {
        setRect(null)
        setTooltipPos(computeTooltipPosition(null, step.placement))
        return
      }
      const r = el.getBoundingClientRect()
      const pad = step.padding ?? 8
      const next: Rect = {
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      }
      setRect(next)
      setTooltipPos(computeTooltipPosition(next, step.placement))
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const t = setTimeout(update, 100)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      clearTimeout(t)
    }
  }, [open, step])

  // Animate in / reset on close
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => setMounted(true), 50)
      return () => clearTimeout(t)
    }
    setMounted(false)
    setStepIndex(0)
    setChoosing(null)
  }, [open])

  // Fire confetti from a position (defaults to center of current spotlight or tooltip)
  const fireConfetti = useCallback((x?: number, y?: number) => {
    const cx = x ?? (rect ? rect.left + rect.width / 2 : tooltipPos.left + TOOLTIP_WIDTH / 2)
    const cy = y ?? (rect ? rect.top + rect.height / 2 : tooltipPos.top + 60)
    setConfetti({ key: Date.now(), x: cx, y: cy })
  }, [rect, tooltipPos])

  // Advance step + fire confetti
  const advance = useCallback((origin?: { x: number; y: number }) => {
    fireConfetti(origin?.x, origin?.y)
    if (stepIndex < STEPS.length - 1) {
      setTimeout(() => setStepIndex((i) => i + 1), 120)
    }
  }, [stepIndex, fireConfetti])

  // Listen for clicks on the highlighted (interactive) target so the user
  // gets credit for trying the actual feature. The "Next" button still works
  // as a fallback if they prefer to read.
  useEffect(() => {
    if (!open || !step.interactive || !step.target) return

    const el = document.querySelector<HTMLElement>(step.target)
    if (!el) return

    function onClick(e: MouseEvent) {
      // Use the click's screen position as confetti origin so it bursts
      // exactly where they tapped — feels more reactive.
      advance({ x: e.clientX, y: e.clientY })
    }

    el.addEventListener('click', onClick, { once: true })
    return () => el.removeEventListener('click', onClick)
  }, [open, step, advance])

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onComplete()
      } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !isLast) {
        e.preventDefault()
        advance()
      } else if (e.key === 'ArrowLeft' && !isFirst) {
        e.preventDefault()
        setStepIndex((i) => i - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isFirst, isLast, advance, onComplete])

  // Final-step choice handler
  const handleChoose = useCallback(async (choice: 'template' | 'blank') => {
    setChoosing(choice)
    fireConfetti()
    try {
      await onChoose(choice)
    } finally {
      // Brief delay so the user sees the confetti before the overlay disappears
      setTimeout(() => onComplete(), 600)
    }
  }, [onChoose, onComplete, fireConfetti])

  if (!open) return null

  const isCenter = !step.target || tooltipPos.placement === 'center'

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="新手導覽"
    >
      {/* Dim layer.
       *
       * When there's a spotlight (rect), we render a *non-interactive* shape
       * with a giant box-shadow ring to mask everything around it. It has
       * pointer-events: none so the highlighted element underneath stays
       * clickable. When there's no spotlight (welcome / final step), we use
       * a full-screen dim layer that captures clicks to advance.
       */}
      {rect ? (
        <div
          className={cn(
            'absolute pointer-events-none transition-all duration-300 ease-out',
            mounted ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 2px rgba(99, 102, 241, 0.7), 0 0 32px 4px rgba(99, 102, 241, 0.45)',
          }}
        />
      ) : (
        <div
          className={cn(
            'absolute inset-0 bg-black/65 pointer-events-auto transition-opacity duration-300',
            mounted ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => {
            if (!isLast) advance()
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          'absolute pointer-events-auto bg-card text-card-foreground rounded-2xl shadow-2xl border border-border',
          'p-5 transition-all duration-300',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        )}
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: TOOLTIP_WIDTH,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onComplete}
          className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="關閉導覽"
        >
          <X className="w-4 h-4" />
        </button>

        {isCenter && (
          <div className="flex justify-center -mt-1 mb-2">
            <WaddleMascot
              withBackground
              className={cn(
                'w-16 h-16 rounded-2xl shadow-sm',
                isLast ? '' : 'animate-waddle-bob'
              )}
            />
          </div>
        )}

        <div className="flex items-center gap-2 mb-2 pr-6">
          {isCenter && !isLast && <Sparkles className="w-4 h-4 text-primary" />}
          <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>

        {step.hint && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-primary font-medium">{step.hint}</p>
          </div>
        )}

        {/* Final step: 2 starter-pack choices */}
        {isLast && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleChoose('template')}
              disabled={choosing !== null}
              className={cn(
                'flex flex-col items-start gap-2 p-3 rounded-xl border transition-all text-left',
                'hover:border-primary hover:bg-primary/5',
                choosing === 'template'
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              )}
            >
              <LayoutTemplate className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">套用模板</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  工作 / 個人 / 學習 三個工作區，分類已排好，任務你來填
                </div>
              </div>
            </button>
            <button
              onClick={() => handleChoose('blank')}
              disabled={choosing !== null}
              className={cn(
                'flex flex-col items-start gap-2 p-3 rounded-xl border transition-all text-left',
                'hover:border-primary hover:bg-primary/5',
                choosing === 'blank'
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              )}
            >
              <FilePlus2 className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">空白開始</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  一個空工作區，從零開始打造你自己的結構
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Nav row (hidden on final step) */}
        {!isLast && (
          <div className="flex items-center justify-between mt-5">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-full transition-all',
                    i === stepIndex ? 'w-6 h-1.5 bg-primary' : 'w-1.5 h-1.5 bg-border'
                  )}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  上一步
                </button>
              )}
              <button
                onClick={() => advance()}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                下一步
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Skip link */}
        {!isLast && (
          <button
            onClick={onComplete}
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-white/70 hover:text-white transition-colors"
          >
            略過導覽
          </button>
        )}
      </div>

      {/* Confetti burst */}
      {confetti && (
        <Confetti key={confetti.key} x={confetti.x} y={confetti.y} />
      )}
    </div>
  )
}
