// Regenerates the Sign in with Apple client secret (JWT, max 6 months) and copies it to the
// clipboard for pasting into Supabase → Authentication → Providers → Apple. Never prints the secret.
// Run: node scripts/apple-client-secret.mjs   (needs ~/Downloads/AuthKey_<KEY_ID>.p8 — adjust path if moved)
import { readFileSync } from 'node:fs'
import { createPrivateKey, sign } from 'node:crypto'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
const KEY_ID = 'GS59HRK3AS', TEAM_ID = 'PQZ8V7ZAXU', SUB = 'com.lazylazy.huddle.web'
const key = createPrivateKey(readFileSync(`${homedir()}/Downloads/AuthKey_${KEY_ID}.p8`))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const iat = Math.floor(Date.now() / 1000), exp = iat + 180 * 24 * 3600
const head = `${b64({ alg: 'ES256', kid: KEY_ID })}.${b64({ iss: TEAM_ID, iat, exp, aud: 'https://appleid.apple.com', sub: SUB })}`
const sig = sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
const jwt = `${head}.${sig}`
execFileSync('pbcopy', { input: jwt })
console.log('OK 已複製到剪貼簿；長度', jwt.length, '；到期日', new Date(exp * 1000).toISOString().slice(0, 10))
