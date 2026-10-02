'use client'

import { useI18n } from '@/lib/i18n/react'
import { PenguinArt } from './penguin-art'
import styles from './brain-dump.module.css'

/** The "done" toast for 丟給企鵝 only (rendered via sonner's toast.custom,
 *  so the app-wide toast look is unchanged): happy penguin + terracotta. */
export function BrainDumpToast({ scheduled, pending, failed }: { scheduled: number; pending: number; failed: number }) {
  const { t } = useI18n()
  const main = scheduled && pending
    ? t('企鵝排好了 {n} 件，{m} 件放進待排', { n: scheduled, m: pending })
    : scheduled
      ? t('企鵝排好了 {n} 件事', { n: scheduled })
      : t('企鵝把 {m} 件放進待排', { m: pending })
  return (
    <div
      role="status"
      data-bd-toast
      className={`${styles.root} ${styles.toast} flex w-[min(356px,calc(100vw-32px))] items-center gap-3 rounded-2xl border px-3 py-2.5`}
    >
      <div className="h-12 w-12 flex-shrink-0">
        <PenguinArt pose="happy" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">{main}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {failed > 0 ? t('還有 {n} 件沒放成功，可以再試一次。', { n: failed }) : t('已經在行事曆上了。')}
        </p>
      </div>
    </div>
  )
}
