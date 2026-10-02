// Purchase-screen states, driven through the real adapter with a fake store.
// Run: node --experimental-strip-types --test scripts/tests/billing-*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
import { createBillingSessionStore } from '../../lib/billing/session-store.ts'
import { createPaywallStore } from '../../lib/billing/paywall-store.ts'
import { planCopy, planPrice, trialLength } from '../../lib/billing/paywall-copy.ts'
import { dict as billingEnglish } from '../../lib/i18n/dict/billing.ts'
import { BILLING_PLAN } from '../../lib/billing/plans.ts'
import {
  initialPaywallState, paywallReducer, toPlans, canPurchase, nextSyncDelay, syncIsDelayed, SYNC_LIMITS,
} from '../../lib/billing/paywall-state.ts'

const authenticatedUserId = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
const otherUserId = '0b6f6a57-5f0e-4a57-9d5c-2f6f3c1f7a11'
const storePackages = [
  { identifier: '$rc_annual', localizedPrice: 'NT$990.00', subscriptionPeriod: 'P1Y' },
  { identifier: '$rc_monthly', localizedPrice: 'NT$150.00', subscriptionPeriod: 'P1M' },
]
/** A store whose every answer the test can script. */
function fakeStore(overrides = {}) {
  const calls = []
  const driver = {
    async configure(options) { calls.push(['configure', options.appUserID]) },
    async listPackages() { calls.push(['listPackages']); return storePackages },
    async purchase(identifier) { calls.push(['purchase', identifier]) },
    async restore() { calls.push(['restore']); return { hasActiveSubscription: true } },
    async logOut() { calls.push(['logOut']) },
    ...overrides,
  }
  const session = createNativeBillingSession({ driver, publicApiKey: 'public-test', authenticatedUserId, purchasesEnabled: true })
  return { session, calls }
}
const run = (state, ...events) => events.reduce(paywallReducer, state)
const T0 = 1_800_000_000_000
/** Loads products the way the card does and returns the resting state. */
async function loaded(session) {
  return run(initialPaywallState, { type: 'load_started' }, { type: 'packages_result', result: await session.packages() })
}
const bought = async (session, state) => run(state, { type: 'purchase_started' }, { type: 'purchase_result', result: await session.purchase(state.selected), at: T0 })
/** Same translation rule as lib/i18n (source text is the key, {name} placeholders). */
const fill = (text, vars = {}) => Object.entries(vars).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text)
const zh = (text, vars) => fill(text, vars)
const en = (text, vars) => fill(billingEnglish[text] ?? text, vars)

test('not configured: no SDK, flag off or signed out keeps the card hidden', async () => {
  const unconfigured = createNativeBillingSession({ authenticatedUserId })
  assert.equal(unconfigured.available, false)
  assert.equal((await loaded(unconfigured)).phase, 'hidden')

  const flagOff = createNativeBillingSession({ authenticatedUserId, publicApiKey: 'public-test', purchasesEnabled: false, driver: {} })
  assert.equal(flagOff.available, false)
  assert.equal((await loaded(flagOff)).phase, 'hidden')

  const signedOut = createNativeBillingSession({ driver: {}, publicApiKey: 'public-test', purchasesEnabled: true })
  assert.equal(signedOut.available, false)
  assert.equal((await loaded(signedOut)).phase, 'hidden')

  assert.equal(fakeStore().session.available, true)
  assert.equal(run(initialPaywallState, { type: 'load_started' }, { type: 'unavailable' }).phase, 'hidden')
})

