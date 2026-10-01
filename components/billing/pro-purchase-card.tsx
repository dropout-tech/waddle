'use client'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { hasCurrentPro } from '@/lib/billing/plans'
import { initialPaywallState, nextSyncDelay, paywallReducer, type PaywallNotice, type PaywallPlan } from '@/lib/billing/paywall-state'
import { styles as page } from '@/components/operations/shared'
import { acquireBillingSession, billingTestHook, isIosPurchaseSurface, type BillingSession } from './billing-session'
import styles from './pro-purchase-card.module.css'

/** Apple's own subscription management page; the native shell hands it to the system. */
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'

const NOTICE: Record<PaywallNotice, string> = {
  purchase_failed: '購買沒有完成。如果你看到扣款，請按「恢復購買」。',
  purchase_pending: '這筆購買正在等待核准（例如家長同意或付款驗證）。核准後會自動生效，不需要再買一次。',
  restore_failed: '恢復購買沒有成功，請稍後再試。',
  restore_nothing: '這個 Apple 帳號沒有可恢復的 Huddle Pro 訂閱。',
  activated: 'Huddle Pro 已生效。',
}

/**
 * Huddle Pro purchase card for the native iOS shell.
 *
 * Renders nothing unless this is native iOS with a usable store session (launch
 * flag on, public SDK key present, signed in). "Subscribed" is decided by
 * `paidUntil`, which the caller reads from the server; a purchase the store
 * reports as complete only starts a wait for that value to change.
 */
