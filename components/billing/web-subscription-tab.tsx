'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { cn } from '@/lib/utils'
import {
  callWebBilling,
  cardLabel,
  formatDate,
  formatDeadline,
  formatMoney,
  isLive,
  SLP_CONFIGURED,
  toWebBillingError,
  webBillingErrorMessage,
  type WebBillingSnapshot,
  type WebPaymentInfo,
} from '@/lib/billing/web-billing-client'
import { BillingButton, ConfirmPanel, Notice, Spinner, btnOutline, btnPrimary } from './billing-ui'
import { useWebBilling } from './use-web-billing'

type Confirming = 'cancel' | 'refund' | null

/**
 * Settings → 訂閱. Only mounted when the web-billing flag is on and the app is
 * not a native shell (see settings-modal.tsx). Anything that needs a card form
 * is a link to /billing/* so the SLP SDK (and its wider CSP) stays off the main app.
 */
export default function WebSubscriptionTab() {
  // No SHOPLINE keys yet: nobody can have a subscription, so do not call the
  // (not yet deployed) billing backend at all; just offer the purchase page.
  if (!SLP_CONFIGURED) return <SubscriptionPreview />
  return <WebSubscriptionLive />
}

function SubscriptionPreview() {
  const { t } = useI18n()
  return (
    <div className="space-y-4" data-testid="sub-none">
      <SectionTitle>{t('訂閱')}</SectionTitle>
      <p className="text-sm text-muted-foreground">{t('你目前使用免費版。開始 Pro 可以先免費試用，試用期內取消不會扣款。')}</p>
      <Link href="/billing" data-testid="sub-start" className={cn(btnPrimary, 'w-full sm:w-auto')}>{t('開始免費試用')}</Link>
    </div>
  )
}