test('loading products, then two plans with the store price and the store period', async () => {
  const { session } = fakeStore()
  const loading = run(initialPaywallState, { type: 'load_started' })
  assert.equal(loading.phase, 'loading')
  const ready = run(loading, { type: 'packages_result', result: await session.packages() })
  assert.equal(ready.phase, 'ready')
  assert.deepEqual(ready.plans, [
    { identifier: '$rc_monthly', period: 'month', localizedPrice: 'NT$150.00', trial: null },
    { identifier: '$rc_annual', period: 'year', localizedPrice: 'NT$990.00', trial: null },
  ])
  assert.equal(ready.selected, '$rc_monthly')
  assert.equal(canPurchase(ready), true)
  assert.equal(run(ready, { type: 'plan_selected', identifier: '$rc_annual' }).selected, '$rc_annual')
  assert.equal(run(ready, { type: 'plan_selected', identifier: 'invented' }).selected, '$rc_monthly')
})

test('checkout price only ever comes from the store, never from the reference amounts', () => {
  // The period label follows what the store bills, not the package name.
  assert.deepEqual(toPlans([{ identifier: '$rc_monthly', localizedPrice: '¥9,800', subscriptionPeriod: 'P1Y' }]),
    [{ identifier: '$rc_monthly', period: 'year', localizedPrice: '¥9,800', trial: null }])
  // No period, an unsupported period, or no price: not offered at all.
  assert.deepEqual(toPlans([
    { identifier: '$rc_monthly', localizedPrice: 'NT$150.00' },
    { identifier: '$rc_weekly', localizedPrice: 'NT$50.00', subscriptionPeriod: 'P1W' },
    { identifier: '$rc_annual', localizedPrice: ' ', subscriptionPeriod: 'P1Y' },
  ]), [])
  const plans = toPlans(storePackages.map((item) => ({ ...item, localizedPrice: 'US$4.99', freeTrial: { unit: 'WEEK', count: 2 } })))
  const shown = JSON.stringify(plans.flatMap((plan) => [planCopy(plan, zh), planCopy(plan, en)]))
  assert.equal(shown.includes('US$4.99'), true)
  assert.equal(shown.includes(String(BILLING_PLAN.monthlyReferencePrice)), false)
  assert.equal(shown.includes(String(BILLING_PLAN.annualReferencePrice)), false)
})

test('product load failure can be retried', async () => {
  let attempts = 0
  const { session } = fakeStore({ async listPackages() { if (++attempts === 1) throw new Error('offline'); return storePackages } })
  const failed = await loaded(session)
  assert.equal(failed.phase, 'load_failed')
  assert.deepEqual(failed.plans, [])
  assert.equal(canPurchase(failed), false)
  const retrying = run(failed, { type: 'load_started' })
  assert.equal(retrying.phase, 'loading')
  const ready = run(retrying, { type: 'packages_result', result: await session.packages() })
  assert.equal(ready.phase, 'ready')
  assert.equal(ready.plans.length, 2)

  const empty = await loaded(fakeStore({ async listPackages() { return [] } }).session)
  assert.equal(empty.phase, 'load_failed')
})

test('purchasing: one purchase at a time, and only with a selected plan', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  const purchasing = run(ready, { type: 'purchase_started' })
  assert.equal(purchasing.phase, 'purchasing')
  assert.equal(canPurchase(purchasing), false)
  assert.equal(run(purchasing, { type: 'purchase_started' }), purchasing)
  assert.equal(run(purchasing, { type: 'restore_started' }), purchasing)
  assert.equal(run(initialPaywallState, { type: 'purchase_started' }).phase, 'hidden')
  // A late result for a purchase this screen is not waiting on changes nothing.
  assert.equal(run(ready, { type: 'purchase_result', result: { status: 'ready', value: { awaitingServerSync: true } }, at: T0 }), ready)
})

test('user cancelling the store sheet is not an error', async () => {
  const { session } = fakeStore({ async purchase() { throw { userCancelled: true } } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'cancelled' })
  const after = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result, at: T0 })
  assert.equal(after.phase, 'ready')
  assert.equal(after.notice, null)
  assert.equal(after.waiting, null)
  assert.equal(canPurchase(after), true)
})

