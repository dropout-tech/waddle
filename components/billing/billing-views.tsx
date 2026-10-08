'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import {
  addDays,
  callWebBilling,
  cardLabel,
  createPaySession,
  fetchWebBilling,
  formatDate,
  formatMoney,
  isLive,
  runNextAction,
  SLP_CONFIGURED,
  toWebBillingError,
  webBillingAvailable,
  webBillingErrorMessage,
  type SlpPayment,
  type WebBillingSnapshot,
  type WebPlan,
} from '@/lib/billing/web-billing-client'
import { BillingButton, BillingFrame, ButtonStack, Notice, Spinner, SubmitError, btnOutline, btnPrimary } from './billing-ui'
import { SlpPaymentForm } from './slp-payment-form'
import { useWebBilling } from './use-web-billing'

export type BillingView = 'purchase' | 'return' | 'card' | 'pay'

/** Everything under /billing/* once the flag is on. Loaded only by billing-route.tsx. */
export default function BillingViews({ view }: { view: BillingView }) {
  const { t } = useI18n()
  const { session, loading } = useAuth()

  if (!webBillingAvailable()) return null
  // No SHOPLINE keys yet: show the whole purchase page (prices, terms, trial) to
  // everyone, signed in or not, with "payments coming soon" where the card form
  // goes. No network call is made.
  if (!SLP_CONFIGURED && view === 'purchase') return <PurchaseView preview />
  if (loading) {
    return (
      <BillingFrame title="Huddle Pro">
        <Spinner label={t('載入中...')} />
      </BillingFrame>
    )
  }
  if (!session) {
    return (
      <BillingFrame title="Huddle Pro">
        <Notice testId="billing-login">{t('請先登入 Huddle，再回到這個頁面。')}</Notice>
        <Link href="/login" className={btnPrimary}>{t('登入')}</Link>
      </BillingFrame>
    )
  }
  if (view === 'return') return <ReturnView />
  if (view === 'card') return <CardView />
  if (view === 'pay') return <PayView />
  return <PurchaseView preview={false} />
}

const SETTINGS_SUB = '/?settings=subscription'

// ── /billing ────────────────────────────────────────────────────────────────

/** Public offer shown while SHOPLINE is not configured (TWD minor units, 14-day trial). */
const PREVIEW_SNAPSHOT: WebBillingSnapshot = {
  checkout_available: true,
  trial_eligible: true,
  apple_active: false,
  prices: { monthly: 15000, annual: 99000, currency: 'TWD' },
  trial_days: 14,
  subscription: null,
  card: null,
  payments: [],
  open_refund: null,
}

function PurchaseView({ preview }: { preview: boolean }) {
  if (preview) return <PurchaseForm snapshot={PREVIEW_SNAPSHOT} reload={async () => {}} preview />
  return <PurchaseLoader />
}

function PurchaseLoader() {
  const { t } = useI18n()
  const { snapshot, error, loading, reload } = useWebBilling()
  const title = t('開始使用 Pro')

  if (loading) return <BillingFrame title={title}><Spinner label={t('讀取方案資料中…')} /></BillingFrame>
  if (error || !snapshot) {
    return (
      <BillingFrame title={title}>
        <Notice tone="error" testId="billing-error">{webBillingErrorMessage(error?.code ?? 'unavailable', t)}</Notice>
      </BillingFrame>
    )
  }
  if (!snapshot.checkout_available) {
    return <BillingFrame title={title}><Notice testId="billing-disabled">{webBillingErrorMessage('disabled', t)}</Notice></BillingFrame>
  }
  if (snapshot.apple_active) {
    return <BillingFrame title={title}><Notice testId="billing-apple">{webBillingErrorMessage('apple_active', t)}</Notice></BillingFrame>
  }
  if (isLive(snapshot.subscription)) {
    return (
      <BillingFrame title={title}>
        <Notice testId="billing-already">{webBillingErrorMessage('already_subscribed', t)}</Notice>
        <Link href={SETTINGS_SUB} className={`${btnOutline} w-full`}>{t('前往訂閱設定')}</Link>
      </BillingFrame>
    )
  }
  return <PurchaseForm snapshot={snapshot} reload={reload} preview={false} />
}

