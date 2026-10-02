'use client'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'
import { isNative } from '@/lib/platform'
import { dayLabel } from '@/lib/operations/client'
import { hasCurrentPro } from '@/lib/billing/plans'
import {
  SYNC_LIMITS, canPurchase, initialPaywallState, nextSyncDelay, syncIsDelayed,
  type PaywallEvent, type PaywallNotice,
} from '@/lib/billing/paywall-state'
import { planCopy } from '@/lib/billing/paywall-copy'
import { styles as page } from '@/components/operations/shared'
import { acquireBillingSession, billingTestHook, isIosPurchaseSurface, paywall, type BillingSession } from './billing-session'
import styles from './pro-purchase-card.module.css'

/** Apple's own subscription management page; the native shell hands it to the system. */
const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'

const NOTICE: Record<PaywallNotice, string> = {
  purchase_failed: '購買沒有完成。如果你看到扣款，請按「恢復購買」。',
  restore_failed: '恢復購買沒有成功，請稍後再試。',
  restore_nothing: '這個 Apple 帳號沒有可恢復的 Huddle Pro 訂閱。',
  owned_elsewhere: '這個 Apple ID 的 Huddle Pro 訂閱已綁定另一個 Huddle 帳號，無法轉移。請登出後改用當初購買時的帳號登入；需要協助請聯絡客服。',
  activated: 'Huddle Pro 已生效。',
}
const serverPlaceholder = () => initialPaywallState