test('failed purchase returns to the plans with a message', async () => {
  const { session } = fakeStore({ async purchase() { throw new Error('store problem') } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'failed' })
  const after = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result, at: T0 })
  assert.equal(after.phase, 'ready')
  assert.equal(after.notice, 'purchase_failed')
  assert.equal(canPurchase(after), true)
  // Starting again clears the old message; so does coming back to the page.
  assert.equal(run(after, { type: 'purchase_started' }).notice, null)
  assert.equal(run(after, { type: 'opened' }).notice, null)
})

test('pending purchase (Ask to Buy, bank verification) locks purchasing until the server confirms', async () => {
  const { session } = fakeStore({ async purchase() { throw { paymentPending: true } } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'pending' })
  const pending = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result, at: T0 })
  assert.equal(pending.phase, 'pending')
  assert.equal(pending.waiting, 'approval')
  assert.equal(pending.waitingSince, T0)
  assert.equal(canPurchase(pending), false)
  assert.equal(run(pending, { type: 'purchase_started' }), pending)
  assert.equal(run(pending, { type: 'plan_selected', identifier: '$rc_annual' }), pending)
  assert.equal(run(pending, { type: 'opened' }), pending)
  // A restore that finds nothing does not lift the lock.
  const restoring = run(pending, { type: 'restore_started' })
  assert.equal(restoring.phase, 'restoring')
  const still = run(restoring, { type: 'restore_result', result: { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: false } }, at: T0 + 1 })
  assert.equal(still.phase, 'pending')
  assert.equal(still.notice, 'restore_nothing')
  assert.equal(canPurchase(still), false)
  // Approval reaches the server: the wait ends.
  const approved = run(pending, { type: 'server_confirmed' })
  assert.equal(approved.phase, 'ready')
  assert.equal(approved.notice, 'activated')
  assert.equal(approved.waiting, null)
})

test('store success only starts a wait for the server; it never marks the user as Pro', async () => {
  const { session, calls } = fakeStore()
  const ready = await loaded(session)
  const result = await session.purchase(ready.selected)
  assert.deepEqual(result, { status: 'ready', value: { awaitingServerSync: true } })
  assert.deepEqual(calls.at(-1), ['purchase', '$rc_monthly'])
  const syncing = run(ready, { type: 'purchase_started' }, { type: 'purchase_result', result, at: T0 })
  assert.equal(syncing.phase, 'syncing')
  assert.equal(syncing.waiting, 'purchase')
  assert.equal(syncing.waitingSince, T0)
  assert.equal(syncing.notice, null)
  // The state has no entitlement field at all — nothing for a screen to unlock from.
  assert.deepEqual(Object.keys(syncing).sort(), ['notice', 'phase', 'plans', 'resume', 'selected', 'waiting', 'waitingSince'])
  // Buying again, switching plan or restoring while waiting is ignored.
  assert.equal(canPurchase(syncing), false)
  assert.equal(run(syncing, { type: 'purchase_started' }), syncing)
  assert.equal(run(syncing, { type: 'plan_selected', identifier: '$rc_annual' }), syncing)
  assert.equal(run(syncing, { type: 'restore_started' }), syncing)

  const confirmed = run(syncing, { type: 'server_confirmed' })
  assert.equal(confirmed.phase, 'ready')
  assert.equal(confirmed.notice, 'activated')
  assert.equal(confirmed.waiting, null)
  // "Activated" is only reachable from a wait: the server event alone does nothing at rest.
  assert.equal(run(ready, { type: 'server_confirmed' }), ready)
})

