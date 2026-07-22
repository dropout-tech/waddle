import { createClient } from '@/lib/supabase/client'
import { isNative } from '@/lib/platform'
import { OAUTH_REDIRECT, APPLE_SERVICES_ID } from '@/lib/native-config'
import { t } from '@/lib/i18n'

// Shared OAuth entry points for the login and signup pages. Each branches on
// platform: web uses the standard browser redirect to /auth/callback; native
// opens the system browser and completes the round-trip via the deep-link
// handler (Google), or uses the native Apple sheet + id-token flow (Apple).

/**
 * Google sign-in. On web this navigates away (the callback page finishes the
 * exchange). On native it opens the system browser; the appUrlOpen deep-link
 * handler in deep-link-handler.tsx finishes the exchange.
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient()

  if (isNative()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
    })
    if (error) throw error
    if (data?.url) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: data.url })
    }
    return
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}

/**
 * Sign in with Apple. Required by App Store Guideline 4.8 because the app also
 * offers Google sign-in. On native we use the native ASAuthorization sheet
 * (no browser round-trip) and exchange the identity token with Supabase; on
 * web we fall back to the standard OAuth redirect.
 */
export async function signInWithApple(): Promise<void> {
  const supabase = createClient()

  if (isNative()) {
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')
    const result = await SignInWithApple.authorize({
      clientId: APPLE_SERVICES_ID,
      redirectURI: OAUTH_REDIRECT,
      scopes: 'email name',
    })
    const idToken = result.response?.identityToken
    if (!idToken) throw new Error(t('Apple 登入未取得憑證'))
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    })
    if (error) throw error
    return
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}
