import type { PurchasesPlugin } from '@revenuecat/purchases-capacitor'
import type { NativeBillingDriver } from './native-adapter'

type RevenueCatSDK = Pick<PurchasesPlugin, 'configure' | 'isConfigured' | 'logIn' | 'logOut' | 'getAppUserID' | 'getOfferings' | 'purchasePackage' | 'restorePurchases' | 'checkTrialOrIntroductoryPriceEligibility'>

/**
 * The Capacitor bridge rejects with only { message, code } — on iOS there is no
 * userCancelled field (plugin PluginHelperExtensions.swift: call.reject(message, code, error)).
 * These are PURCHASES_ERROR_CODE values; scripts/tests/billing-revenuecat-driver.test.mjs
 * pins them against the installed SDK.
 */
export const PURCHASE_CANCELLED_CODE = '1'
export const PAYMENT_PENDING_CODE = '20'
/** INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE — the only status that may be shown as a free trial. */
export const INTRO_ELIGIBLE_STATUS = 2
function storeError(error: unknown): unknown {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === PURCHASE_CANCELLED_CODE) return { userCancelled: true }
  if (code === PAYMENT_PENDING_CODE) return { paymentPending: true }
  return error
}

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
      const packages = offerings.current?.availablePackages ?? []
      // A free trial is an introductory offer priced at zero. Paid introductory
      // offers (e.g. half price for the first month) are not presented at all.
      const trialProducts = packages.filter((item) => item.product.introPrice?.price === 0).map((item) => item.product.identifier)
      const eligible = new Set<string>()
      if (trialProducts.length) {
        try {
          const answers = await sdk.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: trialProducts })
          for (const [productId, answer] of Object.entries(answers ?? {})) {
            if (answer?.status === INTRO_ELIGIBLE_STATUS) eligible.add(productId)
          }
        } catch {
          // Eligibility unknown: promise nothing and show the regular price.
        }
      }
      return packages.map((item) => {
        const intro = item.product.introPrice
        return {
          identifier: item.identifier,
          localizedPrice: item.product.priceString,
          subscriptionPeriod: item.product.subscriptionPeriod ?? null,
          freeTrial: intro && intro.price === 0 && eligible.has(item.product.identifier)
            ? { unit: intro.periodUnit, count: intro.periodNumberOfUnits * (intro.cycles || 1) }
            : null,
        }
      })
    },
    async purchase(packageIdentifier) {
      await verifyIdentity()
      const offerings = await sdk.getOfferings()
      const selected = offerings.current?.availablePackages.find((item) => item.identifier === packageIdentifier)
      if (!selected) throw new Error('Package is not available in the current offering')
      await verifyIdentity()
      try {
        await sdk.purchasePackage({ aPackage: selected })
      } catch (error) {
        throw storeError(error)
      }
    },
    async restore() {
      await verifyIdentity()
      let info
      try {
        info = (await sdk.restorePurchases())?.customerInfo
      } catch (error) {
        throw storeError(error)
      }
      // Any active entitlement or subscription counts: the entitlement name is a dashboard setting.
      const active = Object.keys(info?.entitlements?.active ?? {}).length + (info?.activeSubscriptions?.length ?? 0)
      return { hasActiveSubscription: active > 0 }
    },
    async logOut() {
      // Disposing an old UI session must not log a newer account out of the shared native SDK.
      if (expectedUserId && (await sdk.getAppUserID()).appUserID === expectedUserId) await sdk.logOut()
      expectedUserId = undefined
    },
  }
}