function WebSubscriptionLive() {
  const { lang, t } = useI18n()
  const { snapshot, error, loading, reload, set } = useWebBilling()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  if (loading) return <Spinner label={t('讀取訂閱資料中…')} />
  if (error || !snapshot) {
    return (
      <div className="space-y-3" data-testid="sub-load-error">
        <Notice tone="error">{webBillingErrorMessage(error?.code ?? 'unavailable', t)}</Notice>
        <BillingButton variant="outline" onClick={() => void reload()}>{t('重新讀取')}</BillingButton>
      </div>
    )
  }

  const sub = snapshot.subscription
  const live = isLive(sub)
  const date = (iso: string) => formatDate(iso, lang)

  async function run(action: 'cancel' | 'resume' | 'refund', paymentId?: string) {
    setBusy(true)
    setActionError(null)
    setDone(null)
    try {
      if (action === 'refund' && paymentId) {
        const res = await callWebBilling<{ refund_status: 'processing' | 'needs_review'; billing: WebBillingSnapshot }>({ action: 'refund', payment_id: paymentId })
        set(res.billing)
        setDone(
          res.refund_status === 'needs_review'
            ? t('已收到你的退款申請。我們會盡快處理，並在 15 天內退回原本付款的信用卡。')
            : t('退款申請已送出，銀行處理後會退回原本付款的信用卡。完成後會寄信通知你。'),
        )
      } else if (action === 'cancel' || action === 'resume') {
        const res = await callWebBilling<{ billing: WebBillingSnapshot }>({ action })
        set(res.billing)
        setDone(action === 'cancel' ? t('已取消續訂，之後不會再扣款。') : t('已恢復續訂。'))
      }
      setConfirming(null)
    } catch (e) {
      setActionError(webBillingErrorMessage(toWebBillingError(e).code, t))
    } finally {
      setBusy(false)
    }
  }

  // ── Apple subscriber (design D2-A): manage on the iPhone, nothing to buy here ──
  const appleNote = snapshot.apple_active ? (
    <Notice testId="sub-apple">
      {t('你的 Pro 是透過 Apple 訂閱的，請在 iPhone 的「設定」→「Apple 帳號」→「訂閱項目」管理或取消。')}
    </Notice>
  ) : null

  if (!sub || !live) {
    return (
      <div className="space-y-4" data-testid="sub-none">
        <SectionTitle>{t('訂閱')}</SectionTitle>
        {appleNote}
        {!snapshot.apple_active && (
          <>
            {sub && (sub.status === 'expired' || sub.status === 'refunded') && (
              <Notice testId="sub-ended">
                {sub.status === 'refunded'
                  ? t('上一次的訂閱已退款並結束，目前使用基本版。你的資料都還在。')
                  : t('上一次的訂閱已經結束，目前使用基本版。你的資料都還在。')}
              </Notice>
            )}
            {snapshot.checkout_available ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {snapshot.trial_eligible ? t('開始 Pro 可以先免費試用，試用期內取消不會扣款。') : t('訂閱 Pro，解除用量上限。')}
                </p>
                <Link href="/billing" data-testid="sub-start" className={cn(btnPrimary, 'w-full sm:w-auto')}>
                  {snapshot.trial_eligible ? t('開始免費試用') : t('訂閱 Pro')}
                </Link>
              </div>
            ) : (
              <Notice testId="sub-unavailable">{webBillingErrorMessage('disabled', t)}</Notice>
            )}
          </>
        )}
        <PaymentList payments={snapshot.payments} lang={lang} />
      </div>
    )
  }

  // ── Live subscription ──
  const unit = sub.plan === 'annual' ? t('每年') : t('每個月')
  const planName = sub.plan === 'annual' ? t('Pro 年繳') : t('Pro 月繳')
  const endIso = sub.status === 'trialing' ? sub.trial_end : sub.current_period_end
  const card = cardLabel(snapshot.card)
  const refundable = snapshot.payments.find((p) => p.refundable_until && new Date(p.refundable_until).getTime() > now)
  const refundOpen = snapshot.open_refund

  const badge =
    sub.cancel_at_period_end && endIso
      ? { text: t('已取消，{date} 結束', { date: date(endIso) }), tone: 'muted' as const }
      : sub.status === 'trialing'
        ? { text: t('試用中'), tone: 'ok' as const }
        : sub.status === 'past_due'
          ? { text: t('付款失敗'), tone: 'warn' as const }
          : { text: t('使用中'), tone: 'ok' as const }

  return (
    <div className="space-y-4" data-testid="sub-live" data-sub-status={sub.status}>
      <SectionTitle>{t('訂閱')}</SectionTitle>
      {appleNote}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold" data-testid="sub-plan">{planName}</p>
          <span
            data-testid="sub-badge"
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              badge.tone === 'ok' && 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300',
              badge.tone === 'warn' && 'bg-amber-500/25 text-amber-900 dark:text-amber-200',
              badge.tone === 'muted' && 'bg-muted text-muted-foreground',
            )}
          >
            {badge.text}
          </span>
        </div>

        <dl className="space-y-2 text-sm">
          {!sub.cancel_at_period_end && sub.status !== 'past_due' && endIso && (
            <Row label={t('下次扣款')} testId="sub-next">
              {t('{date}・{amount}', { date: date(endIso), amount: formatMoney(sub.price_minor) })}
              <span className="text-muted-foreground">{t('（{unit}自動續訂）', { unit })}</span>
            </Row>
          )}
          {sub.cancel_at_period_end && endIso && (
            <Row label={t('Pro 可使用到')} testId="sub-until">{date(endIso)}</Row>
          )}
          {card && <Row label={t('付款卡片')} testId="sub-card">{card}</Row>}
        </dl>

        {sub.status === 'past_due' && (
          <Notice tone="warn" testId="sub-pastdue">
            {sub.grace_until && (
              <strong className="mb-1 block" data-testid="sub-grace">
                {t('請在 {date} 前補付，逾期 Pro 會停用。', { date: date(sub.grace_until) })}
              </strong>
            )}
            {sub.needs_customer_action
              ? t('你的銀行需要你本人確認這筆付款。請按「立即付款」完成，這段期間 Pro 照常可以使用。')
              : t('這一期的扣款沒有成功。請按「立即付款」，或更換信用卡；這段期間 Pro 照常可以使用。')}
          </Notice>
        )}
        {sub.status === 'trialing' && !sub.cancel_at_period_end && endIso && (
          <Notice tone="ok" testId="sub-trial-note">
            <strong>{t('免費試用中，{date} 前取消不會扣款。', { date: date(endIso) })}</strong>
          </Notice>
        )}
        {sub.cancel_at_period_end && !refundOpen && (
          <p className="text-sm text-muted-foreground">{t('已取消續訂，之後不會再扣款。想繼續使用的話可以恢復續訂。')}</p>
        )}
        {refundOpen && (
          <Notice testId="sub-refund-open">
            {t('退款申請處理中，預計 {date} 前退回原本付款的信用卡。', { date: date(refundOpen.due_by) })}
          </Notice>
        )}
      </div>

      {done && <Notice tone="ok" testId="sub-done">{done}</Notice>}
      {actionError && <Notice tone="error" testId="sub-action-error">{actionError}</Notice>}

      {confirming === 'cancel' && (
        <ConfirmPanel
          testId="confirm-cancel"
          title={t('要取消續訂嗎？')}
          body={
            sub.status === 'trialing'
              ? t('取消後，試用結束時不會扣款。Pro 可以用到 {date}，之後回到免費版，你的資料不會被刪除。', { date: endIso ? date(endIso) : '' })
              : sub.status === 'past_due'
                ? t('取消後不會再扣款。Pro 可以用到 {date}，之後回到免費版，你的資料不會被刪除。', { date: sub.grace_until ? date(sub.grace_until) : '' })
                : t('取消後不會再扣款。Pro 可以用到已付費的 {date}，之後回到免費版，你的資料不會被刪除。', { date: endIso ? date(endIso) : '' })
          }
          confirmLabel={t('確認取消續訂')}
          busy={busy}
          danger
          onConfirm={() => void run('cancel')}
          onBack={() => setConfirming(null)}
        />
      )}
      {confirming === 'refund' && refundable && (
        <ConfirmPanel
          testId="confirm-refund"
          title={t('要申請全額退款 {amount} 嗎？', { amount: formatMoney(refundable.amount_minor) })}
          emphasis={t('退款完成後，Pro 會立刻停止，回到免費版。')}
          body={t('申請後訂閱會停止續訂（你的資料不會被刪除）。款項會退回原本付款的信用卡，我們在收到申請隔天起 15 天內完成。')}
          confirmLabel={t('確認申請退款')}
          busy={busy}
          strong
          onConfirm={() => void run('refund', refundable.id)}
          onBack={() => setConfirming(null)}
        />
      )}

      {confirming === null && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {sub.status === 'past_due' && (
            <Link href="/billing/pay" data-testid="sub-paynow" className={btnPrimary}>{t('立即付款')}</Link>
          )}
          <Link href="/billing/card" data-testid="sub-changecard" className={btnOutline}>{t('更換信用卡')}</Link>
          {!sub.cancel_at_period_end && (
            <BillingButton variant="danger" data-testid="sub-cancel" onClick={() => { setDone(null); setActionError(null); setConfirming('cancel') }}>
              {t('取消續訂')}
            </BillingButton>
          )}
          {sub.cancel_at_period_end && !refundOpen && (
            <BillingButton variant="primary" data-testid="sub-resume" busy={busy} onClick={() => void run('resume')}>
              {t('恢復續訂')}
            </BillingButton>
          )}
        </div>
      )}

      {refundable && !refundOpen && confirming === null && (
        <div className="space-y-2 rounded-xl border border-border p-4" data-testid="sub-refund-box">
          <p className="text-sm">
            {t('這筆 {amount} 的款項在 {deadline} 前，可以申請全額退款。', {
              amount: formatMoney(refundable.amount_minor),
              deadline: formatDeadline(refundable.refundable_until as string, lang),
            })}
          </p>
          <BillingButton variant="outline" data-testid="sub-refund" onClick={() => { setDone(null); setActionError(null); setConfirming('refund') }}>
            {t('申請退款')}
          </BillingButton>
        </div>
      )}

      <PaymentList payments={snapshot.payments} lang={lang} />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-foreground">{children}</h3>
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function PaymentList({ payments, lang }: { payments: WebPaymentInfo[]; lang: 'zh-TW' | 'en' }) {
  const { t } = useI18n()
  if (payments.length === 0) return null
  const statusText = (p: WebPaymentInfo) => {
    if (p.status === 'succeeded') {
      if (p.refunded_minor >= p.amount_minor) return t('已全額退款')
      if (p.refunded_minor > 0) return t('已退款 {amount}', { amount: formatMoney(p.refunded_minor) })
      return t('已付款')
    }
    if (p.status === 'failed') return t('未成功')
    return t('處理中')
  }
  return (
    <div className="space-y-2" data-testid="sub-payments">
      <SectionTitle>{t('扣款紀錄')}</SectionTitle>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid="sub-payment-row">
            <span className="text-muted-foreground">{formatDate(p.date, lang)}</span>
            <span className="font-medium">{formatMoney(p.amount_minor)}</span>
            <span className={cn('text-right', p.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{statusText(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
