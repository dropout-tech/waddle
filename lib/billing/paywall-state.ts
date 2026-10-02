import type { BillingResult } from './native-adapter'

/**
 * Purchase-screen state, kept free of React and of the store SDK so every
 * branch can be unit tested (scripts/tests/billing-paywall-state.test.mjs).
 *
 * Nothing in here means "this user is Pro". The store finishing a purchase
 * only sets `waiting`; it is cleared when the server's own paid_until says so
 * (`server_confirmed`). While `waiting` is set the screen offers no purchase:
 * buying a second plan on top of one that has not synced yet would make the
 * store switch plans and charge again.
 */
export type PlanPeriod = 'month' | 'year'
export type TrialUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
/** A free trial this user can still take, exactly as long as the store says. */
export interface PlanTrial { unit: TrialUnit; count: number }
export interface PaywallPlan { identifier: string; period: PlanPeriod; localizedPrice: string; trial: PlanTrial | null }
export type PaywallPhase =
  | 'hidden' // not native iOS, launch flag off, no key, or signed out: render nothing
  | 'loading' // asking the store for products
  | 'load_failed' // no usable products; retry offered
  | 'ready'
  | 'purchasing'
  | 'restoring'
  | 'syncing' // store reported success, server has not confirmed yet
  | 'sync_delayed' // still unconfirmed after the fast window; checks continue at a slower pace
  | 'pending' // store is waiting on someone else (Ask to Buy, bank verification)
export type PaywallNotice = 'purchase_failed' | 'restore_failed' | 'restore_nothing' | 'activated'
export interface PaywallState {
  phase: PaywallPhase
  plans: PaywallPlan[]
  selected: string | null
  notice: PaywallNotice | null
  /** A store transaction the server has not confirmed yet. Non-null locks purchasing. */
  waiting: 'purchase' | 'restore' | 'approval' | null
  /** When that wait began (ms since epoch), so the check schedule survives leaving the page. */
  waitingSince: number | null
  /** Where a restore goes back to when it finds nothing. */
  resume: PaywallPhase | null
}
type StorePackages = Array<{
  identifier: string
  localizedPrice: string
  subscriptionPeriod?: string | null
  freeTrial?: { unit: string; count: number } | null
}>
export type PaywallEvent =
  | { type: 'unavailable' }
  | { type: 'opened' }
  | { type: 'load_started' }
  | { type: 'packages_result'; result: BillingResult<StorePackages> }
  | { type: 'plan_selected'; identifier: string }
  | { type: 'purchase_started' }
  | { type: 'purchase_result'; result: BillingResult<unknown>; at: number }
  | { type: 'restore_started' }
  | { type: 'restore_result'; result: BillingResult<{ hasActiveSubscription: boolean }>; at: number }
  | { type: 'server_confirmed' }
  | { type: 'sync_timed_out' }

export const initialPaywallState: PaywallState = {
  phase: 'hidden', plans: [], selected: null, notice: null, waiting: null, waitingSince: null, resume: null,
}

const PERIODS: Record<string, PlanPeriod> = { P1M: 'month', P1Y: 'year' }
const TRIAL_UNITS: readonly string[] = ['DAY', 'WEEK', 'MONTH', 'YEAR']

/** Anything that is not a whole, positive length in a known unit is treated as "no trial". */
function toTrial(freeTrial: { unit: string; count: number } | null | undefined): PlanTrial | null {
  if (!freeTrial || !TRIAL_UNITS.includes(freeTrial.unit) || !Number.isInteger(freeTrial.count) || freeTrial.count < 1) return null
  return { unit: freeTrial.unit as TrialUnit, count: freeTrial.count }
}

/**
 * One monthly and one yearly plan, taken from the billing period the store
 * itself reports. A package without a period or without a store price is
 * dropped rather than shown with a guessed label or a reference price.
 */
export function toPlans(packages: StorePackages): PaywallPlan[] {
  const plans: PaywallPlan[] = []
  for (const period of ['month', 'year'] as const) {
    const match = packages.find((item) => PERIODS[item.subscriptionPeriod ?? ''] === period && item.localizedPrice.trim() !== '')
    if (match) plans.push({ identifier: match.identifier, period, localizedPrice: match.localizedPrice, trial: toTrial(match.freeTrial) })
  }
  return plans
}

/** The only state in which the subscribe button may start a purchase. */
export function canPurchase(state: PaywallState): boolean {
  return state.phase === 'ready' && state.waiting === null && state.selected !== null
}

const restPhase = (state: PaywallState): PaywallPhase => (state.plans.length ? 'ready' : 'load_failed')
/** Nothing in flight and nothing outstanding. */
function rest(state: PaywallState, notice: PaywallNotice | null): PaywallState {
  return { ...state, phase: restPhase(state), notice, waiting: null, waitingSince: null, resume: null }
}
const hidden = (): PaywallState => initialPaywallState
const lostSession = (status: string) => status === 'not_configured' || status === 'sign_in_required'