test('slow sync keeps the purchase lock; restore is offered and cannot unlock it by finding nothing', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  const delayed = run(await bought(session, ready), { type: 'sync_timed_out' })
  assert.equal(delayed.phase, 'sync_delayed')
  assert.equal(delayed.waiting, 'purchase')
  assert.equal(canPurchase(delayed), false)
  assert.equal(run(delayed, { type: 'purchase_started' }), delayed)
  assert.equal(run(ready, { type: 'sync_timed_out' }), ready)

  const restoring = run(delayed, { type: 'restore_started' })
  assert.equal(restoring.phase, 'restoring')
  assert.equal(canPurchase(restoring), false)
  for (const result of [
    { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: false } },
    { status: 'failed' },
    { status: 'cancelled' },
  ]) {
    const back = run(restoring, { type: 'restore_result', result, at: T0 + 5 })
    assert.equal(back.phase, 'sync_delayed', result.status)
    assert.equal(back.waiting, 'purchase')
    assert.equal(back.waitingSince, T0)
    assert.equal(canPurchase(back), false)
  }
  // A restore that does find the subscription restarts the quick checks.
  const found = run(restoring, { type: 'restore_result', result: { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: true } }, at: T0 + 5 })
  assert.equal(found.phase, 'syncing')
  assert.equal(found.waitingSince, T0 + 5)
  // The server confirming late still lands.
  const late = run(delayed, { type: 'server_confirmed' })
  assert.equal(late.phase, 'ready')
  assert.equal(late.notice, 'activated')
})

test('server check schedule: fast, then slow, still running after the "longer than usual" message, stops at the limit', () => {
  const { firstMs, fastMs, delayedAfterMs, slowMs, stopAfterMs } = SYNC_LIMITS
  assert.equal(nextSyncDelay(0), firstMs)
  assert.equal(nextSyncDelay(firstMs), fastMs)
  assert.equal(syncIsDelayed(delayedAfterMs - 1), false)
  assert.equal(nextSyncDelay(delayedAfterMs - 1), fastMs)
  // Past the fast window the checks continue, just less often.
  assert.equal(syncIsDelayed(delayedAfterMs), true)
  assert.equal(nextSyncDelay(delayedAfterMs), slowMs)
  assert.equal(nextSyncDelay(stopAfterMs - 1), slowMs)
  // Total limit reached: no further timer.
  assert.equal(nextSyncDelay(stopAfterMs), null)
  assert.equal(nextSyncDelay(stopAfterMs + 60_000), null)
  // Each check is a fresh server read: both intervals outlast the 5 s shared-read window.
  assert.ok(fastMs > 5000 && slowMs > 5000)
  assert.ok(slowMs >= 10_000 && slowMs <= 30_000 && stopAfterMs >= 10 * 60_000)

  // Walk the whole schedule the way the card does, with a server that answers at a chosen moment.
  const walk = (confirmAtMs) => {
    let elapsed = 0; let checks = 0; let sawDelayed = false
    for (let delay = nextSyncDelay(elapsed); delay !== null; delay = nextSyncDelay(elapsed)) {
      elapsed += delay; checks++
      if (syncIsDelayed(elapsed)) sawDelayed = true
      if (elapsed >= confirmAtMs) return { confirmedAt: elapsed, checks, sawDelayed }
    }
    return { confirmedAt: null, stoppedAt: elapsed, checks, sawDelayed }
  }
  const quick = walk(10_000)
  assert.equal(quick.sawDelayed, false)
  assert.ok(quick.confirmedAt <= 10_000 + fastMs)
  // Server confirms ten minutes in — long after the message changed — and the next slow check still catches it.
  const late = walk(10 * 60_000)
  assert.equal(late.sawDelayed, true)
  assert.ok(late.confirmedAt >= 10 * 60_000 && late.confirmedAt < 10 * 60_000 + slowMs, `caught at ${late.confirmedAt}`)
  // Server never confirms: the walk ends at the limit after a bounded number of checks.
  const never = walk(Infinity)
  assert.equal(never.confirmedAt, null)
  assert.ok(never.stoppedAt >= stopAfterMs && never.stoppedAt < stopAfterMs + slowMs, `stopped at ${never.stoppedAt}`)
  assert.ok(never.checks > 20 && never.checks < 200, `${never.checks} checks`)

  // Waiting for someone's approval: slow from the start, same limit.
  assert.equal(nextSyncDelay(0, 'approval'), slowMs)
  assert.equal(nextSyncDelay(stopAfterMs, 'approval'), null)
  // Shortened limits (used by the browser test) follow the same rules.
  const short = { firstMs: 100, fastMs: 200, delayedAfterMs: 500, slowMs: 400, stopAfterMs: 2000 }
  assert.deepEqual([0, 100, 499, 500, 1999, 2000].map((ms) => nextSyncDelay(ms, 'sync', short)), [100, 200, 200, 400, 400, null])
})

