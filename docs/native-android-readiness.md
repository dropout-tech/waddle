# Android / Google Play preparation

2026-09-21 local scaffold, not a signed or verified release.

## Created

- Pinned `@capacitor/android@8.3.4`, matching installed Capacitor core/CLI 8.3.4.
- Generated actual `android/` project with package `com.lazylazy.huddle`, versionName `0.1.1`, initial versionCode `1` (must confirm against Play Console before upload).
- Capacitor template compile/target SDK 36, minimum SDK 24. Google requires API 36 for new Android phone apps and updates from 2026-08-31; current generated target meets that setting, not a build certification.
- MainActivity uses `singleTop`, and routes `huddle://auth/callback` to existing native OAuth handler. Exact callback must also be on Supabase allowlist. Device OAuth and purchase-return behavior remain to be tested.
- Disabled Android application backup to avoid backing up auth/session preferences. Signing keystores and build outputs ignored. No signing keys created.
- Added `pnpm cap:sync:android`, `pnpm cap:open:android`, `pnpm cap:run:android`. Existing iOS commands unchanged.

## Build and test boundaries

JDK 21.0.3 detected. Default Android SDK directory has no installed platforms. `cap add android` succeeded. `pnpm build:cap` completed successfully, followed by `pnpm exec cap sync android`, which copied the actual static export and linked 12 plugins including RevenueCat 13.6.0. No placeholder web content was created. `./gradlew assembleDebug` was attempted but interrupted during the Gradle distribution download; Android SDK platforms are also absent. No APK build or device test is claimed. Manifest XML checks passed for SDK target, OAuth callback, singleTop and backup policy.

Run `pnpm cap:sync:android` after the static web export is ready, then `cd android && ./gradlew assembleDebug`. Install Android SDK 36/build tools through Android Studio and set local-only `local.properties` or `ANDROID_HOME`. Before claiming readiness, test actual APK on emulator/device: Google OAuth return, task creation, calendar drag, meetings, English, Google Calendar consent and sync, purchase/restore/account switch in Play internal testing. Debug APK is not the signed upload AAB.

For Play release: confirm package/versionCode, app signing and upload key in owner-controlled tooling, merchant and tax accounts, internal test product setup, signed bundle, privacy/Data Safety/account deletion URL, screenshots and store listing, content rating, testing eligibility and review. None submitted or enabled by this scaffold.

Capacitor's local shell does not imply all features work offline. Huddle still requires network for auth, server data, calendar synchronization and payments; do not claim full offline capability based on capacitor.config comments.

## Sources checked

- https://developer.android.com/google/play/requirements/target-sdk (current API36 requirement)
- Capacitor 8.3.4 generated Android template and installed package versions (actual project settings)
