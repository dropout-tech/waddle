/** Approved positioning, not store product IDs or a price to send to a payment SDK. */
export const BILLING_PLAN = {
  currency: 'TWD', monthlyReferencePrice: 149, annualReferencePrice: 1290,
  entitlement: 'pro', livePurchasesEnabled: false,
} as const

export type BillingAvailability = 'not_configured' | 'unsupported_platform' | 'sign_in_required'
/** Purchases intentionally stay unavailable until native SDK, products and sandbox review are complete. */
export function billingAvailability(platform: 'ios' | 'android' | 'web' | 'desktop', userId?: string): BillingAvailability {
  if (!userId) return 'sign_in_required'
  if (platform === 'web' || platform === 'desktop') return 'unsupported_platform'
  return 'not_configured'
}

/** UI hint only: paid server actions must independently check auth.uid() and expires_at > now(). */
export function hasCurrentPro(snapshot: { expires_at: string | null } | null, now = Date.now()): boolean {
  return Boolean(snapshot?.expires_at && Date.parse(snapshot.expires_at) > now)
}