export function paywallReducer(state: PaywallState, event: PaywallEvent): PaywallState {
  switch (event.type) {
    case 'unavailable':
      return hidden()
    case 'opened':
      // Coming back to the page: old one-off messages go, an outstanding wait stays.
      return state.notice ? { ...state, notice: null } : state
    case 'load_started':
      return state.phase === 'hidden' || state.phase === 'load_failed' ? { ...state, phase: 'loading', notice: null } : state
    case 'packages_result': {
      if (state.phase !== 'loading') return state
      if (lostSession(event.result.status)) return hidden()
      if (event.result.status !== 'ready') return { ...state, phase: 'load_failed', plans: [], selected: null }
      const plans = toPlans(event.result.value)
      if (!plans.length) return { ...state, phase: 'load_failed', plans: [], selected: null }
      const selected = plans.some((plan) => plan.identifier === state.selected) ? state.selected : plans[0].identifier
      return { ...state, phase: 'ready', plans, selected }
    }
    case 'plan_selected':
      return state.phase === 'ready' && state.plans.some((plan) => plan.identifier === event.identifier)
        ? { ...state, selected: event.identifier }
        : state
    case 'purchase_started':
      // A second tap while the store sheet is up, or any tap while a wait is outstanding, is ignored.
      return canPurchase(state) ? { ...state, phase: 'purchasing', notice: null } : state
    case 'purchase_result': {
      if (state.phase !== 'purchasing') return state
      const { status } = event.result
      if (lostSession(status)) return hidden()
      if (status === 'ready') return { ...state, phase: 'syncing', notice: null, waiting: 'purchase', waitingSince: event.at }
      if (status === 'pending') return { ...state, phase: 'pending', notice: null, waiting: 'approval', waitingSince: event.at }
      // Backing out of the store sheet is a choice, not an error: no message.
      return rest(state, status === 'cancelled' ? null : 'purchase_failed')
    }
    case 'restore_started':
      // Restore stays reachable when products failed to load and during a slow sync or a pending approval.
      return state.phase === 'ready' || state.phase === 'load_failed' || state.phase === 'sync_delayed' || state.phase === 'pending'
        ? { ...state, phase: 'restoring', notice: null, resume: state.phase }
        : state
    case 'restore_result': {
      if (state.phase !== 'restoring') return state
      const { result } = event
      if (lostSession(result.status)) return hidden()
      if (result.status === 'ready' && result.value.hasActiveSubscription) {
        return { ...state, phase: 'syncing', notice: null, waiting: 'restore', waitingSince: event.at, resume: null }
      }
      const notice = result.status === 'cancelled' ? null : result.status === 'ready' ? 'restore_nothing' : 'restore_failed'
      // Finding nothing does not end an outstanding wait: the purchase lock stays on.
      return { ...state, phase: state.waiting ? (state.resume ?? restPhase(state)) : restPhase(state), notice, resume: null }
    }
    case 'server_confirmed':
      return state.phase === 'syncing' || state.phase === 'sync_delayed' || state.phase === 'pending' ? rest(state, 'activated') : state
    case 'sync_timed_out':
      return state.phase === 'syncing' ? { ...state, phase: 'sync_delayed' } : state
  }
}

export interface SyncLimits {
  /** First server check after the store reports success. */
  firstMs: number
  /** Interval while the answer is expected any moment. Longer than the 5 s share window of operations('self'), so every check is a fresh read. */
  fastMs: number
  /** After this long the screen says "taking longer than usual" and slows down. */
  delayedAfterMs: number
  slowMs: number
  /** After this long the timer stops; the screen still re-checks when it is opened or returns to the foreground. */
  stopAfterMs: number
}
export const SYNC_LIMITS: SyncLimits = { firstMs: 2500, fastMs: 5500, delayedAfterMs: 90_000, slowMs: 15_000, stopAfterMs: 30 * 60_000 }

/** True once a sync has outlasted the fast window. */
export function syncIsDelayed(elapsedMs: number, limits: SyncLimits = SYNC_LIMITS): boolean {
  return elapsedMs >= limits.delayedAfterMs
}

/**
 * Delay before the next server check, or null once the total limit is used up.
 * `approval` (someone else has to act first) checks at the slow pace from the start.
 */
export function nextSyncDelay(elapsedMs: number, pace: 'sync' | 'approval' = 'sync', limits: SyncLimits = SYNC_LIMITS): number | null {
  if (elapsedMs >= limits.stopAfterMs) return null
  if (pace === 'approval' || syncIsDelayed(elapsedMs, limits)) return limits.slowMs
  return elapsedMs <= 0 ? limits.firstMs : limits.fastMs
}
