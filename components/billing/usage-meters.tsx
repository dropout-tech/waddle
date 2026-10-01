'use client'

import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'
import { formatBytes, type MeterKey, type UsageMeter } from '@/lib/billing/plan-usage-core'

const LABELS: Record<MeterKey, string> = {
  tasks: '進行中任務',
  notes: '記事本筆記',
  images: '圖片空間',
  meetings: '本月 AI 會議整理',
}

/**
 * Usage bars for the membership page. Rendered only when the server says
 * limits are on (the caller passes an empty list otherwise). >= 80% switches
 * to the amber warning tone; nothing here ever hides or deletes data.
 */
export function UsageMeters({ meters }: { meters: UsageMeter[] }) {
  const { t } = useI18n()
  if (meters.length === 0) return null
  const fmt = (m: UsageMeter, v: number) => (m.key === 'images' ? formatBytes(v) : String(v))
  return (
    <ul className="mt-4 space-y-4" data-testid="plan-usage-meters">
      {meters.map((m) => (
        <li key={m.key} data-level={m.level}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{t(LABELS[m.key])}</span>
            <span className={cn('tabular-nums', m.level !== 'ok' ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {m.limit === null
                ? t('{used}・無上限', { used: fmt(m, m.used) })
                : t('{used} / {limit}', { used: fmt(m, m.used), limit: fmt(m, m.limit) })}
            </span>
          </div>
          {m.limit !== null && (
            <div
              role="progressbar"
              aria-label={t(LABELS[m.key])}
              aria-valuemin={0}
              aria-valuemax={m.limit}
              aria-valuenow={Math.min(m.used, m.limit)}
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn('h-full rounded-full', m.level === 'ok' ? 'bg-primary' : 'bg-amber-500')}
                style={{ width: `${Math.max(m.used > 0 ? 3 : 0, Math.round(m.ratio * 100))}%` }}
              />
            </div>
          )}
          {m.level === 'warn' && <p className="mt-1 text-xs text-muted-foreground">{t('快到上限了')}</p>}
          {m.level === 'full' && <p className="mt-1 text-xs text-muted-foreground">{t('已達上限，暫時無法再新增')}</p>}
        </li>
      ))}
    </ul>
  )
}
