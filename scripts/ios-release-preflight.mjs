#!/usr/bin/env node
// App Store release preflight for the iOS shell.
//
// Run before archiving a build that will be uploaded to App Store Connect
// (`pnpm cap:sync:release` runs it first). It fails fast on the mistakes that
// would get the build rejected or ship a broken purchase flow:
//   - billing flag off  → reviewer cannot find the subscription (2.1 / 3.1.2)
//   - RevenueCat test_ key → the SDK deliberately crashes Release builds
//   - App / widget version mismatch → upload is refused
//   - iPad enabled → iPad screenshots become mandatory (owner chose iPhone only)
//   - Watch app embedded → first release ships without Watch
//
// Env files are read the way `next build` reads them for production
// (process.env wins, then .env.production.local, .env.local, .env.production, .env).
// Values are never printed.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []
const passes = []
const check = (ok, label, hint) => (ok ? passes.push(label) : failures.push(`${label} — ${hint}`))
const warn = (ok, label, hint) => (ok ? passes.push(label) : warnings.push(`${label} — ${hint}`))

function loadEnv() {
  const merged = {}
  for (const file of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      merged[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...merged, ...process.env }
}

// ── 1. Build-time environment ──
const env = loadEnv()
check(env.NEXT_PUBLIC_BILLING_ENABLED === 'true', 'NEXT_PUBLIC_BILLING_ENABLED=true',
  'set it in .env.local, otherwise the purchase screen is hidden and review will reject the build')
const rcKey = env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? ''
check(rcKey.startsWith('appl_'), 'NEXT_PUBLIC_REVENUECAT_IOS_KEY is the production appl_ key',
  rcKey.startsWith('test_') ? 'a test_ key crashes Release/TestFlight builds on purpose'
    : 'missing; copy the App Store public SDK key (appl_…) from RevenueCat → API keys')
warn(Boolean(env.NEXT_PUBLIC_SENTRY_DSN), 'NEXT_PUBLIC_SENTRY_DSN is set',
  'crash reports will not be sent; the App Privacy label declares diagnostics')

// ── 2. Xcode project ──
const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj')
const pbx = readFileSync(pbxPath, 'utf8')
const configs = [...pbx.matchAll(/isa = XCBuildConfiguration;[\s\S]*?\n\t\t\};/g)].map(([block]) => ({
  bundle: block.match(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/)?.[1],
  name: block.match(/\n\t\t\tname = "?([^";]+)"?;/)?.[1],
  family: block.match(/TARGETED_DEVICE_FAMILY = "?([^";]+)"?;/)?.[1],
  version: block.match(/MARKETING_VERSION = "?([^";]+)"?;/)?.[1],
  build: block.match(/CURRENT_PROJECT_VERSION = "?([^";]+)"?;/)?.[1],
}))
const shipped = configs.filter((c) => c.bundle === 'com.lazylazy.huddle' || c.bundle === 'com.lazylazy.huddle.widgets')
check(shipped.length === 4, 'found Debug/Release configs for App and HuddleWidgets', `found ${shipped.length}`)
const releases = shipped.filter((c) => c.name === 'Release')
check(new Set(releases.map((c) => c.version)).size === 1 && releases.every((c) => c.version),
  `App and widget MARKETING_VERSION match (${releases.map((c) => c.version).join(' / ')})`,
  'Xcode refuses to upload when an embedded extension has a different version')
check(new Set(releases.map((c) => c.build)).size === 1 && releases.every((c) => c.build),
  `App and widget CURRENT_PROJECT_VERSION match (${releases.map((c) => c.build).join(' / ')})`,
  'build numbers must match too')
check(shipped.every((c) => c.family === '1'), 'iPhone only (TARGETED_DEVICE_FAMILY = 1)',
  'iPad is enabled again; that makes iPad screenshots mandatory')
check(!pbx.includes('Embed Watch Content') && !/HuddleWatch\.app in /.test(pbx), 'Watch app is not embedded',
  'the first release ships without Apple Watch')

// ── 3. Info.plist and privacy manifest ──
const plist = readFileSync(join(root, 'ios/App/App/Info.plist'), 'utf8')
for (const key of ['ITSAppUsesNonExemptEncryption', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
  check(plist.includes(`<key>${key}</key>`), `Info.plist has ${key}`, 'missing; review rejects or the app crashes when the API is used')
}
check(existsSync(join(root, 'ios/App/App/PrivacyInfo.xcprivacy')) && pbx.includes('PrivacyInfo.xcprivacy in Resources'),
  'PrivacyInfo.xcprivacy exists and is bundled', 'App Store Connect rejects uploads without required-reason declarations')

for (const p of passes) console.log(`PASS  ${p}`)
for (const w of warnings) console.log(`WARN  ${w}`)
for (const f of failures) console.log(`FAIL  ${f}`)
console.log(`\n${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)