function PurchaseForm({ snapshot, reload, preview }: { snapshot: WebBillingSnapshot; reload: () => Promise<void>; preview: boolean }) {
  const { lang, t } = useI18n()
  const router = useRouter()
  const [plan, setPlan] = useState<WebPlan>('monthly')
  const [agreed, setAgreed] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const paymentRef = useRef<SlpPayment | null>(null)
  const title = t('開始使用 Pro')

  const price = snapshot.prices[plan]
  const trial = snapshot.trial_eligible && snapshot.trial_days > 0
  const firstCharge = trial ? formatDate(addDays(new Date(), snapshot.trial_days), lang) : null
  const unit = plan === 'annual' ? t('每年') : t('每個月')
  const termsHref = lang === 'en' ? '/en/terms' : '/terms'
  const refundsHref = lang === 'en' ? '/en/refunds' : '/refunds'

  async function submit() {
    const payment = paymentRef.current
    if (!payment || busy) return
    setBusy(true)
    setErr(null)
    try {
      const paySession = await createPaySession(payment)
      const res = await callWebBilling<{ subscription_id: string; next_action: unknown }>({ action: 'start', plan, paySession, locale: lang, expectTrial: trial })
      await runNextAction(payment, res.next_action)
      router.push('/billing/return?k=start')
    } catch (e) {
      const code = toWebBillingError(e).code
      setErr(webBillingErrorMessage(code, t))
      if (code === 'trial_used') {
        // The trial was used elsewhere since this page loaded. Nothing was charged.
        // Re-read the state so the member sees the paid offer, and make them agree again.
        setAgreed(false)
        void reload()
      }
      setBusy(false)
    }
  }

  return (
    <BillingFrame title={title} intro={t('選擇方案、確認付款內容，再輸入信用卡。')}>
      <fieldset className="space-y-2" data-testid="plan-picker">
        <legend className="sr-only">{t('選擇方案')}</legend>
        {(['monthly', 'annual'] as const).map((p) => (
          <label
            key={p}
            className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30"
          >
            <span className="flex items-center gap-3">
              <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} disabled={busy} className="h-5 w-5 accent-[var(--primary)]" data-testid={`plan-${p}`} />
              <span className="text-sm font-medium">{p === 'monthly' ? t('月繳') : t('年繳')}</span>
            </span>
            <span className="text-sm">
              <strong>{formatMoney(snapshot.prices[p])}</strong>
              <span className="text-muted-foreground">{p === 'monthly' ? t('／月') : t('／年')}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm leading-6" data-testid="disclosure">
        <h2 className="text-base font-semibold">{t('付款前請確認')}</h2>
        <p className="rounded-lg bg-muted px-3 py-2 text-base font-bold leading-6" data-testid="disclosure-summary">
          {trial
            ? t('免費試用 {days} 天，{date} 結束後自動扣款 {amount}。', { days: snapshot.trial_days, date: firstCharge ?? '', amount: formatMoney(price) })
            : t('付款後立即開通，今天扣款 {amount}。', { amount: formatMoney(price) })}
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t('內容：Huddle Pro，進行中任務與記事本筆記沒有數量上限、圖片空間 20GB、AI 會議整理每月 20 次，並可串接 Google 日曆與建立組織。')}</li>
          <li>{t('價格：{amount}{unit}，已含稅，沒有其他手續費。只收信用卡，不分期。', { amount: formatMoney(price), unit: plan === 'annual' ? t('／年') : t('／月') })}</li>
          {trial ? (
            <li data-testid="disclosure-trial">
              {t('免費試用 {days} 天，試用期內不收費。試用到 {date} 結束，我們會在 {date} 自動扣款 {amount}。', { days: snapshot.trial_days, date: firstCharge ?? '', amount: formatMoney(price) })}
            </li>
          ) : (
            <li data-testid="disclosure-charge">{t('這個帳號已用過免費試用，所以付款後立即開通，今天就會扣款 {amount}。', { amount: formatMoney(price) })}</li>
          )}
          <li>{t('自動續訂：{unit}自動扣款，扣款日為首次扣款日的同一天，直到你取消為止。', { unit })}</li>
          <li>{t('取消方式：登入後到「設定」→「訂閱」按「取消續訂」，線上就能完成。取消後不再扣款，Pro 可使用到已付費（或試用）期間結束。')}</li>
          <li>{t('卡號只會輸入在 SHOPLINE Payments 的付款框，Huddle 不會取得或儲存完整卡號。')}</li>
        </ul>
        <p className="text-xs text-muted-foreground">{t('未成年人購買前，請先取得法定代理人（例如父母）的同意。')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">{t('信用卡')}</h2>
        {preview
          ? <Notice testId="billing-coming-soon">{t('付款功能即將開通。現在還無法付款，也不會向你收費。')}</Notice>
          : <SlpPaymentForm amountMinor={price} bindCard paymentRef={paymentRef} onReadyChange={setReady} />}
      </section>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={busy} className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--primary)]" data-testid="agree" />
        <span>
          {t('我已閱讀上面的內容，也同意')}
          <a href={termsHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t('服務條款')}</a>
          {t('與')}
          <a href={refundsHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{t('取消與退款')}</a>
          {t('，並授權以這張卡自動續訂扣款。')}
        </span>
      </label>

      {err && <SubmitError testId="billing-submit-error">{err}</SubmitError>}

      <BillingButton variant="primary" className="w-full" data-testid="billing-submit" disabled={!agreed || !ready} busy={busy} onClick={() => void submit()}>
        {trial ? t('開始免費試用') : t('付款並開通 Pro')}
      </BillingButton>
    </BillingFrame>
  )
}

// ── /billing/return ─────────────────────────────────────────────────────────

const POLL_MS = 3000
const POLL_LIMIT_MS = 60_000
const BEFORE_KEY = 'huddle-billing-before'

function ReturnView() {
  const { t } = useI18n()
  const [phase, setPhase] = useState<'wait' | 'ok' | 'failed' | 'slow'>('wait')
  const [snap, setSnap] = useState<WebBillingSnapshot | null>(null)
  const [kind, setKind] = useState<'start' | 'card' | 'pay'>('start')

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('k')
    const kk = k === 'card' || k === 'pay' ? k : 'start'
    setKind(kk)
    let before: { last4?: string | null; payments?: number } = {}
    try { before = JSON.parse(sessionStorage.getItem(BEFORE_KEY) ?? '{}') } catch { /* ignore */ }
    let stopped = false
    const t0 = Date.now()

    const check = (s: WebBillingSnapshot): 'ok' | 'failed' | null => {
      const sub = s.subscription
      if (kk === 'start') {
        if (isLive(sub)) return 'ok'
        return null
      }
      if (kk === 'card') {
        if (before.last4 !== undefined && s.card?.last4 && s.card.last4 !== before.last4) return 'ok'
        return null
      }
      // pay: past_due cleared, or a succeeded payment newer than before
      if (sub && sub.status !== 'past_due' && isLive(sub)) return 'ok'
      if (s.payments.length > (before.payments ?? 0) && s.payments[0]?.status === 'failed') return 'failed'
      return null
    }

    async function tick() {
      if (stopped) return
      try {
        // `status` asks SHOPLINE about any undecided bind/payment first, so the
        // page never depends on the webhook having arrived.
        const res = await callWebBilling<{ billing: WebBillingSnapshot }>({ action: 'status' })
        if (stopped) return
        setSnap(res.billing)
        const r = check(res.billing)
        if (r) { setPhase(r); return }
      } catch {
        try {
          const s = await fetchWebBilling()
          if (stopped) return
          setSnap(s)
          const r = check(s)
          if (r) { setPhase(r); return }
        } catch { /* keep polling */ }
      }
      if (Date.now() - t0 >= POLL_LIMIT_MS) { setPhase('slow'); return }
      setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => { stopped = true }
  }, [])

  const title = kind === 'start' ? t('確認付款結果') : kind === 'card' ? t('確認卡片更換結果') : t('確認付款結果')
  const toSettings = <Link href={SETTINGS_SUB} className={btnOutline}>{t('查看訂閱')}</Link>

  return (
    <BillingFrame title={title}>
      {phase === 'wait' && <div data-testid="return-wait"><Spinner label={t('正在確認結果，請稍候，不要關閉這個頁面…')} /></div>}
      {phase === 'ok' && (
        <div className="space-y-4" data-testid="return-ok">
          <Notice tone="ok">
            {kind === 'start' && (snap?.subscription?.status === 'trialing'
              ? t('完成了！免費試用已經開始，Pro 現在就能使用。')
              : t('完成了！Pro 已經開通。'))}
            {kind === 'card' && t('完成了！已經換成新的信用卡。')}
            {kind === 'pay' && t('付款完成，訂閱已經恢復正常。')}
          </Notice>
          {kind === 'card' && snap?.subscription?.status === 'past_due' && (
            <Link href="/billing/pay" className={`${btnPrimary} w-full`}>{t('立即付款')}</Link>
          )}
          <ButtonStack>
            <Link href="/" className={btnPrimary}>{t('回到 Huddle')}</Link>
            {toSettings}
          </ButtonStack>
        </div>
      )}
      {phase === 'failed' && (
        <div className="space-y-4" data-testid="return-failed">
          <Notice tone="error">{t('這次付款沒有成功，你可以再試一次，或換一張信用卡。')}</Notice>
          <ButtonStack>
            <Link href="/billing/pay" className={btnPrimary}>{t('重新付款')}</Link>
            <Link href="/" className={btnOutline}>{t('回到 Huddle')}</Link>
            {toSettings}
          </ButtonStack>
        </div>
      )}
      {phase === 'slow' && (
        <div className="space-y-4" data-testid="return-slow">
          <Notice>
            {kind === 'start' && snap?.subscription?.status === 'incomplete'
              ? t('銀行還在處理，需要多一點時間。請稍後再到「設定」→「訂閱」查看結果；如果超過一小時仍沒有開通，請聯絡客服，我們會協助處理。')
              : t('還在處理中，需要多一點時間。請稍後再到「設定」→「訂閱」查看結果。')}
          </Notice>
          <ButtonStack>
            <Link href="/" className={btnPrimary}>{t('回到 Huddle')}</Link>
            {toSettings}
          </ButtonStack>
        </div>
      )}
    </BillingFrame>
  )
}

