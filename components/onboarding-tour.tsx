'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, useSyncExternalStore } from 'react'
import { ArrowRight, ArrowLeft, X, LayoutTemplate, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import { isImeComposing } from '@/lib/ime'
import { hubAvailable } from '@/lib/floating-hub'

// ─────────────────────────────────────────────────────────
// Tour step definitions
// ─────────────────────────────────────────────────────────

/**
 * Fired on phones when a step's target lives on a specific bottom tab.
 * MainLayout listens and switches tab, so the spotlight has something to
 * land on (the task list is not mounted while the calendar tab is showing).
 */
export const TOUR_MOBILE_TAB_EVENT = 'huddle:tour-mobile-tab'

interface TourStep {
  /** CSS selector for the element to highlight. Omit for a centered modal. */
  target?: string
  title: string
  body: string
  /**
   * Copy to use when `target` is not on screen. The penguin, for one, only
   * exists after it has been adopted — which happens right after the tour.
   */
  bodyWithoutTarget?: string
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
  /** Phones only: the bottom tab this step's target lives on. */
  mobileTab?: 'tasks' | 'calendar'
  /** Dropped from the tour when the browser can't offer the feature. */
  requires?: 'floating-hub'
}

// Copy rules (2026-10-01 pass): written for a first-time, non-technical
// reader. One idea per step, about three short sentences, the title names
// the thing that is lit up, quoted words match the on-screen labels, and no
// "like product X" comparisons. Lists use 「、」 rather than slashes.
//
// Copy shared by the desktop and phone tours (one dictionary entry each).
const WELCOME_BODY = '任務、行事曆、專注計時和記事本，都放在同一個地方。花一兩分鐘帶你走一圈，隨時可以略過。'
const TASK_LIST_BODY = '所有任務都收在這裡，分成三層：工作區 → 分類 → 任務。最上面的「未分類」是收件匣，還沒決定放哪的任務會先到這裡。'
const SHORTCUTS_TITLE = '會議、整理、完成'
const SHORTCUTS_BODY = '「會議」列出今天的會議，可以直接加入視訊。有任務過了原訂時間，這裡會出現「整理」，讓你逐一重新安排。「完成」可以回顧做完的任務和統計。'
const CALENDAR_TITLE = '日曆：上面待排程，下面時間軸'
const CALENDAR_BODY = '每天最上面那一格，放「有日期、還沒排時間」的任務；下面的時間軸，放排好時間的任務。任務前面會標出所屬分類，方便一眼分辨。'
const TIMER_BODY = '設定一段時間，專心做一件事；預設是 25 分鐘的番茄鐘。可以搭配背景音樂或環境音，例如雨聲、海浪、咖啡廳。結束後會自動記到今天的日曆。'
const WATER_BODY = '每 60 分鐘，Huddle 會提醒你喝口水。想晚點再喝，按「再過一下」，五分鐘後再提醒。間隔可以在「設定」調整，也可以整個關掉。'
const PET_BODY = '角落這隻企鵝是你專屬的。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。牠偶爾會提醒你會議和過期的任務，但多半只是在說些荒謬的話。'
const PET_BODY_BEFORE_ADOPTION = '導覽結束後，你可以領養一隻專屬企鵝，牠會住在畫面角落。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。'
const ASSIGN_BODY = '打開任務，按右上角的小人圖示，就能把任務交給共享夥伴或組織成員。任務會出現在對方的清單和日曆；對方完成或退回，你都看得到。進度在帳號選單的「指派任務」；建立組織需要 Pro 會員。'

// Mix of:
// - Center modals for high-level concepts (welcome, sync, water, assigning, finale).
// - Spotlights for specific UI elements, ordered so the light sweeps the
//   screen instead of jumping around: left panel → calendar → top bar from
//   left to right → the bottom corners.
// - Interactive steps where the user actually clicks the highlighted element to advance.
const DESKTOP_STEPS: TourStep[] = [
  {
    title: '歡迎來到 Huddle',
    body: WELCOME_BODY,
  },
  {
    target: '[data-tour="left-panel"]',
    title: '左邊：任務清單',
    body: TASK_LIST_BODY,
    placement: 'right',
    padding: 0,
  },
  {
    target: '[data-tour="task-row"]',
    title: '完成任務、打開任務',
    body: '點左邊的圓圈，任務就完成了。點任務名稱可以打開編輯：改時間、寫備註，或把它設成「會議」。',
    placement: 'right',
    padding: 4,
    interactive: true,
    hint: '👉 試試點一下這個任務',
  },
  {
    target: '[data-tour="task-shortcut-row"]',
    title: SHORTCUTS_TITLE,
    body: SHORTCUTS_BODY,
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '🔄 左邊 = 右邊',
    body: '左邊的清單和右邊的日曆，看的是同一批任務。在任何一邊完成、修改或刪除，另一邊會立刻跟著變。',
  },
  {
    target: '[data-tour="calendar-panel"]',
    title: CALENDAR_TITLE,
    body: `${CALENDAR_BODY}想和夥伴互看行事曆，按上方工具列的「共享」。`,
    placement: 'left',
    padding: 0,
  },
  {
    target: '[data-tour="calendar-panel"]',
    title: '🤚 拖曳就是排程',
    body: '把任務拖到時間軸，就排好時間；拖回最上面那一格，就取消時間。在時間軸空白處點兩下，可以直接新增任務。重複的任務換時間時，Huddle 會問你只改這一天，還是之後也一起改。',
    placement: 'left',
    padding: 0,
  },
  {
    target: '[data-tour="view-modes"]',
    title: '切換日、週、月',
    body: '看細節用「日」，排一週用「週」，看整個月用「月」。',
    placement: 'bottom',
    padding: 6,
    interactive: true,
    hint: '👉 點點看，切換不同檢視',
  },
  {
    target: '[data-tour="scratchpad"]',
    title: '白板',
    body: '工作到一半冒出想法？拉開白板，隨手記下文字、待辦、圖片或連結。每天一張新的，之前的也翻得回去。',
    placement: 'bottom',
    padding: 6,
    interactive: true,
    hint: '👉 點開試試',
  },
  {
    target: '[data-tour="notebook-entry"]',
    title: '記事本',
    body: '想寫長一點的筆記，點這裡。打字時輸入「/」，可以插入標題、待辦清單、圖片等區塊；選取文字，會跳出粗體、連結等格式按鈕。',
    placement: 'bottom',
    padding: 6,
  },
  {
    target: '[data-tour="sticky-notes-toggle"]',
    title: '便條紙',
    body: '按一下，畫面上會多一層便條紙，換頁也不會消失。便條紙可以拖動、換顏色；暫時用不到的，收進旁邊的「收納」。',
    placement: 'bottom',
    padding: 6,
  },
  {
    target: '[data-tour="calendar-export"]',
    title: '更多工具',
    body: '這個小箭頭裡收著報告、每日簽到、匯出等功能。「匯出」可以把行程存成圖片分享；開啟隱私模式，就只顯示時段、不顯示任務名稱。',
    placement: 'bottom',
    padding: 6,
  },
  {
    target: '[data-tour="calendar-export"]',
    title: '📅 每日簽到',
    body: '同一個選單裡的「每日簽到」：每天簽到一次，累積分數。頁面下方有匿名排行榜，只顯示小企鵝編號，不顯示帳號。',
    placement: 'bottom',
    padding: 6,
  },
  {
    target: '[data-tour="notification-center"]',
    title: '通知中心',
    body: '鈴鐺會提醒你快到期、已過期，或放了很久沒動的任務。有新提醒時，鈴鐺上會出現數字。',
    placement: 'bottom',
    padding: 4,
  },
  {
    target: '[data-tour="user-menu"]',
    title: '右上角：帳號選單',
    body: '點頭像打開選單：帳號資料、會員與推薦、深色模式和登出都在這裡。另外，按 ⌘K 或 Ctrl+K 可以快速搜尋任務，按「?」可以看所有快捷鍵。',
    placement: 'bottom',
    padding: 4,
  },
  {
    target: '[data-tour="user-menu"]',
    title: '🗒️ 會議轉任務',
    body: '同一個選單裡的「會議轉任務」：貼上會議逐字稿或筆記，Huddle 會幫你整理出待辦，並標出負責人和期限。',
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '🤝 指派任務 ＆ 組織',
    body: ASSIGN_BODY,
  },
  {
    target: '[data-tour="focus-timer"]',
    title: '專注計時',
    body: TIMER_BODY,
    placement: 'left',
    padding: 6,
    interactive: true,
    hint: '👉 點開計時器',
  },
  {
    // Chrome / Edge only — the launcher is not rendered elsewhere, so the
    // step is dropped rather than pointing at a button that isn't there.
    target: '[data-hub-launcher]',
    requires: 'floating-hub',
    title: '懸浮小視窗',
    body: '按這個按鈕，會跳出一個永遠在最上層的小視窗，切到別的軟體也看得到。裡面有計時器、記事本和白板三個分頁。',
    placement: 'bottom',
    padding: 6,
  },
  {
    title: '💧 喝水小提醒',
    body: WATER_BODY,
  },
  {
    target: '[data-tour="quick-links-bar"]',
    title: '常用連結',
    body: '把常開的網址放在這裡，例如 Notion、GitHub、Gmail。點一下，就在新分頁打開。',
    placement: 'top',
    padding: 4,
  },
  {
    target: '[data-tour="pet"]',
    title: '🐧 你的企鵝',
    body: PET_BODY,
    bodyWithoutTarget: PET_BODY_BEFORE_ADOPTION,
    placement: 'right',
    padding: 6,
  },
  {
    title: '✨ 你準備好了！',
    body: '最後一步：你想怎麼開始？',
  },
]

// Mobile gets a shorter, layout-appropriate tour. Targets that don't exist
// on mobile (segmented view-mode picker, scratchpad pull tab) are replaced
// or dropped; copy is rewritten for the bottom-tab + single-panel layout.
// The phone opens on the 日曆 tab, so every spotlight step names the tab its
// target lives on (`mobileTab`) and the tour switches there first.
const MOBILE_STEPS: TourStep[] = [
  {
    title: '歡迎來到 Huddle',
    body: WELCOME_BODY,
  },
  {
    target: '[data-tour="left-panel"]',
    mobileTab: 'tasks',
    title: '「任務」分頁',
    body: TASK_LIST_BODY,
    placement: 'bottom',
    padding: 0,
  },
  {
    target: '[data-tour="task-row"]',
    mobileTab: 'tasks',
    title: '點一下編輯，長按拖到日曆',
    body: '點左邊的圓圈完成任務，點任務名稱打開編輯。長按任務再拖動，可以直接排進日曆。',
    placement: 'bottom',
    padding: 4,
  },
  {
    target: '[data-tour="task-shortcut-row"]',
    mobileTab: 'tasks',
    title: SHORTCUTS_TITLE,
    body: SHORTCUTS_BODY,
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '🤚 左右滑動',
    body: '在「任務」分頁往左滑，會切到日曆。在日曆裡左右滑，可以往前、往後翻日期。',
  },
  {
    target: '[data-tour="calendar-panel"]',
    mobileTab: 'calendar',
    title: CALENDAR_TITLE,
    body: `${CALENDAR_BODY}想和夥伴互看行事曆，到右上角「⋯」裡的「共享」。`,
    placement: 'bottom',
    padding: 0,
  },
  {
    target: '[data-tour="mobile-more"]',
    mobileTab: 'calendar',
    title: '更多工具都在「⋯」',
    body: '通知、帳號、記事本、便條紙和設定，都收在右上角的「⋯」。有新通知時，「⋯」上會出現數字。',
    placement: 'bottom',
    padding: 4,
  },
  {
    target: '[data-tour="mobile-add-task"]',
    mobileTab: 'calendar',
    title: '新增任務',
    body: '按這顆「＋」新增任務。也可以在時間軸的空白處點兩下，直接在那個時段建立。',
    placement: 'top',
    padding: 6,
  },
  {
    target: '[data-tour="mobile-tabs"]',
    title: '底部五個分頁',
    body: '「重點」看各分類的進度，「任務」是完整清單，「白板」隨手記想法，「日曆」排時間，「連結」放常開的網址。',
    placement: 'top',
    padding: 0,
  },
  {
    target: '[data-tour="focus-timer"]',
    mobileTab: 'calendar',
    title: '專注計時',
    body: TIMER_BODY,
    placement: 'top',
    padding: 6,
    hint: '👉 點開試試',
  },
  {
    title: '💧 喝水小提醒',
    body: WATER_BODY,
  },
  {
    target: '[data-tour="pet"]',
    mobileTab: 'calendar',
    title: '🐧 你的企鵝',
    body: PET_BODY,
    bodyWithoutTarget: PET_BODY_BEFORE_ADOPTION,
    placement: 'top',
    padding: 6,
  },
  {
    target: '[data-tour="mobile-more"]',
    mobileTab: 'calendar',
    title: '📅 每日簽到 ＆ 會議轉任務',
    body: '「⋯」裡的「每日簽到」：每天簽到一次，累積分數。「⋯」→「帳號」→「會議轉任務」：貼上會議逐字稿，Huddle 會幫你整理出待辦。',
    placement: 'bottom',
    padding: 4,
  },
  {
    title: '🤝 指派任務 ＆ 組織',
    body: ASSIGN_BODY,
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
/** Fallback height used only before the tooltip has ever been measured. */
const TOOLTIP_FALLBACK_HEIGHT = 240
const EDGE_MARGIN = 8
/**
 * Extra bottom margin: the 「略過導覽」 pill hangs directly below the card in a
 * 44px-tall tap target (`top-full h-11`), so the clamp has to reserve room
 * for it or it lands off-screen on bottom-anchored steps.
 */
const SKIP_LINK_MARGIN = 44

/** iOS notch / home-indicator insets (0 everywhere else). */
interface SafeArea { top: number; bottom: number }
const NO_SAFE_AREA: SafeArea = { top: 0, bottom: 0 }

/**
 * Several elements can carry the same `data-tour` name (a toolbar button and
 * its twin inside a closed menu), so take the first one that is actually
 * laid out rather than the first in DOM order.
 */
function findTourTarget(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/**
 * True while the target (or a container it sits in) is still playing a
 * one-shot entrance animation — measuring then would freeze the spotlight
 * on a mid-slide position.
 */
function isMidEntrance(el: HTMLElement): boolean {
  if (typeof document.getAnimations !== 'function') return false
  return document.getAnimations().some((a) => {
    if (a.playState !== 'running') return false
    const effect = a.effect as KeyframeEffect | null
    const node = effect?.target
    return !!node && node.contains(el) && effect.getComputedTiming().iterations !== Infinity
  })
}

/**
 * Positions the tooltip next to the spotlight and then **hard-clamps it into
 * the viewport**.
 *
 * `size` must be the *measured* box of the rendered tooltip. Steps with long
 * copy render 300px+ tall; a hardcoded height estimate under-clamps and pushes
 * the card's bottom — including the 下一步 button — outside the viewport, which
 * dead-ends the tour (2026-08-26 production bug on the 專注計時器 step).
 */
function computeTooltipPosition(
  rect: Rect | null,
  placement: TourStep['placement'],
  size?: { width: number; height: number } | null,
  safe: SafeArea = NO_SAFE_AREA,
): { top: number; left: number; placement: TourStep['placement'] | 'center' } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tooltipW = size && size.width > 0 ? size.width : Math.min(TOOLTIP_WIDTH, vw - 24)
  const tooltipH = size && size.height > 0 ? size.height : TOOLTIP_FALLBACK_HEIGHT
  const minTop = EDGE_MARGIN + safe.top
  const maxBottom = vh - EDGE_MARGIN - SKIP_LINK_MARGIN - safe.bottom

  // Final safety net for every code path below: never let any edge of the
  // tooltip leave the viewport (or slide under the notch / home indicator).
  // On a phone the card is nearly as wide as the screen: keep it centred so
  // it doesn't shuffle a few pixels left and right from step to step.
  const narrow = vw - tooltipW < 48
  const clamp = (p: { top: number; left: number }) => ({
    left: narrow
      ? (vw - tooltipW) / 2
      : Math.max(EDGE_MARGIN, Math.min(Math.max(EDGE_MARGIN, vw - tooltipW - EDGE_MARGIN), p.left)),
    top: Math.max(minTop, Math.min(Math.max(minTop, maxBottom - tooltipH), p.top)),
  })

  if (!rect) {
    return {
      ...clamp({ top: vh / 2 - tooltipH / 2, left: vw / 2 - tooltipW / 2 }),
      placement: 'center',
    }
  }

  const gap = 16

  const tryPlacement = (p: NonNullable<TourStep['placement']>): { top: number; left: number } => {
    switch (p) {
      case 'right':
        return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left + rect.width + gap }
      case 'left':
        return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left - tooltipW - gap }
      case 'bottom':
        return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - tooltipW / 2 }
      case 'top':
        // The 略過導覽 pill hangs under the card, i.e. between it and the target.
        return { top: rect.top - tooltipH - SKIP_LINK_MARGIN - 4, left: rect.left + rect.width / 2 - tooltipW / 2 }
    }
  }

  const pref = placement ?? 'bottom'
  // A side placement only has to clear the target along its own axis; the
  // other axis is clamped into view afterwards.
  const clears = (p: NonNullable<TourStep['placement']>, pos: { top: number; left: number }) => {
    switch (p) {
      case 'right': return pos.left + tooltipW <= vw - EDGE_MARGIN
      case 'left': return pos.left >= EDGE_MARGIN
      case 'bottom': return pos.top + tooltipH <= maxBottom
      case 'top': return pos.top >= minTop
    }
  }

  for (const p of [pref, 'bottom', 'top', 'right', 'left'] as const) {
    const pos = tryPlacement(p)
    if (clears(p, pos)) return { ...clamp(pos), placement: p }
  }

  // Nothing clears the target — it fills the screen (a whole panel on a
  // phone). Park the card along the target's bottom edge: the top of a panel
  // is where its header and first rows are, so that is the part worth keeping
  // in view. Anchoring to the target rather than the viewport keeps the card
  // and its 略過導覽 pill off the tab bar underneath.
  const parkBottom = Math.min(maxBottom, rect.top + rect.height - EDGE_MARGIN - SKIP_LINK_MARGIN)
  return {
    ...clamp({ top: parkBottom - tooltipH, left: vw / 2 - tooltipW / 2 }),
    placement: pref,
  }
}

