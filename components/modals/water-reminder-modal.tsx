'use client'

import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer as Vaul } from 'vaul'
import {
  WATER_REMINDER_INTERVALS,
  DEFAULT_WATER_INTERVAL,
  getWaterReminderInterval,
  setWaterReminderInterval,
  type WaterReminderInterval,
} from '@/lib/water-reminder'

interface WaterReminderModalProps {
  isOpen: boolean
  /** User confirmed they drank → reset full interval. */
  onDrink: () => void
  /** User wants a short snooze → re-prompt in a few minutes. */
  onSnooze: () => void
  /** Gear panel's toggle: turn the whole reminder feature off. */
  onDisable: () => void
}

/**
 * Gentle full-screen popup that nudges the user to drink water. Reuses
 * the Huddle visual language (charcoal + cream, soft rounded card,
 * hand-drawn penguin). No red, no warnings — Huddle just walked over
 * with a glass.
 *
 * The gear in the top-right opens an inline settings panel (on/off +
 * interval) so users can turn the reminder off right where it bothers
 * them, instead of hunting for it in the settings modal.
 *
 * The mascot here is an inline variant of WaddleMascot that includes a
 * water glass in one flipper; keeping it local avoids cluttering the
 * shared mascot component with one-off props.
 */
export function WaterReminderModal({ isOpen, onDrink, onSnooze, onDisable }: WaterReminderModalProps) {
  const [mounted, setMounted] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [interval, setIntervalState] = useState<WaterReminderInterval>(DEFAULT_WATER_INTERVAL)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isOpen) {
      const t = window.setTimeout(() => setMounted(true), 10)
      return () => window.clearTimeout(t)
    }
    setMounted(false)
  }, [isOpen])

  // Fresh prefs + collapsed gear panel every time the popup appears.
  useEffect(() => {
    if (!isOpen) return
    setIntervalState(getWaterReminderInterval())
    setShowSettings(false)
  }, [isOpen])

  if (!isOpen && !isMobile) return null

  const handleDisable = () => {
    onDisable()
    toast('已關閉喝水提醒', {
      description: '想恢復時：右上角「設定」→ 一般 → 喝水提醒',
    })
  }

  const handleIntervalChange = (mins: WaterReminderInterval) => {
    setIntervalState(mins)
    // Persist only — the popup is already due, and every way of closing it
    // (喝水/再過一下/滑掉) re-arms the schedule from the stored interval.
    setWaterReminderInterval(mins)
  }

  const gearButton = (
    <button
      type="button"
      onClick={() => setShowSettings((v) => !v)}
      aria-label="提醒設定"
      aria-expanded={showSettings}
      title="提醒設定"
      className={cn(
        'absolute z-10 grid place-items-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-secondary/70 transition-colors',
        isMobile ? 'top-2.5 right-2.5 h-11 w-11' : 'top-3 right-3 h-9 w-9',
      )}
    >
      <Settings className="w-[18px] h-[18px]" />
    </button>
  )

  const settingsPanel = showSettings && (
    <div className="mx-5 mb-1 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3 space-y-2.5 text-left">
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1 pr-4">
          <div className="text-sm text-foreground">喝水提醒</div>
          <div className="text-xs text-muted-foreground">關掉後不再跳出，設定 → 一般 可重新開啟</div>
        </div>
        <input
          type="checkbox"
          checked
          onChange={handleDisable}
          className="w-4 h-4 rounded border-border accent-primary"
        />
      </label>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">提醒間隔</div>
        <div className="flex flex-wrap gap-1.5">
          {WATER_REMINDER_INTERVALS.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => handleIntervalChange(mins)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                interval === mins
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {mins} 分鐘
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const mascotAndCopy = (
    <div className="px-6 pt-7 pb-2 flex flex-col items-center text-center">
      <WaddleWithWater className="w-32 h-32" />

      <h2
        id="water-reminder-title"
        className="mt-3 text-[1.35rem] font-semibold text-foreground tracking-wide"
        style={{ fontFamily: "'Caveat', 'Patrick Hand', 'Noto Sans TC', cursive" }}
      >
        該喝水囉～
      </h2>

      <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[18rem]">
        搖搖擺擺地工作了一陣子，<br />
        記得補一口水，再慢慢繼續。
      </p>
    </div>
  )

  if (isMobile) {
    return (
      <Vaul.Root open={isOpen} onOpenChange={(o) => { if (!o) onSnooze() }}>
        <Vaul.Portal>
          <Vaul.Overlay className="fixed inset-0 z-popover bg-black/45 backdrop-blur-sm" />
          <Vaul.Content
            className="fixed inset-x-0 bottom-0 z-popover flex flex-col rounded-t-2xl bg-card outline-none overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <Vaul.Title className="sr-only">該喝水囉</Vaul.Title>
            {/* Drag handle */}
            <div className="mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
            {gearButton}

            {mascotAndCopy}
            {settingsPanel}

            <div className="flex flex-col gap-2 px-5 pt-4 pb-4">
              <Button
                onClick={onDrink}
                className="w-full h-12 rounded-xl gap-1.5 text-base"
              >
                <span aria-hidden>💧</span>
                好，去喝水
              </Button>
              <Button
                variant="secondary"
                onClick={onSnooze}
                className="w-full h-12 rounded-xl text-base"
              >
                再過一下
              </Button>
            </div>
          </Vaul.Content>
        </Vaul.Portal>
      </Vaul.Root>
    )
  }

  return (
    <div
      className="fixed inset-0 z-popover flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="water-reminder-title"
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300',
          mounted ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onSnooze}
      />

      <div
        className={cn(
          'relative w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden',
          'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.97]',
        )}
      >
        {gearButton}
        {mascotAndCopy}
        {settingsPanel}

        <div className="px-5 pb-5 pt-4 flex gap-2">
          <Button
            variant="secondary"
            onClick={onSnooze}
            className="flex-1 h-10 rounded-xl"
          >
            再過一下
          </Button>
          <Button
            onClick={onDrink}
            className="flex-1 h-10 rounded-xl gap-1.5"
          >
            <span aria-hidden>💧</span>
            好，去喝水
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Huddle 的企鵝 holding a cream-colored glass of water. Built on the same vector
 * grammar as [components/branding/waddle-mascot.tsx] but with a small
 * flipper-arm + glass overlay. Kept local because nothing else in the app
 * needs this variant.
 */
function WaddleWithWater({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Huddle 拿著水杯"
      className={className}
    >
      {/* Soft yellow halo so the penguin reads as a focal token */}
      <circle cx="60" cy="62" r="50" fill="#f4d977" opacity="0.55" />

      {/* Body */}
      <path
        d="M40 26
           C38.5 19 34.5 17 32 19
           C30 21 30.5 24.5 35 29
           C29 34 25 43 25 58
           C25 81 38 98 60 98
           C82 98 95 81 95 58
           C95 43 91 34 85 29
           C89.5 24.5 90 21 88 19
           C85.5 17 81.5 19 80 26
           C74 23 67 22 60 22
           C53 22 46 23 40 26Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Belly */}
      <path
        d="M47 58
           C47 55 51 54 60 54
           C69 54 73 55 73 58
           C76 70 75 86 70 94
           C66 97 62 98 60 98
           C58 98 54 97 50 94
           C45 86 44 70 47 58Z"
        fill="#f5ead0"
        stroke="#1f1a14"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Eyes */}
      <circle cx="48" cy="52" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="72" cy="52" r="8.5" fill="#f5ead0" stroke="#1f1a14" strokeWidth="2" />
      <circle cx="49" cy="53" r="3.5" fill="#1a1612" />
      <circle cx="73" cy="53" r="3.5" fill="#1a1612" />
      {/* tiny shine */}
      <circle cx="50.5" cy="51" r="1" fill="#fff" />
      <circle cx="74.5" cy="51" r="1" fill="#fff" />

      {/* Beak */}
      <ellipse cx="60" cy="61" rx="2.4" ry="2.8" fill="#1f1a14" />

      {/* Little blush */}
      <ellipse cx="40" cy="64" rx="3.5" ry="2" fill="#e89a9a" opacity="0.55" />
      <ellipse cx="80" cy="64" rx="3.5" ry="2" fill="#e89a9a" opacity="0.55" />

      {/* Right flipper reaching toward the glass */}
      <path
        d="M82 68
           C90 70 96 76 96 82
           C96 87 92 90 88 89
           C83 88 80 84 79 78Z"
        fill="#3a342e"
        stroke="#1f1a14"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Water glass — cream tinted with charcoal outline */}
      <g>
        <path
          d="M86 70
             L102 70
             L100 96
             C100 99 98 100 94 100
             C90 100 88 99 88 96 Z"
          fill="#f5ead0"
          stroke="#1f1a14"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Water inside */}
        <path
          d="M87.6 78
             L100.4 78
             L99.2 95.6
             C99.2 97.6 97.5 98.4 94 98.4
             C90.5 98.4 88.8 97.6 88.8 95.6 Z"
          fill="#9bc7d8"
          opacity="0.85"
        />
        {/* Surface highlight */}
        <ellipse cx="94" cy="78" rx="6.4" ry="1.2" fill="#fff" opacity="0.6" />
      </g>

      {/* Bubbles floating up */}
      <circle cx="106" cy="58" r="2" fill="#9bc7d8" opacity="0.85" />
      <circle cx="111" cy="50" r="1.4" fill="#9bc7d8" opacity="0.7" />
      <circle cx="108" cy="44" r="1" fill="#9bc7d8" opacity="0.55" />

      {/* Feet */}
      <ellipse cx="52" cy="99" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
      <ellipse cx="68" cy="99" rx="5" ry="2.6" fill="#3a342e" stroke="#1f1a14" strokeWidth="1.6" />
    </svg>
  )
}