function rememberBefore(snapshot: WebBillingSnapshot) {
  try {
    sessionStorage.setItem(BEFORE_KEY, JSON.stringify({ last4: snapshot.card?.last4 ?? null, payments: snapshot.payments.length }))
  } catch { /* private mode */ }
}

// ── /billing/card ───────────────────────────────────────────────────────────

function CardView() {
  const { lang, t } = useI18n()
  const router = useRouter()
  const { snapshot, error, loading } = useWebBilling()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const paymentRef = useRef<SlpPayment | null>(null)
  const title = t('更換信用卡')

  if (loading) return <BillingFrame title={title}><Spinner label={t('載入中...')} /></BillingFrame>
  if (error || !snapshot) {
    return <BillingFrame title={title}><Notice tone="error" testId="billing-error">{webBillingErrorMessage(error?.code ?? 'unavailable', t)}</Notice></BillingFrame>
  }
  const sub = snapshot.subscription
  if (!sub || !isLive(sub)) {
    return (
      <BillingFrame title={title}>
        <Notice testId="card-none">{t('目前沒有進行中的訂閱，不需要更換卡片。')}</Notice>
        <Link href={SETTINGS_SUB} className={`${btnOutline} w-full`}>{t('前往訂閱設定')}</Link>
      </BillingFrame>
    )
  }
  const current = cardLabel(snapshot.card)

  async function submit() {
    const payment = paymentRef.current
    if (!payment || busy || !snapshot) return
    setBusy(true)
    setErr(null)
    try {
      const paySession = await createPaySession(payment)
      const res = await callWebBilling<{ next_action: unknown }>({ action: 'card_start', paySession, locale: lang })
      rememberBefore(snapshot)
      await runNextAction(payment, res.next_action)
      router.push('/billing/return?k=card')
    } catch (e) {
      setErr(webBillingErrorMessage(toWebBillingError(e).code, t))
      setBusy(false)
    }
  }

  return (
    <BillingFrame title={title} intro={t('輸入新的信用卡。綁定成功後，之後的扣款會改用這張卡，舊卡會解除綁定。')}>
      {current && <Notice testId="card-current">{t('目前使用的卡片：{card}', { card: current })}</Notice>}
      <SlpPaymentForm amountMinor={sub.price_minor} bindCard paymentRef={paymentRef} onReadyChange={setReady} />
      {err && <SubmitError testId="billing-submit-error">{err}</SubmitError>}
      <BillingButton variant="primary" className="w-full" data-testid="card-submit" disabled={!ready} busy={busy} onClick={() => void submit()}>
        {t('儲存新卡片')}
      </BillingButton>
    </BillingFrame>
  )
}