export function ProPurchaseCard({
  userId,
  paidUntil,
  onRefresh,
}: {
  userId: string | undefined
  /** Server-side paid entitlement expiry (huddle_operations 'self'). */
  paidUntil: string | null
  /** Re-reads the server's membership; resolves null when the read no longer applies. */
  onRefresh: () => Promise<{ paid_until: string | null } | null>
}) {
  const { t, lang } = useI18n()
  const [state, dispatch] = useReducer(paywallReducer, initialPaywallState)
  const session = useRef<BillingSession | null>(null)
  const mounted = useRef(true)
  const refresh = useRef(onRefresh)
  useEffect(() => {
    refresh.current = onRefresh
  }, [onRefresh])

  const loadPlans = useCallback(async () => {
    const current = session.current
    if (!current) return
    dispatch({ type: 'load_started' })
    const result = await current.packages()
    if (mounted.current && session.current === current) dispatch({ type: 'packages_result', result })
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!userId || !isIosPurchaseSurface()) return
    let stale = false
    acquireBillingSession(userId)
      .then((acquired) => {
        if (stale) return
        if (!acquired.available) return dispatch({ type: 'unavailable' })
        session.current = acquired
        void loadPlans()
      })
      .catch(() => {
        if (!stale) dispatch({ type: 'unavailable' })
      })
    return () => {
      stale = true
      mounted.current = false
      session.current = null
    }
  }, [userId, loadPlans])

  // The store said "done"; only the server can say "subscribed". Check it on a
  // schedule and give up politely after the limit.
  useEffect(() => {
    if (state.phase !== 'syncing') return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const limit = billingTestHook()?.syncMaxWaitMs
    const schedule = () => {
      const delay = nextSyncDelay(Date.now() - started, limit)
      if (delay === null) return dispatch({ type: 'sync_timed_out' })
      timer = setTimeout(async () => {
        const fresh = await refresh.current().catch(() => null)
        if (stopped) return
        if (hasCurrentPro({ expires_at: fresh?.paid_until ?? null })) dispatch({ type: 'server_confirmed' })
        else schedule()
      }, delay)
    }
    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [state.phase])

  const subscribed = hasCurrentPro({ expires_at: paidUntil })
  useEffect(() => {
    if (subscribed) dispatch({ type: 'server_confirmed' })
  }, [subscribed])

  if (state.phase === 'hidden') return null

  const selected = state.plans.find((plan) => plan.identifier === state.selected)
  const waiting = state.phase === 'purchasing' || state.phase === 'restoring' || state.phase === 'syncing'
  const priceLabel = (plan: PaywallPlan) =>
    plan.period === 'month' ? t('{price}／月', { price: plan.localizedPrice }) : t('{price}／年', { price: plan.localizedPrice })

  async function purchase() {
    const current = session.current
    if (!current || state.phase !== 'ready' || !state.selected) return
    dispatch({ type: 'purchase_started' })
    const result = await current.purchase(state.selected)
    if (mounted.current) dispatch({ type: 'purchase_result', result })
  }
  async function restore() {
    const current = session.current
    if (!current || waiting || state.phase === 'loading') return
    dispatch({ type: 'restore_started' })
    const result = await current.restore()
    if (mounted.current) dispatch({ type: 'restore_result', result })
  }

  return (
    <section className={page.panel} data-billing-card data-phase={state.phase} aria-busy={waiting || state.phase === 'loading'}>
      <h2>Huddle Pro</h2>
      {subscribed ? (
        <p>{t('你已訂閱 Huddle Pro。要變更方案或取消，請到 Apple 的訂閱管理。')}</p>
      ) : (
        <p className={page.muted}>
          {t('Huddle Pro 是自動續訂的訂閱。訂閱期間你可以建立組織，用邀請連結邀請成員。任務、行事曆、計時、記事本、白板等個人功能維持免費。')}
        </p>
      )}

      {state.notice && (
        <p role="status" className={styles.notice} data-billing-notice={state.notice}>
          {t(NOTICE[state.notice])}
        </p>
      )}
      {state.phase === 'syncing' && (
        <div role="status" className={styles.notice} data-billing-sync>
          <strong>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {state.syncing === 'restore' ? t('已找到你的訂閱，正在同步') : t('購買已完成，正在同步')}
          </strong>
          <span>{t('App Store 已回報完成，正在等伺服器確認。確認後這裡會顯示你的訂閱，通常不到一分鐘。')}</span>
        </div>
      )}
      {state.phase === 'sync_delayed' && (
        <p role="status" className={styles.notice} data-billing-sync="delayed">
          {t('同步比平常久。App Store 已記錄你的購買，稍後會自動生效；你也可以按「恢復購買」再同步一次。')}
        </p>
      )}

      {!subscribed && state.phase === 'loading' && (
        <p className={page.loading} role="status">
          <Loader2 size={18} className="animate-spin" aria-hidden /> {t('正在向 App Store 取得方案…')}
        </p>
      )}
      {!subscribed && state.phase === 'load_failed' && (
        <>
          <p role="alert" className={styles.notice}>
            {t('目前無法取得訂閱方案，請確認網路後再試一次。')}
          </p>
          <div className={page.actions}>
            <button onClick={() => void loadPlans()}>{t('重試')}</button>
          </div>
        </>
      )}
      {!subscribed && state.plans.length > 0 && state.phase !== 'syncing' && state.phase !== 'sync_delayed' && (
        <>
          <fieldset className={styles.plans} disabled={waiting}>
            <legend className="sr-only">{t('選擇方案')}</legend>
            {state.plans.map((plan) => (
              <label key={plan.identifier} className={styles.plan} data-selected={plan.identifier === state.selected} data-plan={plan.period}>
                <input
                  type="radio"
                  name="huddle-pro-plan"
                  checked={plan.identifier === state.selected}
                  onChange={() => dispatch({ type: 'plan_selected', identifier: plan.identifier })}
                />
                <span className={styles.dot} aria-hidden />
                <span className={styles.planName}>
                  {plan.period === 'month' ? t('月繳') : t('年繳')}
                  <small>{plan.period === 'month' ? t('每月自動續訂') : t('每年自動續訂')}</small>
                </span>
                <span className={styles.price}>{priceLabel(plan)}</span>
              </label>
            ))}
          </fieldset>
          <button className={`${page.primary} ${styles.cta}`} disabled={waiting || !selected} onClick={() => void purchase()}>
            {state.phase === 'purchasing' && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {state.phase === 'purchasing'
              ? t('等待 App Store 確認…')
              : selected
                ? t('訂閱 · {price}', { price: priceLabel(selected) })
                : t('選擇方案')}
          </button>
          <p className={styles.terms}>
            {t('訂閱到期前 24 小時內會自動續訂並向你的 Apple 帳號扣款，除非你在到期前至少 24 小時取消。確認購買時，款項會向你的 Apple 帳號收取。你可以隨時到 Apple ID 的「訂閱」設定管理或取消。')}
          </p>
        </>
      )}

      <div className={styles.links}>
        {subscribed && <a href={MANAGE_SUBSCRIPTIONS_URL}>{t('管理訂閱')}</a>}
        <button className={styles.link} disabled={waiting || state.phase === 'loading'} onClick={() => void restore()}>
          {state.phase === 'restoring' ? t('正在恢復購買…') : t('恢復購買')}
        </button>
        <Link href={lang === 'en' ? '/en/terms' : '/terms'}>{t('服務條款')}</Link>
        <Link href={lang === 'en' ? '/en/privacy' : '/privacy'}>{t('隱私權政策')}</Link>
      </div>
    </section>
  )
}