/**
 * Huddle Pro purchase card for the native iOS shell.
 *
 * Renders nothing unless this is native iOS with a usable store session (launch
 * flag on, public SDK key present, signed in). "Subscribed" is decided by
 * `paidUntil`, which the caller reads from the server; a purchase the store
 * reports as complete only starts a wait for that value to change. The state
 * lives in the `paywall` store, not in this component, so that wait — and the
 * purchase lock that goes with it — is still there after leaving the page.
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
  const state = useSyncExternalStore(paywall.subscribe, () => paywall.read(userId), serverPlaceholder)
  const session = useRef<BillingSession | null>(null)
  const refresh = useRef(onRefresh)
  useEffect(() => {
    refresh.current = onRefresh
  }, [onRefresh])

  // Results are written to the store for the user who started the action, even
  // if this card has been unmounted in the meantime.
  const loadPlans = useCallback(async (from: BillingSession, uid: string) => {
    paywall.dispatch(uid, { type: 'load_started' })
    paywall.dispatch(uid, { type: 'packages_result', result: await from.packages() })
  }, [])

  useEffect(() => {
    if (!userId || !isIosPurchaseSurface()) return
    let stale = false
    paywall.open(userId)
    acquireBillingSession(userId)
      .then((acquired) => {
        if (stale) return
        if (!acquired.available) return paywall.dispatch(userId, { type: 'unavailable' })
        session.current = acquired
        const { phase } = paywall.read(userId)
        if (phase === 'hidden' || phase === 'load_failed') void loadPlans(acquired, userId)
      })
      .catch(() => {
        if (!stale) paywall.dispatch(userId, { type: 'unavailable' })
      })
    return () => {
      stale = true
      session.current = null
    }
  }, [userId, loadPlans])

  // The store said "done" (or "waiting for approval"); only the server can say
  // "subscribed". Keep asking it: quickly at first, then slowly, and at once
  // whenever the page comes back to the foreground.
  const awaitingServer = state.phase === 'syncing' || state.phase === 'sync_delayed' || state.phase === 'pending'
  const pace = state.phase === 'pending' ? 'approval' : 'sync'
  const { waitingSince } = state
  useEffect(() => {
    if (!awaitingServer || !userId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const limits = { ...SYNC_LIMITS, ...billingTestHook()?.sync }
    const since = waitingSince ?? Date.now()
    const send = (event: PaywallEvent) => paywall.dispatch(userId, event)
    const check = async () => {
      const fresh = await refresh.current().catch(() => null)
      if (stopped) return true
      if (!hasCurrentPro({ expires_at: fresh?.paid_until ?? null })) return false
      send({ type: 'server_confirmed' })
      return true
    }
    const schedule = () => {
      const elapsed = Date.now() - since
      if (pace === 'sync' && syncIsDelayed(elapsed, limits)) send({ type: 'sync_timed_out' })
      const delay = nextSyncDelay(elapsed, pace, limits)
      if (delay === null) return
      timer = setTimeout(() => {
        void check().then((done) => {
          if (!done) schedule()
        })
      }, delay)
    }
    schedule()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    let removeAppListener: (() => void) | undefined
    if (isNative()) {
      void import('@capacitor/app').then(({ App }) =>
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void check()
        }).then((handle) => {
          if (stopped) void handle.remove()
          else removeAppListener = () => void handle.remove()
        })
      )
    }
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      removeAppListener?.()
    }
  }, [awaitingServer, pace, waitingSince, userId])

  const subscribed = hasCurrentPro({ expires_at: paidUntil })
  useEffect(() => {
    if (subscribed && userId) paywall.dispatch(userId, { type: 'server_confirmed' })
  }, [subscribed, userId])

  if (state.phase === 'hidden') return null

  const selected = state.plans.find((plan) => plan.identifier === state.selected)
  const selectedCopy = selected ? planCopy(selected, t) : null
  const busy = state.phase === 'purchasing' || state.phase === 'restoring'
  // Plans are offered only while nothing is outstanding with the store.
  const offerPlans = !subscribed && state.waiting === null && state.plans.length > 0

  async function purchase() {
    const current = session.current
    if (!userId || !current) return
    // Read the live state, not this render's copy: a second tap in the same frame must not start a second purchase.
    const live = paywall.read(userId)
    if (!canPurchase(live) || !live.selected) return
    paywall.dispatch(userId, { type: 'purchase_started' })
    const result = await current.purchase(live.selected)
    paywall.dispatch(userId, { type: 'purchase_result', result, at: Date.now() })
  }
  async function restore() {
    const current = session.current
    if (!userId || !current) return
    // Only continue if this call is the one that started the restore.
    const before = paywall.read(userId)
    paywall.dispatch(userId, { type: 'restore_started' })
    const after = paywall.read(userId)
    if (after === before || after.phase !== 'restoring') return
    const result = await current.restore()
    paywall.dispatch(userId, { type: 'restore_result', result, at: Date.now() })
  }
  const restoreLocked = busy || state.phase === 'loading' || state.phase === 'syncing'

  return (
    <section className={page.panel} data-billing-card data-phase={state.phase} aria-busy={busy || state.phase === 'loading' || state.phase === 'syncing'}>
      <h2>Huddle Pro</h2>
      {subscribed ? (
        <p>{t('你已訂閱 Huddle Pro，有效至 {date}。要變更方案或取消，請到 Apple 的訂閱管理。', { date: dayLabel(paidUntil) })}</p>
      ) : (
        <p className={page.muted}>
          {t('Huddle Pro 是自動續訂的訂閱。訂閱期間：進行中任務與筆記不限數量、圖片空間 20 GB、每月 20 次 AI 會議整理、可串接 Google 日曆、可建立組織並用邀請連結邀請成員。任務、行事曆、計時、記事本、白板等個人功能維持免費。')}
        </p>
      )}

      {state.notice && (
        <p role="status" className={styles.notice} data-billing-notice={state.notice}>
          {t(NOTICE[state.notice])}
        </p>
      )}
      {!subscribed && state.waiting === 'approval' && (
        <p role="status" className={styles.notice} data-billing-wait="approval">
          {t('這筆購買正在等待核准（例如家長同意或付款驗證）。核准後會自動生效，不需要再買一次。')}
        </p>
      )}
      {!subscribed && state.waiting !== null && state.waiting !== 'approval' && (state.phase === 'syncing' ? (
        <div role="status" className={styles.notice} data-billing-wait="sync">
          <strong>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {state.waiting === 'restore' ? t('已找到你的訂閱，正在同步') : t('購買已完成，正在同步')}
          </strong>
          <span>{t('App Store 已回報完成，正在等伺服器確認。確認後這裡會顯示你的訂閱，通常不到一分鐘。')}</span>
        </div>
      ) : (
        <p role="status" className={styles.notice} data-billing-wait="delayed">
          {t('同步比平常久。App Store 已記錄你的購買，稍後會自動生效，這裡也會自動更新；你也可以按「恢復購買」再同步一次。')}
        </p>
      ))}

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
            <button
              onClick={() => {
                if (userId && session.current) void loadPlans(session.current, userId)
              }}
            >
              {t('重試')}
            </button>
          </div>
        </>
      )}
      {offerPlans && (
        <>
          <fieldset className={styles.plans} disabled={busy}>
            <legend className="sr-only">{t('選擇方案')}</legend>
            {state.plans.map((plan) => {
              const copy = planCopy(plan, t)
              return (
                <label key={plan.identifier} className={styles.plan} data-selected={plan.identifier === state.selected} data-plan={plan.period}>
                  <input
                    type="radio"
                    name="huddle-pro-plan"
                    checked={plan.identifier === state.selected}
                    onChange={() => userId && paywall.dispatch(userId, { type: 'plan_selected', identifier: plan.identifier })}
                  />
                  <span className={styles.dot} aria-hidden />
                  <span className={styles.planName}>
                    {copy.name}
                    <small>{copy.detail}</small>
                  </span>
                  <span className={styles.price}>{copy.price}</span>
                </label>
              )
            })}
          </fieldset>
          <button className={`${page.primary} ${styles.cta}`} data-billing-cta disabled={!canPurchase(state)} onClick={() => void purchase()}>
            {state.phase === 'purchasing' && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {state.phase === 'purchasing' ? t('等待 App Store 確認…') : (selectedCopy?.cta ?? t('選擇方案'))}
          </button>
          {selectedCopy && <p className={styles.terms}>{selectedCopy.terms}</p>}
        </>
      )}

      <div className={styles.links}>
        {subscribed && <a href={MANAGE_SUBSCRIPTIONS_URL}>{t('管理訂閱')}</a>}
        <button className={styles.link} disabled={restoreLocked} onClick={() => void restore()}>
          {state.phase === 'restoring' ? t('正在恢復購買…') : t('恢復購買')}
        </button>
        <Link href={lang === 'en' ? '/en/terms' : '/terms'}>{t('服務條款')}</Link>
        <Link href={lang === 'en' ? '/en/privacy' : '/privacy'}>{t('隱私權政策')}</Link>
      </div>
    </section>
  )
}
