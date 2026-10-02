'use client'

import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

/** Shared look for the website-subscription UI: paper surface, 44px touch targets. */

const btnBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const btnPrimary = cn(btnBase, 'bg-primary text-primary-foreground hover:bg-primary/90')
export const btnSecondary = cn(btnBase, 'bg-secondary text-secondary-foreground hover:bg-secondary/80')
export const btnOutline = cn(btnBase, 'border border-border bg-background text-foreground hover:bg-accent')
export const btnDanger = cn(btnBase, 'border border-destructive/40 bg-background text-destructive hover:bg-destructive/10')
export const btnDestructive = cn(btnBase, 'bg-destructive text-white hover:bg-destructive/90')

export function BillingButton({
  variant = 'secondary',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'destructive'; busy?: boolean }) {
  const cls = { primary: btnPrimary, secondary: btnSecondary, outline: btnOutline, danger: btnDanger, destructive: btnDestructive }[variant]
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cn(cls, className)}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Notice({
  tone = 'info',
  children,
  testId,
}: {
  tone?: 'info' | 'warn' | 'error' | 'ok'
  children: ReactNode
  testId?: string
}) {
  const toneCls = {
    info: 'bg-muted/60 text-foreground',
    ok: 'bg-emerald-600/10 text-foreground',
    warn: 'border border-amber-500/40 bg-amber-500/10 text-foreground',
    error: 'border border-destructive/40 bg-destructive/10 text-foreground',
  }[tone]
  return (
    <div
      data-testid={testId}
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('rounded-xl px-4 py-3 text-sm leading-6', toneCls)}
    >
      {children}
    </div>
  )
}

/** Inline two-step confirmation (cancel / refund). Not a modal: it lives inside the settings modal. */
export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onBack,
  testId,
  danger,
  strong,
  emphasis,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onBack: () => void
  testId: string
  danger?: boolean
  /** Solid destructive confirm button + stronger border (irreversible-feeling actions, e.g. refund). */
  strong?: boolean
  /** One bold line above the explanation. */
  emphasis?: string
}) {
  const { t } = useI18n()
  return (
    <div data-testid={testId} role="alertdialog" aria-label={title} className={cn('space-y-3 rounded-xl border bg-card p-4', strong ? 'border-destructive/60 ring-1 ring-destructive/20' : 'border-border')}>
      <p className="text-sm font-semibold">{title}</p>
      {emphasis && <p className="text-sm font-bold text-destructive" data-testid={`${testId}-emphasis`}>{emphasis}</p>}
      <div className="text-sm leading-6 text-muted-foreground">{body}</div>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <BillingButton variant={strong ? 'destructive' : danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm} data-testid={`${testId}-confirm`}>
          {confirmLabel}
        </BillingButton>
        <BillingButton variant="secondary" disabled={busy} onClick={onBack} data-testid={`${testId}-back`}>
          {t('先不要')}
        </BillingButton>
      </div>
    </div>
  )
}

/** Full-page frame for /billing/*: safe-area aware, one column, back link home. */
export function BillingFrame({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),2.5rem)] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {t('回到 Huddle')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-6 text-muted-foreground">{intro}</p>}
        <div className="mt-6 space-y-5">{children}</div>
      </div>
    </main>
  )
}

/** Error shown next to a submit button; scrolls itself into view so it is never missed on a phone. */
export function SubmitError({ children, testId }: { children: ReactNode; testId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [children])
  return (
    <div ref={ref} className="scroll-mt-4">
      <Notice tone="error" testId={testId}>{children}</Notice>
    </div>
  )
}

/** Stacked full-width actions on a phone, side by side from `sm`. */
export function ButtonStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">{children}</div>
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
