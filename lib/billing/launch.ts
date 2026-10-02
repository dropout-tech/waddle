/**
 * Build-time launch switches. Both are inlined by Next.js, so the branch that
 * is not taken is dead code and its wording is not shipped in that build.
 *
 * PRO_ON_SALE  - NEXT_PUBLIC_BILLING_ENABLED=true. Set only for the build that
 *                sells Huddle Pro through Apple in-app purchase (the iOS
 *                submission build, and later the website redeploy on launch
 *                day). Unset (today's website build) = "not for sale" wording,
 *                byte-for-byte what the legal pages said before.
 * APP_SHELL_BUILD - the Capacitor static export (see next.config.mjs). It only
 *                ships inside the native app, so website purchase wording and
 *                links to the marketing site must not be in it (App Store
 *                Review Guideline 3.1.1).
 */
export const PRO_ON_SALE = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
export const APP_SHELL_BUILD = process.env.HUDDLE_APP_SHELL_BUILD === '1'