test('restore that finds a subscription waits for the server like a purchase', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  const restoring = run(ready, { type: 'restore_started' })
  assert.equal(restoring.phase, 'restoring')
  const result = await session.restore()
  assert.deepEqual(result, { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: true } })
  const syncing = run(restoring, { type: 'restore_result', result, at: T0 })
  assert.equal(syncing.phase, 'syncing')
  assert.equal(syncing.waiting, 'restore')
  assert.equal(canPurchase(syncing), false)
  assert.equal(run(syncing, { type: 'server_confirmed' }).notice, 'activated')
})

test('restore with nothing to restore, and restore failure', async () => {
  const nothing = fakeStore({ async restore() { return { hasActiveSubscription: false } } }).session
  const ready = await loaded(nothing)
  const none = run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await nothing.restore(), at: T0 })
  assert.equal(none.phase, 'ready')
  assert.equal(none.notice, 'restore_nothing')
  assert.equal(canPurchase(none), true)
  // A store that reports nothing at all is treated as nothing found, not as success.
  const silent = fakeStore({ async restore() {} }).session
  assert.equal((await silent.restore()).value.hasActiveSubscription, false)

  const broken = fakeStore({ async restore() { throw new Error('network') } }).session
  const failed = run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await broken.restore(), at: T0 })
  assert.equal(failed.phase, 'ready')
  assert.equal(failed.notice, 'restore_failed')
})

test('restore stays available when products could not be loaded', async () => {
  const { session } = fakeStore({ async listPackages() { throw new Error('offline') }, async restore() { return { hasActiveSubscription: false } } })
  const failed = await loaded(session)
  const after = run(failed, { type: 'restore_started' }, { type: 'restore_result', result: await session.restore(), at: T0 })
  assert.equal(after.phase, 'load_failed')
  assert.equal(after.notice, 'restore_nothing')
})

test('session released mid-flow (sign-out) hides the card instead of showing a result', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  await session.dispose()
  const result = await session.purchase(ready.selected)
  assert.deepEqual(result, { status: 'sign_in_required' })
  assert.equal(run(ready, { type: 'purchase_started' }, { type: 'purchase_result', result, at: T0 }).phase, 'hidden')
  assert.equal(run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await session.restore(), at: T0 }).phase, 'hidden')
})

// ── State that outlives the membership page ────────────────────────────────
const newPaywall = () => createPaywallStore(paywallReducer, initialPaywallState, { type: 'opened' })

