import { Capacitor } from '@capacitor/core'
import { createNativeBillingSession } from './native-adapter'
import { createRevenueCatDriver } from './revenuecat-driver'

/** No SDK import or native call on web/desktop, or while the launch flag is disabled. */
export async function loadNativeBillingSession(authenticatedUserId?: string) {
  const platform = Capacitor.getPlatform()
  const enabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
  const publicApiKey = platform === 'ios'
    ? process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY
    : platform === 'android' ? process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY : undefined
  if (!enabled || !Capacitor.isNativePlatform() || !publicApiKey || !authenticatedUserId) {
    return createNativeBillingSession({ authenticatedUserId })
  }
  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    return createNativeBillingSession({
      authenticatedUserId, publicApiKey, purchasesEnabled: true,
      driver: createRevenueCatDriver(Purchases),
    })
  } catch {
    return createNativeBillingSession({ authenticatedUserId })
  }
}
