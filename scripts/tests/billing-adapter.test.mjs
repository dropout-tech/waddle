import test from 'node:test'
import assert from 'node:assert/strict'
import { createNativeBillingSession } from '../../lib/billing/native-adapter.ts'
import { hasCurrentPro, billingAvailability } from '../../lib/billing/plans.ts'
const authenticatedUserId = 'e33d985b-4bcb-456f-9658-9cc1085185ab'
test('missing SDK / disabled purchases and unsupported platform fail closed', async () => {
  assert.equal((await createNativeBillingSession({ authenticatedUserId }).packages()).status, 'not_configured')
  assert.equal((await createNativeBillingSession({ authenticatedUserId: 'user@example.test' }).packages()).status, 'sign_in_required')
  assert.equal(billingAvailability('desktop', authenticatedUserId), 'unsupported_platform')
  assert.equal(billingAvailability('ios', authenticatedUserId), 'not_configured')
  assert.equal(hasCurrentPro({ expires_at: '2020-01-01' }), false)
})
test('same stable UUID configures once and purchase only requests backend sync', async () => {
  let configured = 0; let loggedOut = false
  const session = createNativeBillingSession({ authenticatedUserId, publicApiKey: 'public-test', purchasesEnabled: true, driver: {
    async configure(options) { assert.equal(options.appUserID, authenticatedUserId); configured++ },
    async listPackages() { return [{ identifier: 'monthly', localizedPrice: 'NT$149' }] },
    async purchase(id) { assert.equal(id, 'monthly') }, async restore() {}, async logOut() { loggedOut = true },
  } })
  const [packages, purchase] = await Promise.all([session.packages(), session.purchase('monthly')])
  assert.equal(configured, 1); assert.equal(packages.status, 'ready')
  assert.deepEqual(purchase, { status: 'ready', value: { awaitingServerSync: true } })
  await session.dispose(); assert.equal(loggedOut, true); assert.equal((await session.restore()).status, 'sign_in_required')
})