test('leaving the membership page and coming back: still syncing, still not purchasable', async () => {
  const { session, calls } = fakeStore()
  const paywall = newPaywall()
  let renders = 0
  const unsubscribe = paywall.subscribe(() => { renders++ })
  // First visit: load, buy the monthly plan.
  paywall.open(authenticatedUserId)
  paywall.dispatch(authenticatedUserId, { type: 'load_started' })
  paywall.dispatch(authenticatedUserId, { type: 'packages_result', result: await session.packages() })
  paywall.dispatch(authenticatedUserId, { type: 'purchase_started' })
  // The user leaves before the store answers; the result still lands in the store.
  unsubscribe()
  paywall.dispatch(authenticatedUserId, { type: 'purchase_result', result: await session.purchase('$rc_monthly'), at: T0 })
  assert.ok(renders >= 3)

  // Second visit: the card opens again for the same user.
  paywall.open(authenticatedUserId)
  const back = paywall.read(authenticatedUserId)
  assert.equal(back.phase, 'syncing')
  assert.equal(back.waitingSince, T0)
  assert.equal(canPurchase(back), false)
  // Tapping the yearly plan and subscribe now does nothing: no second purchase reaches the store.
  paywall.dispatch(authenticatedUserId, { type: 'plan_selected', identifier: '$rc_annual' })
  paywall.dispatch(authenticatedUserId, { type: 'purchase_started' })
  assert.equal(paywall.read(authenticatedUserId), back)
  assert.equal(calls.filter(([name]) => name === 'purchase').length, 1)
  // Same for the slow-sync and pending states.
  paywall.dispatch(authenticatedUserId, { type: 'sync_timed_out' })
  paywall.open(authenticatedUserId)
  assert.equal(paywall.read(authenticatedUserId).phase, 'sync_delayed')
  assert.equal(canPurchase(paywall.read(authenticatedUserId)), false)
  // The server confirming is what ends it.
  paywall.dispatch(authenticatedUserId, { type: 'server_confirmed' })
  assert.equal(paywall.read(authenticatedUserId).waiting, null)
})

test('pending approval also survives leaving the page', async () => {
  const { session } = fakeStore({ async purchase() { throw { paymentPending: true } } })
  const paywall = newPaywall()
  paywall.open(authenticatedUserId)
  paywall.dispatch(authenticatedUserId, { type: 'load_started' })
  paywall.dispatch(authenticatedUserId, { type: 'packages_result', result: await session.packages() })
  paywall.dispatch(authenticatedUserId, { type: 'purchase_started' })
  paywall.dispatch(authenticatedUserId, { type: 'purchase_result', result: await session.purchase('$rc_monthly'), at: T0 })
  paywall.open(authenticatedUserId)
  assert.equal(paywall.read(authenticatedUserId).phase, 'pending')
  assert.equal(canPurchase(paywall.read(authenticatedUserId)), false)
})

test('switching account or signing out wipes the purchase-screen state', async () => {
  const { session } = fakeStore()
  const paywall = newPaywall()
  const syncingFor = async (userId) => {
    paywall.open(userId)
    paywall.dispatch(userId, { type: 'load_started' })
    paywall.dispatch(userId, { type: 'packages_result', result: await session.packages() })
    paywall.dispatch(userId, { type: 'purchase_started' })
    paywall.dispatch(userId, { type: 'purchase_result', result: { status: 'ready', value: { awaitingServerSync: true } }, at: T0 })
    assert.equal(paywall.read(userId).phase, 'syncing')
  }
  await syncingFor(authenticatedUserId)
  // Another account never sees it, even before any auth event.
  assert.equal(paywall.read(otherUserId), initialPaywallState)
  assert.equal(paywall.read(undefined), initialPaywallState)

  // Sign-out.
  paywall.userChanged(null)
  assert.equal(paywall.read(authenticatedUserId), initialPaywallState)
  // A result that arrives for the signed-out user is dropped, not resurrected.
  paywall.dispatch(authenticatedUserId, { type: 'server_confirmed' })
  paywall.dispatch(authenticatedUserId, { type: 'load_started' })
  assert.equal(paywall.read(authenticatedUserId), initialPaywallState)

  // Direct switch to another account (token refresh for the same user changes nothing).
  await syncingFor(authenticatedUserId)
  paywall.userChanged(authenticatedUserId)
  assert.equal(paywall.read(authenticatedUserId).phase, 'syncing')
  paywall.userChanged(otherUserId)
  assert.equal(paywall.read(authenticatedUserId), initialPaywallState)
  paywall.open(otherUserId)
  assert.equal(paywall.read(otherUserId), initialPaywallState)
  assert.equal(canPurchase(paywall.read(otherUserId)), false)
  // The first account's late purchase result cannot touch the second account's screen.
  paywall.dispatch(authenticatedUserId, { type: 'purchase_result', result: { status: 'ready', value: {} }, at: T0 })
  assert.equal(paywall.read(otherUserId), initialPaywallState)
  // Opening the card for a different user without an auth event in between also starts clean.
  await syncingFor(otherUserId)
  paywall.open(authenticatedUserId)
  assert.equal(paywall.read(authenticatedUserId), initialPaywallState)
  assert.equal(paywall.read(otherUserId), initialPaywallState)
})

