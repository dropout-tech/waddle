/**
 * Build-time switches for the legal pages (terms / privacy / refunds / help).
 *
 * The same pages ship in two places:
 * - the website (huddle.lazy72.com), where Huddle Pro is NOT on sale yet, so
 *   the "not available for purchase" wording is correct and must not change;
 * - the Capacitor static export bundled into the iOS app, where App Store
 *   in-app purchase is live once NEXT_PUBLIC_BILLING_ENABLED is 'true'.
 *
 * HUDDLE_APP_SHELL_BUILD is inlined by next.config.mjs ('1' only for
 * BUILD_TARGET=capacitor). Both must hold, so a website build always keeps the
 * original wording, and an app build without the purchase flag does too.
 */
export const APP_SHELL_BUILD = process.env.HUDDLE_APP_SHELL_BUILD === '1'

export const IN_APP_PURCHASE_LIVE = APP_SHELL_BUILD && process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