// ─────────────────────────────────────────────────────────
// Confetti — small CSS particle burst
// ─────────────────────────────────────────────────────────

// Warm-palette confetti — mirrors workspace + chart tokens so the burst feels
// like Waddle, not Linear. Hues stay in 25-300 OKLCH range (no cool indigo /
// blue / pure red).
const CONFETTI_COLORS = ['#e07b5a', '#8fae8b', '#c4a4b5', '#d4a76a', '#b58fae', '#7da2b8']

function Confetti({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-max"
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
  /**
   * Temporarily hide the tour without losing its place — e.g. while the task
   * detail drawer the user opened from an interactive step is on screen, so
   * the next spotlight isn't drawn underneath it. It resumes on close.
   */
  paused?: boolean
  /** Called when the user dismisses the tour (skip / close / final button). */
  onComplete: () => void
  /**
   * Called when user picks a starting point on the final step. We expect the
   * caller to call `onComplete` afterward (we do).
   */
  onChoose: (choice: 'template' | 'blank') => Promise<void> | void
}

const subscribeNever = () => () => {}
const hubUnavailableOnServer = () => false

export function OnboardingTour({ open, paused = false, onComplete, onChoose }: OnboardingTourProps) {
  // Visible and listening. `open` alone still owns the reset-on-close below.
  const active = open && !paused
  const { t } = useI18n()
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
  const safeAreaRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()
  // The 懸浮小視窗 launcher only exists in Chrome / Edge on a computer.
  const hubReady = useSyncExternalStore(subscribeNever, hubAvailable, hubUnavailableOnServer)
  const STEPS = useMemo(
    () => (isMobile ? MOBILE_STEPS : DESKTOP_STEPS).filter((s) => s.requires !== 'floating-hub' || hubReady),
    [isMobile, hubReady],
  )
  const step = STEPS[Math.min(stepIndex, STEPS.length - 1)]
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= STEPS.length - 1

  // Re-compute spotlight rect on step change / resize / scroll. useLayoutEffect
  // so the tooltip is positioned before paint to avoid flicker.
  useLayoutEffect(() => {
    if (!active) return

    // Measured box of the *currently rendered* tooltip. This layout effect runs
    // after React commits the new step's DOM, so the height we read here is the
    // new step's real height — which is what the viewport clamp needs.
    function tooltipSize() {
      const el = tooltipRef.current
      if (!el) return null
      const r = el.getBoundingClientRect()
      return r.height > 0 ? { width: r.width, height: r.height } : null
    }

    // env(safe-area-inset-*) can't be read from JS directly; the probe turns
    // the insets into paddings we can measure.
    function safeArea(): SafeArea {
      const probe = safeAreaRef.current
      if (!probe) return NO_SAFE_AREA
      const cs = getComputedStyle(probe)
      return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
    }

    // Phones: bring up the tab the target lives on before looking for it.
    let switchingTab = false
    if (isMobile && step.mobileTab) {
      const current = document.querySelector('[data-tour="mobile-tabs"] [aria-selected="true"]')?.getAttribute('data-tab')
      if (current !== step.mobileTab) {
        switchingTab = true
        window.dispatchEvent(new CustomEvent(TOUR_MOBILE_TAB_EVENT, { detail: step.mobileTab }))
      }
    }

    /**
     * `settling` passes run right after a step change, while the screen may
     * still be moving (tab switch, entrance animation): they leave the
     * previous spotlight alone rather than jump to a half-finished position.
     * The last scheduled pass — and every resize / scroll — is final.
     */
    function update(settling: boolean, mayScroll: boolean) {
      const size = tooltipSize()
      const safe = safeArea()
      const el = step.target ? findTourTarget(step.target) : null
      if (!el) {
        if (settling && step.target && switchingTab) return
        setRect(null)
        setTooltipPos(computeTooltipPosition(null, step.placement, size, safe))
        return
      }
      if (settling && isMidEntrance(el)) return
      let r = el.getBoundingClientRect()
      // A target scrolled out of view is brought back before it is lit.
      // (4px of slack: fixed bars sit a sub-pixel past the edge and must not scroll anything.)
      if (mayScroll && r.height < window.innerHeight && (r.top < -4 || r.bottom > window.innerHeight + 4)) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        r = el.getBoundingClientRect()
      }
      const pad = step.padding ?? 8
      const next: Rect = {
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      }
      setRect((prev) => (
        prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height
          ? prev
          : next
      ))
      setTooltipPos(computeTooltipPosition(next, step.placement, size, safe))
    }

    const onViewportChange = () => update(false, false)
    update(true, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    const timers = [
      setTimeout(() => update(true, true), 100),
      setTimeout(() => update(true, true), 260),
      setTimeout(() => update(false, true), 520),
    ]
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
      timers.forEach(clearTimeout)
    }
  }, [active, step, isMobile])

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
  }, [stepIndex, fireConfetti, STEPS.length])

  // Listen for clicks on the highlighted (interactive) target so the user
  // gets credit for trying the actual feature. The "Next" button still works
  // as a fallback if they prefer to read.
  useEffect(() => {
    if (!active || !step.interactive || !step.target) return

    const el = findTourTarget(step.target)
    if (!el) return

    function onClick(e: MouseEvent) {
      // Use the click's screen position as confetti origin so it bursts
      // exactly where they tapped — feels more reactive.
      advance({ x: e.clientX, y: e.clientY })
    }

    el.addEventListener('click', onClick, { once: true })
    return () => el.removeEventListener('click', onClick)
  }, [active, step, advance])

  // Keyboard nav
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onComplete()
      } else if (e.key === 'Enter' && isImeComposing(e)) {
        return
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
  }, [active, isFirst, isLast, advance, onComplete])

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

  if (!active) return null

  const isCenter = !step.target || tooltipPos.placement === 'center'
  // The target was looked for and is not on screen → the card is centred and
  // the step may carry copy written for exactly that situation.
  const targetMissing = !!step.target && !rect && tooltipPos.placement === 'center'
  const body = targetMissing && step.bodyWithoutTarget ? step.bodyWithoutTarget : step.body
  const progress = (stepIndex + 1) / STEPS.length

  return (
    <div
      className="fixed inset-0 z-tour pointer-events-none"
      role="dialog"
      aria-modal="true"
      // 計時膠囊的「彈窗開啟就閃避到左下」邏輯認 aria-modal；導覽文案指著
      // 膠囊平常待的右下角，所以用這個標記讓它豁免（focus-timer-mini.tsx）。
      data-onboarding-tour
      // Hooks for scripts/e2e/tour-polish-verify.mjs.
      data-tour-step={stepIndex + 1}
      data-tour-total={STEPS.length}
      data-tour-target={step.target}
      aria-label={t('新手導覽')}
    >
      {/* Measures the iOS safe-area insets for the viewport clamp. */}
      <div
        ref={safeAreaRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      />

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
          data-tour-spotlight
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
            // Warm dim + spotlight ring read from tokens so dark mode and
            // future brand-hue tweaks track automatically. color-mix is
            // supported in box-shadow values in all evergreen browsers.
            boxShadow: '0 0 0 9999px color-mix(in oklch, var(--foreground) 55%, transparent), 0 0 0 2px color-mix(in oklch, var(--primary) 85%, transparent), 0 0 32px 4px color-mix(in oklch, var(--primary) 40%, transparent)',
          }}
        />
      ) : (
        <div
          className={cn(
            'absolute inset-0 bg-foreground/55 pointer-events-auto transition-opacity duration-300',
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
        data-tour-card
        className={cn(
          'absolute pointer-events-auto bg-card text-card-foreground rounded-2xl shadow-2xl border border-border',
          'p-5 transition-all duration-300',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        )}
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: TOOLTIP_WIDTH,
          maxWidth: 'calc(100vw - 24px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 44px tap target on phones; a quieter 32px on a pointer device. */}
        <button
          onClick={onComplete}
          className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors md:top-2.5 md:right-2.5 md:h-8 md:w-8"
          aria-label={t('關閉導覽')}
        >
          <X className="w-4 h-4" />
        </button>

        {isCenter && (
          <div className="flex justify-center -mt-1 mb-2">
            <HuddleMascot
              withBackground
              className={cn(
                'w-16 h-16 rounded-2xl shadow-sm',
                isLast ? '' : 'animate-waddle-bob'
              )}
            />
          </div>
        )}

        <h3 className="mb-2 pr-9 text-base font-semibold tracking-tight text-balance">{t(step.title)}</h3>

        <p className="text-sm text-muted-foreground leading-relaxed">{t(body)}</p>

        {step.hint && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-primary font-medium">{t(step.hint)}</p>
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
                <div className="text-sm font-semibold">{t('套用模板')}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {t('工作、個人、學習三個工作區，分類已排好，任務你來填')}
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
                <div className="text-sm font-semibold">{t('空白開始')}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {t('一個空工作區，從零開始打造你自己的結構')}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Nav row (hidden on final step).
         *
         * Progress is a counter plus a thin track, not one dot per step: 20+
         * dots used to squeeze 上一步／下一步 until their labels wrapped one
         * character per line and 下一步 poked out of the card. The track is
         * the only flexible item in the row — it can shrink to nothing; the
         * counter and the buttons never shrink or wrap.
         */}
        {!isLast && (
          <div className="mt-5 flex items-center gap-3">
            <div
              data-tour-progress
              role="progressbar"
              aria-label={t('導覽進度')}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={stepIndex + 1}
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{stepIndex + 1}</span>
                {' / '}
                {STEPS.length}
              </span>
              <span aria-hidden="true" className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
                <span
                  className="block h-full w-full rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: `translateX(${(progress - 1) * 100}%)` }}
                />
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {!isFirst && (
                <button
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors md:h-9 md:text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  {t('上一步')}
                </button>
              )}
              <button
                onClick={() => advance()}
                className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors md:h-9 md:text-xs"
              >
                {t('下一步')}
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Skip link — a small pill inside a 44px-tall tap target that hangs
            just below the card (SKIP_LINK_MARGIN reserves the room). */}
        {!isLast && (
          <button
            onClick={onComplete}
            className="group absolute left-1/2 top-full mt-px flex h-11 -translate-x-1/2 items-center whitespace-nowrap"
          >
            <span className="rounded-full bg-foreground/80 px-3 py-1 text-xs text-background backdrop-blur-sm transition-colors group-hover:bg-foreground md:text-[11px]">
              {t('略過導覽')}
            </span>
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