// ── Free trial (Apple introductory offer) ──────────────────────────────────
test('free trial lengths and billing periods are composed from store values, singular and plural', () => {
  const cases = [
    [{ unit: 'DAY', count: 1 }, '1 天', '1 day'], [{ unit: 'DAY', count: 3 }, '3 天', '3 days'], [{ unit: 'DAY', count: 14 }, '14 天', '14 days'],
    [{ unit: 'WEEK', count: 1 }, '1 週', '1 week'], [{ unit: 'WEEK', count: 2 }, '2 週', '2 weeks'],
    [{ unit: 'MONTH', count: 1 }, '1 個月', '1 month'], [{ unit: 'MONTH', count: 2 }, '2 個月', '2 months'],
    [{ unit: 'YEAR', count: 1 }, '1 年', '1 year'], [{ unit: 'YEAR', count: 2 }, '2 年', '2 years'],
  ]
  for (const [trial, chinese, english] of cases) {
    assert.equal(trialLength(trial, zh), chinese)
    assert.equal(trialLength(trial, en), english)
  }
  const [monthly, yearly] = toPlans(storePackages)
  assert.equal(planPrice(monthly, zh), 'NT$150.00／月')
  assert.equal(planPrice(yearly, zh), 'NT$990.00／年')
  assert.equal(planPrice(monthly, en), 'NT$150.00 / month')
  assert.equal(planPrice(yearly, en), 'NT$990.00 / year')
})

test('plan with a free trial the user may take: length and the price after it are stated everywhere', () => {
  const [monthly, yearly] = toPlans([
    { identifier: '$rc_monthly', localizedPrice: 'NT$150.00', subscriptionPeriod: 'P1M', freeTrial: { unit: 'WEEK', count: 2 } },
    { identifier: '$rc_annual', localizedPrice: 'NT$990.00', subscriptionPeriod: 'P1Y', freeTrial: { unit: 'DAY', count: 14 } },
  ])
  assert.deepEqual(monthly.trial, { unit: 'WEEK', count: 2 })
  const chinese = planCopy(monthly, zh)
  assert.equal(chinese.detail, '前 2 週免費，之後 NT$150.00／月')
  assert.equal(chinese.cta, '開始 2 週免費試用')
  assert.equal(chinese.price, 'NT$150.00／月')
  assert.ok(chinese.terms.includes('免費試用 2 週') && chinese.terms.includes('試用結束後會自動以 NT$150.00／月') && chinese.terms.includes('試用結束前至少 24 小時取消'))
  const english = planCopy(monthly, en)
  assert.equal(english.detail, 'Free for 2 weeks, then NT$150.00 / month')
  assert.equal(english.cta, 'Try free for 2 weeks')
  assert.ok(english.terms.includes('charged NT$150.00 / month automatically') && english.terms.includes('at least 24 hours before the trial ends'))
  assert.equal(/[㐀-鿿]/.test(JSON.stringify(english)), false)
  // The yearly plan carries its own trial and its own price.
  assert.equal(planCopy(yearly, zh).detail, '前 14 天免費，之後 NT$990.00／年')
  assert.equal(planCopy(yearly, zh).cta, '開始 14 天免費試用')
  assert.equal(planCopy(yearly, en).detail, 'Free for 14 days, then NT$990.00 / year')
})

