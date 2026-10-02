import { desktopSignIn } from './desktop-oauth'
import { createClient } from '@/lib/supabase/client'
import { isNative, isDesktop } from '@/lib/platform'
import { OAUTH_REDIRECT, APPLE_SERVICES_ID } from '@/lib/native-config'
import { t } from '@/lib/i18n'
import { GOOGLE_IOS_CLIENT_ID, nativeGoogleLogin, startGoogleWebLogin } from './google-idtoken'

// Shared OAuth entry points for the login and signup pages. Each branches on
// platform: web uses the standard browser redirect to /auth/callback; native
// opens the system browser and completes the round-trip via the deep-link
// handler (Google), or uses the native Apple sheet + id-token flow (Apple).

/**
 * Google sign-in. Web and iOS use ID-token flows that keep Google's account
 * chooser on our own domain / app (google-idtoken.ts): web navigates away and
 * /auth/google finishes; iOS resolves inline. Until the iOS client ID is set,
 * native falls back to the system browser + deep-link handler.
 */
export async function signInWithGoogle(): Promise<void> {
  if (isDesktop()) return desktopSignIn('google')
  if (!isNative()) return startGoogleWebLogin()
  if (GOOGLE_IOS_CLIENT_ID) return nativeGoogleLogin()

  const { data, error } = await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (data?.url) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: data.url })
  }
}

/**
 * Sign in with Apple. Required by App Store Guideline 4.8 because the app also
 * offers Google sign-in. On native we use the native ASAuthorization sheet
 * (no browser round-trip) and exchange the identity token with Supabase; on
 * web we fall back to the standard OAuth redirect.
 */
export async function signInWithApple(): Promise<void> {
  if (isDesktop()) return desktopSignIn('apple')
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
