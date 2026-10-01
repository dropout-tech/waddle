// Purchase-screen states, driven through the real adapter with a fake store.
// Run: node --experimental-strip-types --test scripts/tests/billing-*.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
import { createBillingSessionStore } from '../../lib/billing/session-store.ts'
import { BILLING_PLAN } from '../../lib/billing/plans.ts'
import {
  initialPaywallState, paywallReducer, toPlans, nextSyncDelay,
  SYNC_FIRST_DELAY_MS, SYNC_INTERVAL_MS, SYNC_MAX_WAIT_MS,
} from '../../lib/billing/paywall-state.ts'

const authenticatedUserId = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
const storePackages = [
  { identifier: '$rc_annual', localizedPrice: 'NT$1,290.00', subscriptionPeriod: 'P1Y' },
  { identifier: '$rc_monthly', localizedPrice: 'NT$149.00', subscriptionPeriod: 'P1M' },
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
/** Loads products the way the card does and returns the resting state. */
async function loaded(session) {
  return run(initialPaywallState, { type: 'load_started' }, { type: 'packages_result', result: await session.packages() })
}

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
    { identifier: '$rc_monthly', period: 'month', localizedPrice: 'NT$149.00' },
    { identifier: '$rc_annual', period: 'year', localizedPrice: 'NT$1,290.00' },
  ])
  assert.equal(ready.selected, '$rc_monthly')
  assert.equal(run(ready, { type: 'plan_selected', identifier: '$rc_annual' }).selected, '$rc_annual')
  assert.equal(run(ready, { type: 'plan_selected', identifier: 'invented' }).selected, '$rc_monthly')
})

test('checkout price only ever comes from the store, never from the reference amounts', () => {
  // The period label follows what the store bills, not the package name.
  assert.deepEqual(toPlans([{ identifier: '$rc_monthly', localizedPrice: '¥9,800', subscriptionPeriod: 'P1Y' }]),
    [{ identifier: '$rc_monthly', period: 'year', localizedPrice: '¥9,800' }])
  // No period, an unsupported period, or no price: not offered at all.
  assert.deepEqual(toPlans([
    { identifier: '$rc_monthly', localizedPrice: 'NT$149.00' },
    { identifier: '$rc_weekly', localizedPrice: 'NT$50.00', subscriptionPeriod: 'P1W' },
    { identifier: '$rc_annual', localizedPrice: ' ', subscriptionPeriod: 'P1Y' },
  ]), [])
  const shown = JSON.stringify(toPlans(storePackages.map((item) => ({ ...item, localizedPrice: 'US$4.99' }))))
  assert.equal(shown.includes(String(BILLING_PLAN.monthlyReferencePrice)), false)
  assert.equal(shown.includes(String(BILLING_PLAN.annualReferencePrice)), false)
})

test('product load failure can be retried', async () => {
  let attempts = 0
  const { session } = fakeStore({ async listPackages() { if (++attempts === 1) throw new Error('offline'); return storePackages } })
  const failed = await loaded(session)
  assert.equal(failed.phase, 'load_failed')
  assert.deepEqual(failed.plans, [])
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
  assert.equal(run(purchasing, { type: 'purchase_started' }), purchasing)
  assert.equal(run(purchasing, { type: 'restore_started' }), purchasing)
  assert.equal(run(initialPaywallState, { type: 'purchase_started' }).phase, 'hidden')
  // A late result for a purchase this screen is not waiting on changes nothing.
  assert.equal(run(ready, { type: 'purchase_result', result: { status: 'ready', value: { awaitingServerSync: true } } }), ready)
})

test('user cancelling the store sheet is not an error', async () => {
  const { session } = fakeStore({ async purchase() { throw { userCancelled: true } } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'cancelled' })
  const after = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result })
  assert.equal(after.phase, 'ready')
  assert.equal(after.notice, null)
  assert.equal(after.plans.length, 2)
})

test('failed purchase returns to the plans with a message', async () => {
  const { session } = fakeStore({ async purchase() { throw new Error('store problem') } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'failed' })
  const after = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result })
  assert.equal(after.phase, 'ready')
  assert.equal(after.notice, 'purchase_failed')
  // Starting again clears the old message.
  assert.equal(run(after, { type: 'purchase_started' }).notice, null)
})

test('pending purchase (Ask to Buy, bank verification) is neither success nor failure', async () => {
  const { session } = fakeStore({ async purchase() { throw { paymentPending: true } } })
  const result = await session.purchase('$rc_monthly')
  assert.deepEqual(result, { status: 'pending' })
  const after = run(await loaded(session), { type: 'purchase_started' }, { type: 'purchase_result', result })
  assert.equal(after.phase, 'ready')
  assert.equal(after.notice, 'purchase_pending')
  assert.equal(after.syncing, null)
})