// ── /billing/pay ────────────────────────────────────────────────────────────

function PayView() {
  const { lang, t } = useI18n()
  const router = useRouter()
  const { snapshot, error, loading } = useWebBilling()
  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const paymentRef = useRef<SlpPayment | null>(null)
  const title = t('立即付款')
  const needsPay = snapshot?.subscription?.status === 'past_due'

  useEffect(() => {
    if (!needsPay) return
    let alive = true
    callWebBilling<{ customer_token: string }>({ action: 'customer_token' })
      .then((r) => { if (alive) setToken(r.customer_token) })
      .catch((e) => { if (alive) setTokenError(webBillingErrorMessage(toWebBillingError(e).code, t)) })
    return () => { alive = false }
    // t changes with language only; the token must not be refetched for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPay])

  if (loading) return <BillingFrame title={title}><Spinner label={t('載入中...')} /></BillingFrame>
  if (error || !snapshot) {
    return <BillingFrame title={title}><Notice tone="error" testId="billing-error">{webBillingErrorMessage(error?.code ?? 'unavailable', t)}</Notice></BillingFrame>
  }
  const sub = snapshot.subscription
  if (!sub || !needsPay) {
    return (
      <BillingFrame title={title}>
        <Notice testId="pay-none">{t('目前沒有需要補付的款項。')}</Notice>
        <Link href={SETTINGS_SUB} className={`${btnOutline} w-full`}>{t('前往訂閱設定')}</Link>
      </BillingFrame>
    )
  }

  async function submit() {
    const payment = paymentRef.current
    if (!payment || busy || !snapshot) return
    setBusy(true)
    setErr(null)
    try {
      const paySession = await createPaySession(payment)
      const res = await callWebBilling<{ next_action: unknown }>({ action: 'pay_now', paySession, locale: lang })
      rememberBefore(snapshot)
      await runNextAction(payment, res.next_action)
      router.push('/billing/return?k=pay')
    } catch (e) {
      setErr(webBillingErrorMessage(toWebBillingError(e).code, t))
      setBusy(false)
    }
  }

  return (
    <BillingFrame title={title} intro={t('這一期的扣款沒有成功。選擇已綁定的卡片，或輸入新的卡片付款；付款期間 Pro 照常可以使用。')}>
      <Notice testId="pay-amount">
        {t('這次要付：{amount}', { amount: formatMoney(sub.price_minor) })}
        {sub.grace_until && <span className="text-muted-foreground">{t('（請在 {date} 前完成）', { date: formatDate(sub.grace_until, lang) })}</span>}
      </Notice>
      {tokenError && <Notice tone="error" testId="billing-error">{tokenError}</Notice>}
      {token && <SlpPaymentForm amountMinor={sub.price_minor} bindCard customerToken={token} paymentRef={paymentRef} onReadyChange={setReady} />}
      {!token && !tokenError && <Spinner label={t('付款表單載入中…')} />}
      {err && <SubmitError testId="billing-submit-error">{err}</SubmitError>}
      <BillingButton variant="primary" className="w-full" data-testid="pay-submit" disabled={!ready} busy={busy} onClick={() => void submit()}>
        {t('付款 {amount}', { amount: formatMoney(sub.price_minor) })}
      </BillingButton>
    </BillingFrame>
  )
}
