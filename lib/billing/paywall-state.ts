import type { BillingResult } from './native-adapter'

/**
 * Purchase-screen state, kept free of React and of the store SDK so every
 * branch can be unit tested (scripts/tests/billing-paywall-state.test.mjs).
 *
 * Nothing in here means "this user is Pro". The store finishing a purchase
 * only moves the screen to `syncing`; the screen leaves it when the server's
 * own paid_until says so (`server_confirmed`) or the wait limit is reached.
 */
export type PlanPeriod = 'month' | 'year'
export interface PaywallPlan { identifier: string; period: PlanPeriod; localizedPrice: string }
export type PaywallPhase =
  | 'hidden' // not native iOS, launch flag off, no key, or signed out: render nothing
  | 'loading' // asking the store for products
  | 'load_failed' // no usable products; retry offered
  | 'ready'
  | 'purchasing'
  | 'restoring'
  | 'syncing' // store reported success, server has not confirmed yet
  | 'sync_delayed' // waited the full limit; will apply later, restore offered
export type PaywallNotice = 'purchase_failed' | 'purchase_pending' | 'restore_failed' | 'restore_nothing' | 'activated'
export interface PaywallState {
  phase: PaywallPhase
  plans: PaywallPlan[]
  selected: string | null
  notice: PaywallNotice | null
  /** What the current sync is waiting on; only picks the wording. */
  syncing: 'purchase' | 'restore' | null
}
type StorePackages = Array<{ identifier: string; localizedPrice: string; subscriptionPeriod?: string | null }>
export type PaywallEvent =
  | { type: 'unavailable' }
  | { type: 'load_started' }
  | { type: 'packages_result'; result: BillingResult<StorePackages> }
  | { type: 'plan_selected'; identifier: string }
  | { type: 'purchase_started' }
  | { type: 'purchase_result'; result: BillingResult<unknown> }
  | { type: 'restore_started' }
  | { type: 'restore_result'; result: BillingResult<{ hasActiveSubscription: boolean }> }
  | { type: 'server_confirmed' }
  | { type: 'sync_timed_out' }

export const initialPaywallState: PaywallState = { phase: 'hidden', plans: [], selected: null, notice: null, syncing: null }

const PERIODS: Record<string, PlanPeriod> = { P1M: 'month', P1Y: 'year' }

/**
 * One monthly and one yearly plan, taken from the billing period the store
 * itself reports. A package without a period or without a store price is
 * dropped rather than shown with a guessed label or a reference price.
 */
export function toPlans(packages: StorePackages): PaywallPlan[] {
  const plans: PaywallPlan[] = []
  for (const period of ['month', 'year'] as const) {
    const match = packages.find((item) => PERIODS[item.subscriptionPeriod ?? ''] === period && item.localizedPrice.trim() !== '')
    if (match) plans.push({ identifier: match.identifier, period, localizedPrice: match.localizedPrice })
  }
  return plans
}

/** Where the screen rests when nothing is in flight. */
function rest(state: PaywallState, notice: PaywallNotice | null): PaywallState {
  return { ...state, phase: state.plans.length ? 'ready' : 'load_failed', notice, syncing: null }
}
const hidden = (): PaywallState => initialPaywallState
const lostSession = (status: string) => status === 'not_configured' || status === 'sign_in_required'

export function paywallReducer(state: PaywallState, event: PaywallEvent): PaywallState {
  switch (event.type) {
    case 'unavailable':
      return hidden()
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
      // Only from rest with a chosen plan: a second tap while the store sheet is up is ignored.
      return state.phase === 'ready' && state.selected ? { ...state, phase: 'purchasing', notice: null } : state
    case 'purchase_result': {
      if (state.phase !== 'purchasing') return state
      const { status } = event.result
      if (lostSession(status)) return hidden()
      if (status === 'ready') return { ...state, phase: 'syncing', notice: null, syncing: 'purchase' }
      // Backing out of the store sheet is a choice, not an error: no message.
      if (status === 'cancelled') return rest(state, null)
      return rest(state, status === 'pending' ? 'purchase_pending' : 'purchase_failed')
    }
    case 'restore_started':
      // Restore stays reachable when products failed to load and after a slow sync.
      return state.phase === 'ready' || state.phase === 'load_failed' || state.phase === 'sync_delayed'
        ? { ...state, phase: 'restoring', notice: null, syncing: null }
        : state
    case 'restore_result': {
      if (state.phase !== 'restoring') return state
      const { result } = event
      if (lostSession(result.status)) return hidden()
      if (result.status === 'cancelled') return rest(state, null)
      if (result.status !== 'ready') return rest(state, 'restore_failed')
      return result.value.hasActiveSubscription
        ? { ...state, phase: 'syncing', notice: null, syncing: 'restore' }
        : rest(state, 'restore_nothing')
    }
    case 'server_confirmed':
      return state.phase === 'syncing' || state.phase === 'sync_delayed' ? rest(state, 'activated') : state
    case 'sync_timed_out':
      return state.phase === 'syncing' ? { ...state, phase: 'sync_delayed' } : state
  }
}

export const SYNC_FIRST_DELAY_MS = 2500
/** Longer than the 5 s share window of operations('self'), so every check is a fresh read. */
export const SYNC_INTERVAL_MS = 5500
export const SYNC_MAX_WAIT_MS = 90_000

/** Delay before the next server check, or null once the wait limit is used up. */
export function nextSyncDelay(elapsedMs: number, maxWaitMs = SYNC_MAX_WAIT_MS): number | null {
  if (elapsedMs <= 0) return Math.min(SYNC_FIRST_DELAY_MS, maxWaitMs)
  return elapsedMs + SYNC_INTERVAL_MS > maxWaitMs ? null : SYNC_INTERVAL_MS
}
