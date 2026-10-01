import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createRevenueCatDriver, PURCHASE_CANCELLED_CODE, PAYMENT_PENDING_CODE } from '../../lib/billing/revenuecat-driver.ts'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
const id = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
function fixture() {
  const state = { user: '', configured: false, purchases: 0, restored: 0, logins: 0 }
  const packageObject = { identifier: '$rc_monthly', product: { priceString: 'NT$149.00', subscriptionPeriod: 'P1M' } }
  const sdk = {
    async isConfigured() { return { isConfigured: state.configured } },
    async configure(options) { state.user = options.appUserID; state.configured = true; assert.equal(options.apiKey, 'public-test') },
    async logIn(options) { state.user = options.appUserID; state.logins++ },
    async getAppUserID() { return { appUserID: state.user } },
    async getOfferings() { return { current: { availablePackages: [packageObject] } } },
    async purchasePackage(options) { assert.equal(options.aPackage, packageObject); state.purchases++ },
    async restorePurchases() { state.restored++ },
    async logOut() { state.user = '$anonymous' },
  }
  return { state, sdk, driver: createRevenueCatDriver(sdk) }
}
test('maps real SDK signatures, localized price, package object, restore and login', async () => {
  const { driver, state } = fixture()
  await driver.configure({ publicApiKey: 'public-test', appUserID: id })
  assert.deepEqual(await driver.listPackages(), [{ identifier: '$rc_monthly', localizedPrice: 'NT$149.00', subscriptionPeriod: 'P1M' }])
  await driver.purchase('$rc_monthly'); await driver.restore()
  assert.equal(state.purchases, 1); assert.equal(state.restored, 1)
  await assert.rejects(driver.purchase('invented-product'))
  await driver.configure({ publicApiKey: 'public-test', appUserID: id }); assert.equal(state.logins, 1)
})
test('stale session cannot purchase or log out another current account', async () => {
  const { driver, state } = fixture(); await driver.configure({ publicApiKey: 'public-test', appUserID: id })
  state.user = 'another-user'; await assert.rejects(driver.purchase('$rc_monthly')); await driver.logOut()
  assert.equal(state.user, 'another-user'); assert.equal(state.purchases, 0)
})
test('user cancellation stays cancellation, never fake success or entitlement grant', async () => {
  const { driver, sdk } = fixture(); sdk.purchasePackage = async () => { throw { userCancelled: true } }
  const session = createNativeBillingSession({ driver, publicApiKey: 'public-test', authenticatedUserId: id, purchasesEnabled: true })
  assert.deepEqual(await session.purchase('$rc_monthly'), { status: 'cancelled' })
})
test('Capacitor bridge error codes: cancelled and pending are told apart from failure', async () => {
  // The native bridge rejects with { message, code } only — no userCancelled field.
  const outcome = async (error) => {
    const { driver, sdk } = fixture(); sdk.purchasePackage = async () => { throw error }
    const session = createNativeBillingSession({ driver, publicApiKey: 'public-test', authenticatedUserId: id, purchasesEnabled: true })
    return (await session.purchase('$rc_monthly')).status
  }
  assert.equal(await outcome({ code: PURCHASE_CANCELLED_CODE, message: 'Purchase was cancelled.' }), 'cancelled')
  assert.equal(await outcome({ code: PAYMENT_PENDING_CODE, message: 'The payment is pending.' }), 'pending')
  assert.equal(await outcome({ code: '2', message: 'There was a problem with the App Store.' }), 'failed')
  assert.equal(await outcome(new Error('unknown')), 'failed')
})
test('error code constants match the installed RevenueCat SDK', () => {
  const require = createRequire(import.meta.url)
  const plugin = path.dirname(require.resolve('@revenuecat/purchases-capacitor/package.json'))
  const internal = path.dirname(require.resolve('@revenuecat/purchases-typescript-internal-esm/package.json', { paths: [plugin] }))
  const source = fs.readFileSync(path.join(internal, 'dist/generated/error-codes.js'), 'utf8')
  const code = (name) => source.match(new RegExp(`\\["${name}"\\] = "(\\d+)"`))?.[1]
  assert.equal(code('PURCHASE_CANCELLED_ERROR'), PURCHASE_CANCELLED_CODE)
  assert.equal(code('PAYMENT_PENDING_ERROR'), PAYMENT_PENDING_CODE)
})
test('restore reports whether the store account holds anything active, and stays a hint', async () => {
  const { driver, sdk } = fixture(); await driver.configure({ publicApiKey: 'public-test', appUserID: id })
  assert.deepEqual(await driver.restore(), { hasActiveSubscription: false })
  sdk.restorePurchases = async () => ({ customerInfo: { entitlements: { active: {} }, activeSubscriptions: [] } })
  assert.deepEqual(await driver.restore(), { hasActiveSubscription: false })
  sdk.restorePurchases = async () => ({ customerInfo: { entitlements: { active: { pro: {} } }, activeSubscriptions: ['huddle_pro_monthly'] } })
  assert.deepEqual(await driver.restore(), { hasActiveSubscription: true })
  const session = createNativeBillingSession({ driver, publicApiKey: 'public-test', authenticatedUserId: id, purchasesEnabled: true })
  assert.deepEqual(await session.restore(), { status: 'ready', value: { awaitingServerSync: true, hasActiveSubscription: true } })
})
