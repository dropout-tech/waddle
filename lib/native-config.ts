// ─────────────────────────────────────────────────────────
// Centralized native identifiers.
//
// These must stay in sync with:
//   - capacitor.config.ts (appId)
//   - the Xcode project bundle identifier + URL scheme (Info.plist)
//   - the Supabase Auth → URL Configuration redirect allow-list
//   - the Apple Developer / Google OAuth console
//
// APP_ID is a placeholder until a real reverse-DNS domain is chosen. To switch:
// change it here, in capacitor.config.ts, in Xcode, and in the consoles.
// ─────────────────────────────────────────────────────────

export const APP_ID = 'com.huddle.app'

/** Custom URL scheme registered in Info.plist for deep links. */
export const APP_URL_SCHEME = 'huddle'

/** Deep-link target Supabase redirects back to after OAuth on native. */
export const OAUTH_REDIRECT = `${APP_URL_SCHEME}://auth/callback`

/**
 * Apple "Services ID" for Sign in with Apple. On native iOS the system uses the
 * app's bundle entitlement, so this is mainly relevant for the web/Services-ID
 * flow. Fill in the real Services ID after creating it in the Apple Developer
 * console (Certificates, IDs & Profiles → Identifiers).
 */
export const APPLE_SERVICES_ID = APP_ID
