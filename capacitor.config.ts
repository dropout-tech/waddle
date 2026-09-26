import type { CapacitorConfig } from '@capacitor/cli'

// NOTE: appId must stay in sync with APP_ID in lib/native-config.ts and the
// Xcode bundle identifier. Personal-project ID chosen by the owner
// (com.lazylazy.huddle, set 2026-07-12); NOT tied to any company domain.
// The app loads the offline static export in `out/` (no server.url),
// so it works without a network connection — required to pass App Store
// Guideline 4.2 (no thin website wrapper).
const config: CapacitorConfig = {
  appId: 'com.lazylazy.huddle',
  appName: 'Huddle',
  webDir: 'out',
  // WKWebView underlay — shows through before first paint; must match the
  // brand cream or a cold start flashes white between splash and hydration.
  backgroundColor: '#fdf8ec',
  ios: {
    // 'never' (was 'always'): with 'always' iOS added the safe-area insets as
    // UIScrollView contentInset ON TOP of our 100dvh shell, so the whole page
    // could be dragged/bounced by ~inset px and the cream underlay showed as a
    // band above the header and below the tab bar (reported on iPhone 14,
    // 2026-09-26). The web layer already pads itself with
    // env(safe-area-inset-*) (main-layout, tab bar, modals, notebook, auth).
    // scrollEnabled is left on because a few routes (login, meetings,
    // legal pages) still scroll the document; the app shell locks document
    // scrolling in CSS instead (html.app-shell-locked in globals.css).
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Keep the splash up until native-shell.tsx calls SplashScreen.hide()
      // after React mounts — auto-hiding at a fixed delay caused a white gap
      // on cold start (observed on-device 2026-07-12).
      launchAutoHide: false,
      backgroundColor: '#fdf8ec',
      showSpinner: false,
    },
  },
}

export default config
