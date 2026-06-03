import type { CapacitorConfig } from '@capacitor/cli'

// NOTE: appId must stay in sync with APP_ID in lib/native-config.ts and the
// Xcode bundle identifier. It's a placeholder until a real reverse-DNS domain
// is chosen. The app loads the offline static export in `out/` (no server.url),
// so it works without a network connection — required to pass App Store
// Guideline 4.2 (no thin website wrapper).
const config: CapacitorConfig = {
  appId: 'com.huddle.app',
  appName: 'Huddle',
  webDir: 'out',
  ios: {
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#fdf8ec',
      showSpinner: false,
    },
  },
}

export default config
