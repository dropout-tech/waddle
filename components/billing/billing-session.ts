'use client'
import { useSyncExternalStore } from 'react'
import { getPlatform, isNative } from '@/lib/platform'
import { createClient } from '@/lib/supabase/client'
import { loadNativeBillingSession } from '@/lib/billing/load-native-session'
import { createNativeBillingSession, type NativeBillingDriver } from '@/lib/billing/native-adapter'
import { createBillingSessionStore } from '@/lib/billing/session-store'
import { createPaywallStore } from '@/lib/billing/paywall-store'
import { initialPaywallState, paywallReducer, type SyncLimits } from '@/lib/billing/paywall-state'

interface BillingTestHook {
  /** Fake store used instead of the RevenueCat SDK. */
  driver?: NativeBillingDriver
  /** Treat this browser as the native iOS shell. */
  nativeIos?: boolean
  /** Shorten the wait-for-server schedule so its later stages can be reached in a test. */
  sync?: Partial<SyncLimits>
}
declare global {
  interface Window {
    __huddleBillingTest?: BillingTestHook
  }
}

/**
 * Development-only seam for scripts/e2e/iap-paywall-verify.mjs.
 *
 * `process.env.NODE_ENV` is replaced with a literal at build time, so in a
 * production build (`pnpm build`, `pnpm build:cap`) this function is just
 * `return undefined`: the global is never read and its name is not even in the
 * bundle. No visitor to the live site or the shipped app can switch it on.
 */
export function billingTestHook(): BillingTestHook | undefined {
  if (process.env.NODE_ENV === 'production') return undefined
  return typeof window === 'undefined' ? undefined : window.__huddleBillingTest
}

/** In-app purchase UI and the Apple 3.1.1 rules apply to the native iOS shell only. */
export function isIosPurchaseSurface(): boolean {
  return (isNative() && getPlatform() === 'ios') || billingTestHook()?.nativeIos === true
}

const never = () => () => {}
const notOnServer = () => false
/**
 * Same check for markup that is prerendered (e.g. the sign-up page): the
 * server and the first client render both answer false, so hydration matches,
 * and the native shell switches right after.
 */
export function useIosPurchaseSurface(): boolean {
  return useSyncExternalStore(never, isIosPurchaseSurface, notOnServer)
}

const sessions = createBillingSessionStore(async (userId: string) => {
  const driver = billingTestHook()?.driver
  if (driver) return createNativeBillingSession({ driver, publicApiKey: 'test', authenticatedUserId: userId, purchasesEnabled: true })
  return loadNativeBillingSession(userId)
})
/** Purchase-screen state per signed-in user; survives leaving the membership page. */
export const paywall = createPaywallStore(paywallReducer, initialPaywallState, { type: 'opened' })
let watchingAuth = false

/**
 * The store session for this signed-in user (the RevenueCat App User ID is the
 * Supabase user id). Signing out or switching account disposes it and wipes the
 * purchase-screen state, wherever in the app that happens.
 */
export function acquireBillingSession(userId: string) {
  if (!watchingAuth) {
    watchingAuth = true
    createClient().auth.onAuthStateChange((_event, session) => {
      const current = session?.user.id ?? null
      paywall.userChanged(current)
      void sessions.userChanged(current)
    })
  }
  return sessions.acquire(userId)
}
export type BillingSession = Awaited<ReturnType<typeof acquireBillingSession>>
