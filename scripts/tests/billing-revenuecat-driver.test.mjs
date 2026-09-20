import test from 'node:test'
import assert from 'node:assert/strict'
import { createRevenueCatDriver } from '../../lib/billing/revenuecat-driver.ts'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
const id = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
function fixture() {
  const state = { user: '', configured: false, purchases: 0, restored: 0, logins: 0 }
  const packageObject = { identifier: '$rc_monthly', product: { priceString: 'NT$149.00' } }
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
  assert.deepEqual(await driver.listPackages(), [{ identifier: '$rc_monthly', localizedPrice: 'NT$149.00' }])
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
