import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createRevenueCatDriver, PURCHASE_CANCELLED_CODE, PAYMENT_PENDING_CODE, INTRO_ELIGIBLE_STATUS } from '../../lib/billing/revenuecat-driver.ts'
import { toPlans } from '../../lib/billing/paywall-state.ts'
import { planCopy } from '../../lib/billing/paywall-copy.ts'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
const id = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
function fixture() {
  const state = { user: '', configured: false, purchases: 0, restored: 0, logins: 0 }
  const packageObject = { identifier: '$rc_monthly', product: { priceString: 'NT$150.00', subscriptionPeriod: 'P1M' } }
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
  assert.deepEqual(await driver.listPackages(), [{ identifier: '$rc_monthly', localizedPrice: 'NT$150.00', subscriptionPeriod: 'P1M', freeTrial: null }])
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
  const offerings = fs.readFileSync(path.join(internal, 'dist/offerings.js'), 'utf8')
  assert.equal(Number(offerings.match(/\["INTRO_ELIGIBILITY_STATUS_ELIGIBLE"\] = (\d+)/)?.[1]), INTRO_ELIGIBLE_STATUS)
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

// ── Free trial: product.introPrice + checkTrialOrIntroductoryPriceEligibility ──
// Shapes follow the installed SDK: introPrice { price, priceString, period, periodUnit, periodNumberOfUnits, cycles },
// eligibility { [productId]: { status, description } } with status 0 unknown / 1 ineligible / 2 eligible / 3 no offer.
const twoWeeksFree = { price: 0, priceString: 'NT$0.00', period: 'P2W', periodUnit: 'WEEK', periodNumberOfUnits: 2, cycles: 1 }
async function trialFixture({ monthlyIntro = twoWeeksFree, annualIntro = twoWeeksFree, eligibility }) {
  const asked = []
  const state = { user: '' }
  const product = (identifier, priceString, subscriptionPeriod, introPrice) => ({ identifier, priceString, subscriptionPeriod, introPrice })
  const sdk = {
    async isConfigured() { return { isConfigured: false } },
    async configure(options) { state.user = options.appUserID },
    async getAppUserID() { return { appUserID: state.user } },
    async getOfferings() {
      return { current: { availablePackages: [
        { identifier: '$rc_monthly', product: product('huddle_pro_monthly', 'NT$150.00', 'P1M', monthlyIntro) },
        { identifier: '$rc_annual', product: product('huddle_pro_annual', 'NT$990.00', 'P1Y', annualIntro) },
      ] } }
    },
    async checkTrialOrIntroductoryPriceEligibility(options) { asked.push(options.productIdentifiers); return eligibility() },
  }
  const driver = createRevenueCatDriver(sdk)
  await driver.configure({ publicApiKey: 'public-test', appUserID: id })
  const packages = await driver.listPackages()
  const [monthly, yearly] = toPlans(packages)
  const zh = (text, vars = {}) => Object.entries(vars).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text)
  return { asked, packages, monthly, yearly, copy: { monthly: planCopy(monthly, zh), yearly: planCopy(yearly, zh) } }
}
const status = (value) => ({ status: value, description: 'test' })

test('trial offered and the user is eligible: shown with the store length and the price after it', async () => {
  const { asked, monthly, yearly, copy } = await trialFixture({
    eligibility: () => ({ huddle_pro_monthly: status(2), huddle_pro_annual: status(2) }),
  })
  assert.deepEqual(asked, [['huddle_pro_monthly', 'huddle_pro_annual']])
  assert.deepEqual(monthly.trial, { unit: 'WEEK', count: 2 })
  assert.deepEqual(yearly.trial, { unit: 'WEEK', count: 2 })
  assert.equal(copy.monthly.detail, '前 2 週免費，之後 NT$150.00／月')
  assert.equal(copy.monthly.cta, '開始 2 週免費試用')
  assert.equal(copy.yearly.detail, '前 2 週免費，之後 NT$990.00／年')
})
test('trial offered but the user is not eligible (already used it): regular price screen', async () => {
  const { monthly, yearly, copy } = await trialFixture({
    eligibility: () => ({ huddle_pro_monthly: status(1), huddle_pro_annual: status(1) }),
  })
  assert.equal(monthly.trial, null)
  assert.equal(yearly.trial, null)
  assert.equal(copy.monthly.cta, '訂閱 · NT$150.00／月')
  assert.equal(/試用|免費/.test(JSON.stringify(copy)), false)
})
test('product has no trial: eligibility is not even asked, regular price screen', async () => {
  const { asked, packages, copy } = await trialFixture({
    monthlyIntro: null, annualIntro: null,
    eligibility: () => { throw new Error('must not be called') },
  })
  assert.deepEqual(asked, [])
  assert.deepEqual(packages.map((item) => item.freeTrial), [null, null])
  assert.equal(copy.yearly.cta, '訂閱 · NT$990.00／年')
  assert.equal(/試用|免費/.test(JSON.stringify(copy)), false)
})
test('eligibility unknown, missing or failing: never promise a free trial', async () => {
  const cases = {
    'check rejects': () => { throw new Error('network') },
    'status unknown': () => ({ huddle_pro_monthly: status(0), huddle_pro_annual: status(0) }),
    'no offer exists': () => ({ huddle_pro_monthly: status(3), huddle_pro_annual: status(3) }),
    'empty answer': () => ({}),
    'no answer': () => undefined,
    'malformed answer': () => ({ huddle_pro_monthly: null, huddle_pro_annual: { status: '2' } }),
  }
  for (const [name, eligibility] of Object.entries(cases)) {
    const { packages, copy } = await trialFixture({ eligibility })
    assert.deepEqual(packages.map((item) => item.freeTrial), [null, null], name)
    assert.equal(/試用|免費/.test(JSON.stringify(copy)), false, name)
    assert.equal(copy.monthly.cta, '訂閱 · NT$150.00／月', name)
  }
})
test('eligibility is per product; a paid introductory offer is not presented as a trial', async () => {
  const halfPrice = { price: 75, priceString: 'NT$75.00', period: 'P1M', periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 }
  const mixed = await trialFixture({
    annualIntro: halfPrice,
    eligibility: () => ({ huddle_pro_monthly: status(2), huddle_pro_annual: status(2) }),
  })
  // Only the free one is asked about and shown; the paid offer falls back to the regular price.
  assert.deepEqual(mixed.asked, [['huddle_pro_monthly']])
  assert.deepEqual(mixed.monthly.trial, { unit: 'WEEK', count: 2 })
  assert.equal(mixed.yearly.trial, null)
  assert.equal(mixed.copy.yearly.cta, '訂閱 · NT$990.00／年')
  assert.equal(JSON.stringify(mixed.copy.yearly).includes('75'), false)

  const onlyMonthly = await trialFixture({ eligibility: () => ({ huddle_pro_monthly: status(2), huddle_pro_annual: status(1) }) })
  assert.deepEqual(onlyMonthly.monthly.trial, { unit: 'WEEK', count: 2 })
  assert.equal(onlyMonthly.yearly.trial, null)

  // A 14-day trial reported in days stays in days.
  const days = await trialFixture({
    monthlyIntro: { price: 0, priceString: 'NT$0.00', period: 'P14D', periodUnit: 'DAY', periodNumberOfUnits: 14, cycles: 1 },
    eligibility: () => ({ huddle_pro_monthly: status(2), huddle_pro_annual: status(2) }),
  })
  assert.equal(days.copy.monthly.cta, '開始 14 天免費試用')
})
