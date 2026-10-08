'use client'

import { useI18n } from '@/lib/i18n/react'
import { PenguinArt } from './penguin-art'
import styles from './brain-dump.module.css'

/** The "done" toast for 丟給企鵝 only (rendered via sonner's toast.custom,
 *  so the app-wide toast look is unchanged): happy penguin + terracotta. */
export function BrainDumpToast({ created, failed, inboxName }: { created: number; failed: number; inboxName: string }) {
  const { t } = useI18n()
  const main = t('企鵝把 {n} 件放進「{name}」', { n: created, name: t(inboxName || '未分類') })
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
          {failed > 0 ? t('還有 {n} 件沒放成功，可以再試一次。', { n: failed }) : t('到任務清單就看得到。')}
        </p>
      </div>
    </div>
  )
}
