'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import {
  WATER_REMINDER_INTERVALS,
  getWaterReminderInterval,
  setWaterReminderInterval,
  type WaterReminderInterval,
} from '@/lib/water-reminder'

/**
 * The in-place 喝水提醒 controls (on/off + interval) — kept from the old popup so people can
 * turn it off right where it bothers them. Used by the penguin's card (⋯) and the drop (right
 * click / long press). Changing the interval only persists it: the reminder on screen is already
 * due, and every way of answering it re-arms the schedule from the stored interval.
 */
export function WaterSettingsPanel({ onDisable, className }: { onDisable: () => void; className?: string }) {
  const { t } = useI18n()
  const [interval, setIntervalState] = useState<WaterReminderInterval>(() => getWaterReminderInterval())

  const disable = () => {
    onDisable()
    toast(t('已關閉喝水提醒'), { description: t('想恢復時：右上角「設定」→ 一般 → 喝水提醒') })
  }

  return (
    <div className={cn('space-y-2.5 rounded-xl border border-border/70 bg-secondary/30 px-3.5 py-3 text-left', className)} data-water-settings>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex-1">
          <span className="block text-sm text-foreground">{t('喝水提醒')}</span>
          <span className="block text-xs text-muted-foreground">{t('關掉後不再跳出，設定 → 一般 可重新開啟')}</span>
        </span>
        <input type="checkbox" checked onChange={disable} className="h-4 w-4 rounded border-border accent-primary" />
      </label>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">{t('提醒間隔')}</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('提醒間隔')}>
          {WATER_REMINDER_INTERVALS.map((mins) => (
            <button
              key={mins}
              type="button"
              aria-pressed={interval === mins}
              onClick={() => {
                setIntervalState(mins)
                setWaterReminderInterval(mins)
              }}
              className={cn(
                'min-h-9 rounded-lg px-3 text-xs font-medium transition-colors max-md:min-h-11',
                interval === mins
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {t('{mins} 分鐘', { mins })}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