test('no free trial reported for the plan: the regular price screen, no mention of a trial', () => {
  for (const freeTrial of [undefined, null, { unit: 'FORTNIGHT', count: 1 }, { unit: 'WEEK', count: 0 }, { unit: 'WEEK', count: 1.5 }, { unit: 'DAY', count: NaN }]) {
    const [monthly] = toPlans([{ identifier: '$rc_monthly', localizedPrice: 'NT$150.00', subscriptionPeriod: 'P1M', freeTrial }])
    assert.equal(monthly.trial, null)
    for (const t of [zh, en]) {
      const copy = planCopy(monthly, t)
      assert.equal(/試用|免費|free|trial/i.test(JSON.stringify(copy)), false, JSON.stringify(freeTrial))
    }
    assert.equal(planCopy(monthly, zh).cta, '訂閱 · NT$150.00／月')
    assert.equal(planCopy(monthly, zh).detail, '每月自動續訂')
    assert.equal(planCopy(monthly, en).cta, 'Subscribe · NT$150.00 / month')
  }
})

test('every billing string has an English entry and no Chinese is left in it', () => {
  for (const [key, value] of Object.entries(billingEnglish)) {
    assert.equal(/[㐀-鿿]/.test(value), false, key)
    for (const placeholder of key.match(/\{[a-z]+\}/g) ?? []) assert.ok(value.includes(placeholder), `${key} lost ${placeholder}`)
  }
  const [trialPlan] = toPlans([{ identifier: 'm', localizedPrice: '$1', subscriptionPeriod: 'P1M', freeTrial: { unit: 'MONTH', count: 1 } }])
  const [plainPlan] = toPlans([{ identifier: 'y', localizedPrice: '$1', subscriptionPeriod: 'P1Y' }])
  const used = []
  const spy = (text, vars) => { used.push(text); return fill(text, vars) }
  planCopy(trialPlan, spy); planCopy(plainPlan, spy)
  for (const key of used) assert.ok(key in billingEnglish, `missing English for: ${key}`)
})

// ── Store session lifecycle ─────────────────────────────────────────────────
test('session store: one session per signed-in user, old one fully released before the next starts', async () => {
  const log = []
  const store = createBillingSessionStore(async (userId) => {
    log.push(`load ${userId}`)
    return { userId, async dispose() { await Promise.resolve(); log.push(`dispose ${userId}`) } }
  })
  const first = await store.acquire('a')
  assert.equal(await store.acquire('a'), first)
  await store.userChanged('a')
  assert.deepEqual(log, ['load a'])

  const second = await store.acquire('b')
  assert.equal(second.userId, 'b')
  assert.deepEqual(log, ['load a', 'dispose a', 'load b'])

  await store.userChanged(null)
  assert.deepEqual(log, ['load a', 'dispose a', 'load b', 'dispose b'])
  await store.userChanged(null)
  assert.equal(log.length, 4)

  await store.acquire('b')
  assert.equal(log.at(-1), 'load b')
})

test('session store: a failed load is not cached', async () => {
  let attempts = 0
  const store = createBillingSessionStore(async (userId) => {
    if (++attempts === 1) throw new Error('sdk import failed')
    return { userId, async dispose() {} }
  })
  await assert.rejects(store.acquire('a'))
  assert.equal((await store.acquire('a')).userId, 'a')
  assert.equal(attempts, 2)
})

test('session store with the real adapter: App User ID is the signed-in user, sign-out logs the store out', async () => {
  const { session, calls } = fakeStore()
  const store = createBillingSessionStore(async () => session)
  const acquired = await store.acquire(authenticatedUserId)
  await acquired.packages()
  assert.deepEqual(calls[0], ['configure', authenticatedUserId])
  await store.userChanged(null)
  assert.deepEqual(calls.at(-1), ['logOut'])
  assert.equal((await acquired.purchase('$rc_monthly')).status, 'sign_in_required')
})
