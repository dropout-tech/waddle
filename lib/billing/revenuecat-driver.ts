import type { PurchasesPlugin } from '@revenuecat/purchases-capacitor'
import type { NativeBillingDriver } from './native-adapter'

type RevenueCatSDK = Pick<PurchasesPlugin, 'configure' | 'isConfigured' | 'logIn' | 'logOut' | 'getAppUserID' | 'getOfferings' | 'purchasePackage' | 'restorePurchases'>

/** Concrete driver for @revenuecat/purchases-capacitor; SDK is injected for native loading and tests. */
export function createRevenueCatDriver(sdk: RevenueCatSDK): NativeBillingDriver {
  let expectedUserId: string | undefined
  async function verifyIdentity() {
    if (!expectedUserId || (await sdk.getAppUserID()).appUserID !== expectedUserId) {
      throw new Error('Billing account changed; create a new authenticated session')
    }
  }
  return {
    async configure({ publicApiKey, appUserID }) {
      if ((await sdk.isConfigured()).isConfigured) {
        await sdk.logIn({ appUserID })
      } else {
        await sdk.configure({ apiKey: publicApiKey, appUserID })
      }
      expectedUserId = appUserID
      await verifyIdentity()
    },
    async listPackages() {
      await verifyIdentity()
      const offerings = await sdk.getOfferings()
      return (offerings.current?.availablePackages ?? []).map((item) => ({
        identifier: item.identifier,
        localizedPrice: item.product.priceString,
      }))
    },
    async purchase(packageIdentifier) {
      await verifyIdentity()
      const offerings = await sdk.getOfferings()
      const selected = offerings.current?.availablePackages.find((item) => item.identifier === packageIdentifier)
      if (!selected) throw new Error('Package is not available in the current offering')
      await verifyIdentity()
      await sdk.purchasePackage({ aPackage: selected })
    },
    async restore() {
      await verifyIdentity()
      await sdk.restorePurchases()
    },
    async logOut() {
      // Disposing an old UI session must not log a newer account out of the shared native SDK.
      if (expectedUserId && (await sdk.getAppUserID()).appUserID === expectedUserId) await sdk.logOut()
      expectedUserId = undefined
    },
  }
}
