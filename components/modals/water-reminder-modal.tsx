'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
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
 * approved Huddle mascot). No red, no warnings — Huddle just walked over
 * with a glass.
 *
 * The gear in the top-right opens an inline settings panel (on/off +
 * interval) so users can turn the reminder off right where it bothers
 * them, instead of hunting for it in the settings modal.
 *
 * The water glass stays a local overlay so every appearance uses the same
 * approved mascot artwork without adding one-off props to the shared mascot.
 */
export function WaterReminderModal({ isOpen, onDrink, onSnooze, onDisable }: WaterReminderModalProps) {
  const { t } = useI18n()
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
    toast(t('已關閉喝水提醒'), {
      description: t('想恢復時：右上角「設定」→ 一般 → 喝水提醒'),
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
      aria-label={t('提醒設定')}
      aria-expanded={showSettings}
      title={t('提醒設定')}
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
          <div className="text-sm text-foreground">{t('喝水提醒')}</div>
          <div className="text-xs text-muted-foreground">{t('關掉後不再跳出，設定 → 一般 可重新開啟')}</div>
        </div>
        <input
          type="checkbox"
          checked
          onChange={handleDisable}
          className="w-4 h-4 rounded border-border accent-primary"
        />
      </label>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{t('提醒間隔')}</div>
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
              {t('{mins} 分鐘', { mins })}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const mascotAndCopy = (
    <div className="px-6 pt-7 pb-2 flex flex-col items-center text-center">
      <HuddleWithWater className="w-32 h-32" />

      <h2
        id="water-reminder-title"
        className="mt-3 text-[1.35rem] font-semibold text-foreground tracking-wide"
        style={{ fontFamily: "'Caveat', 'Patrick Hand', 'Noto Sans TC', cursive" }}
      >
        {t('該喝水囉～')}
      </h2>

      <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[18rem]">
        {t('搖搖擺擺地工作了一陣子，')}<br />
        {t('記得補一口水，再慢慢繼續。')}
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
            <Vaul.Title className="sr-only">{t('該喝水囉')}</Vaul.Title>
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
                {t('好，去喝水')}
              </Button>
              <Button
                variant="secondary"
                onClick={onSnooze}
                className="w-full h-12 rounded-xl text-base"
              >
                {t('再過一下')}
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
            {t('再過一下')}
          </Button>
          <Button
            onClick={onDrink}
            className="flex-1 h-10 rounded-xl gap-1.5"
          >
            <span aria-hidden>💧</span>
            {t('好，去喝水')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The approved Huddle artwork with a small water-glass overlay. The mascot
 * itself remains untouched, so the reminder cannot drift into a different
 * character design.
 */
function HuddleWithWater({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <div
      role="img"
      aria-label={t('Huddle 拿著水杯')}
      className={cn('relative aspect-square', className)}
    >
      <span aria-hidden className="absolute inset-[6%] rounded-full bg-[#f4d977]/55" />
      <Image
        src="/huddle-mascot.png"
        alt=""
        width={512}
        height={512}
        loading="eager"
        aria-hidden="true"
        draggable={false}
        className="absolute inset-[7%] h-[86%] w-[86%] object-contain"
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 48 58"
        className="absolute bottom-[4%] right-[-1%] h-[45%] w-[38%] drop-shadow-sm"
      >
        <path
          d="M8 18 L35 18 L32 49 C32 54 29 56 21.5 56 C14 56 11 54 11 49 Z"
          fill="#f5ead0"
          stroke="#1f1a14"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M10 29 L33 29 L31.3 48.5 C31.3 52 28.8 53.5 21.5 53.5 C14.2 53.5 11.7 52 11.7 48.5 Z"
          fill="#9bc7d8"
          opacity="0.9"
        />
        <ellipse cx="21.5" cy="29" rx="11.5" ry="1.8" fill="#fff" opacity="0.65" />
        <circle cx="38" cy="11" r="3" fill="#9bc7d8" opacity="0.85" />
        <circle cx="43" cy="3.5" r="2" fill="#9bc7d8" opacity="0.65" />
      </svg>
    </div>
  )
}
