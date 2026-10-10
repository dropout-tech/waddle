#!/usr/bin/env node
// Post-packaging check for the iOS shell (`pnpm cap:sync:release` runs it last).
//
// `next build` inlines NEXT_PUBLIC_* values into the static export. If the build
// ran without NEXT_PUBLIC_SUPABASE_URL (2026-10-08: packaged from a checkout that
// had no .env.local), the app ships without Supabase config and crashes on launch
// with "Your project's URL and API key are required". This script looks inside
// the bundle that `cap sync` copied into the native project and fails when no
// file contains the production Supabase URL.
//
// Override the folder with IOS_PUBLIC_DIR (used to test this script). Only file
// names and counts are printed, never file contents or keys.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PROD_SUPABASE_URL = 'https://jnikcndiexjojgvicohf.supabase.co'
const publicDir = process.env.IOS_PUBLIC_DIR || join(process.cwd(), 'ios/App/App/public')
const staticDir = join(publicDir, '_next/static')

function fail(message) {
  console.error(`FAIL  ios-bundle-check: ${message}`)
  process.exit(1)
}

if (!existsSync(staticDir)) {
  fail(`${staticDir} does not exist. Run \`pnpm cap:sync\` (pnpm build:cap + cap sync ios) before checking the bundle.`)
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const info = statSync(path)
    if (info.isDirectory()) yield* walk(path)
    else if (info.isFile() && /\.(js|mjs|json|html|txt)$/.test(name)) yield path
  }
}

let scanned = 0
let hits = 0
for (const file of walk(staticDir)) {
  scanned += 1
  if (readFileSync(file, 'utf8').includes(PROD_SUPABASE_URL)) hits += 1
}

if (hits === 0) {
  fail(`0 of ${scanned} files under ${staticDir} contain ${PROD_SUPABASE_URL}. `
    + 'The bundle was built without NEXT_PUBLIC_SUPABASE_URL and the app will crash on launch '
    + '(URL and API key are required). Copy .env.local from the main folder (在 worktree 打包請先從主資料夾複製 .env.local), '
    + 'then rerun `pnpm cap:sync:release`. Do NOT archive or submit this build.')
}

console.log(`PASS  ios-bundle-check: ${hits} of ${scanned} files under _next/static contain the production Supabase URL`)