test('store success only starts a wait for the server; it never marks the user as Pro', async () => {
  const { session, calls } = fakeStore()
  const ready = await loaded(session)
  const result = await session.purchase(ready.selected)
  assert.deepEqual(result, { status: 'ready', value: { awaitingServerSync: true } })
  assert.deepEqual(calls.at(-1), ['purchase', '$rc_monthly'])
  const syncing = run(ready, { type: 'purchase_started' }, { type: 'purchase_result', result })
  assert.equal(syncing.phase, 'syncing')
  assert.equal(syncing.syncing, 'purchase')
  assert.equal(syncing.notice, null)
  // The state has no entitlement field at all — nothing for a screen to unlock from.
  assert.deepEqual(Object.keys(syncing).sort(), ['notice', 'phase', 'plans', 'selected', 'syncing'])
  // Buying again or restoring while waiting is ignored.
  assert.equal(run(syncing, { type: 'purchase_started' }), syncing)
  assert.equal(run(syncing, { type: 'restore_started' }), syncing)

  const confirmed = run(syncing, { type: 'server_confirmed' })
  assert.equal(confirmed.phase, 'ready')
  assert.equal(confirmed.notice, 'activated')
  // "Activated" is only reachable from a wait: the server event alone does nothing at rest.
  assert.equal(run(ready, { type: 'server_confirmed' }), ready)
})

test('server still silent at the limit: slow-sync state, restore offered, late confirmation still lands', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  const syncing = run(ready, { type: 'purchase_started' }, { type: 'purchase_result', result: await session.purchase(ready.selected) })
  const delayed = run(syncing, { type: 'sync_timed_out' })
  assert.equal(delayed.phase, 'sync_delayed')
  assert.equal(delayed.notice, null)
  assert.equal(run(delayed, { type: 'purchase_started' }), delayed)
  assert.equal(run(delayed, { type: 'restore_started' }).phase, 'restoring')
  assert.equal(run(delayed, { type: 'server_confirmed' }).notice, 'activated')
  assert.equal(run(ready, { type: 'sync_timed_out' }), ready)
})

test('server polling schedule is bounded', () => {
  assert.equal(nextSyncDelay(0), SYNC_FIRST_DELAY_MS)
  assert.equal(nextSyncDelay(SYNC_FIRST_DELAY_MS), SYNC_INTERVAL_MS)
  assert.equal(nextSyncDelay(SYNC_MAX_WAIT_MS), null)
  assert.equal(nextSyncDelay(SYNC_MAX_WAIT_MS - SYNC_INTERVAL_MS + 1), null)
  // Walk the whole schedule: it ends, within the limit, after a sane number of checks.
  let elapsed = 0; let checks = 0
  for (let delay = nextSyncDelay(elapsed); delay !== null; delay = nextSyncDelay(elapsed)) { elapsed += delay; checks++ }
  assert.ok(elapsed <= SYNC_MAX_WAIT_MS && elapsed > SYNC_MAX_WAIT_MS - SYNC_INTERVAL_MS, `waited ${elapsed} ms`)
  assert.ok(checks >= 10 && checks <= 30, `${checks} checks`)
  // Each check is a fresh server read: the interval outlasts the 5 s shared-read window.
  assert.ok(SYNC_INTERVAL_MS > 5000)
  assert.equal(nextSyncDelay(0, 1000), 1000)
  assert.equal(nextSyncDelay(1000, 1000), null)
})

test('restore that finds a subscription waits for the server like a purchase', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  const restoring = run(ready, { type: 'restore_started' })
  assert.equal(restoring.phase, 'restoring')
  const result = await session.restore()
  assert.deepEqual(result, { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: true } })
  const syncing = run(restoring, { type: 'restore_result', result })
  assert.equal(syncing.phase, 'syncing')
  assert.equal(syncing.syncing, 'restore')
  assert.equal(run(syncing, { type: 'server_confirmed' }).notice, 'activated')
})

test('restore with nothing to restore, and restore failure', async () => {
  const nothing = fakeStore({ async restore() { return { hasActiveSubscription: false } } }).session
  const ready = await loaded(nothing)
  const none = run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await nothing.restore() })
  assert.equal(none.phase, 'ready')
  assert.equal(none.notice, 'restore_nothing')
  // A store that reports nothing at all is treated as nothing found, not as success.
  const silent = fakeStore({ async restore() {} }).session
  assert.equal((await silent.restore()).value.hasActiveSubscription, false)

  const broken = fakeStore({ async restore() { throw new Error('network') } }).session
  const failed = run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await broken.restore() })
  assert.equal(failed.phase, 'ready')
  assert.equal(failed.notice, 'restore_failed')
})

test('restore stays available when products could not be loaded', async () => {
  const { session } = fakeStore({ async listPackages() { throw new Error('offline') }, async restore() { return { hasActiveSubscription: false } } })
  const failed = await loaded(session)
  const after = run(failed, { type: 'restore_started' }, { type: 'restore_result', result: await session.restore() })
  assert.equal(after.phase, 'load_failed')
  assert.equal(after.notice, 'restore_nothing')
})

test('session released mid-flow (sign-out) hides the card instead of showing a result', async () => {
  const { session } = fakeStore()
  const ready = await loaded(session)
  await session.dispose()
  const result = await session.purchase(ready.selected)
  assert.deepEqual(result, { status: 'sign_in_required' })
  assert.equal(run(ready, { type: 'purchase_started' }, { type: 'purchase_result', result }).phase, 'hidden')
  assert.equal(run(ready, { type: 'restore_started' }, { type: 'restore_result', result: await session.restore() }).phase, 'hidden')
})

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
