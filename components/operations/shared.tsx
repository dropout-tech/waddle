'use client'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from 'react'
import styles from './operations.module.css'
import { useI18n } from '@/lib/i18n/react'
export { styles }
export function Shell({
  title,
  intro,
  children,
  aside,
}: {
  title: string
  intro: string
  children: ReactNode
  aside?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={17} /> {t('回工作空間')}
        </Link>
        <div className={styles.heading}>
          <div>
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          {aside}
        </div>
      </header>
      {children}
    </main>
  )
}
export function Feedback({
  error,
  message,
}: {
  error?: string
  message?: string
}) {
  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.message}>
          {message}
        </p>
      )}
    </>
  )
}
export function Loading() {
  const { t } = useI18n()
  return (
    <p className={styles.loading} role="status">
      <Loader2 size={18} className="animate-spin" /> {t('正在讀取資料…')}
    </p>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-describedby': hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>
}
export function Pager({
  offset,
  count,
  onChange,
}: {
  offset: number
  count: number
  onChange: (v: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className={styles.actions}>
      <button
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - 50))}
      >
        {t('上一頁')}
      </button>
      <span>{t('第 {page} 頁', { page: Math.floor(offset / 50) + 1 })}</span>
      <button disabled={count < 50} onClick={() => onChange(offset + 50)}>
        {t('下一頁')}
      </button>
    </div>
  )
}
