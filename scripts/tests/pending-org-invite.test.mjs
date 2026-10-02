// node --experimental-strip-types scripts/tests/pending-org-invite.test.mjs
// Pending org-invite storage: survives "another tab" (shared store), expires, and
// every post-auth entry point consults it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  savePendingOrgInvite, readPendingOrgInvite, clearPendingOrgInvite, pendingOrgInvitePath, orgInviteTokenFromUrl,
  PENDING_ORG_INVITE_KEY, PENDING_ORG_INVITE_TTL_MS,
} from '../../lib/pending-org-invite.ts'

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m } }
let n = 0
const pass = (msg) => { n++; console.log(`PASS: ${msg}`) }

const shared = mem() // localStorage is shared by every tab of the origin
savePendingOrgInvite('tok-1', 1000, shared)
assert.equal(readPendingOrgInvite(2000, shared), 'tok-1'); pass('token readable from another tab (shared localStorage)')
assert.equal(pendingOrgInvitePath(2000, shared), '/org/invite'); pass('pendingOrgInvitePath resumes /org/invite')
assert.equal(readPendingOrgInvite(1000 + PENDING_ORG_INVITE_TTL_MS + 1, shared), null); pass('expired after 24h TTL')
assert.equal(shared.m.has(PENDING_ORG_INVITE_KEY), false); pass('expired entry is removed')
savePendingOrgInvite('tok-2', 0, shared); clearPendingOrgInvite(shared)
assert.equal(pendingOrgInvitePath(1, shared), null); pass('cleared after use')
shared.setItem(PENDING_ORG_INVITE_KEY, '{not json'); assert.equal(readPendingOrgInvite(1, shared), null); pass('corrupt value tolerated')

// Invite links from every place they can arrive (Universal Link, huddle://, paste).
const tok = 'AbC_dEf-0123456789abcdefghijklmnopqrstuvwxy' // 43 chars, base64url
for (const [input, want] of [
  [`https://huddle.lazy72.com/org/invite#t=${tok}`, tok],
  [`https://waddle.zeabur.app/org/invite/#t=${tok}`, tok],
  [`  https://huddle.lazy72.com/org/invite#t=${encodeURIComponent(tok)}\n`, tok],
  [`huddle://org/invite#t=${tok}`, tok],
  [`huddle://org/invite/?t=${tok}`, tok],
  [tok, tok],
  ['huddle://auth/callback?code=abc', null],
  [`https://huddle.lazy72.com/share/invite#t=${tok}`, null],
  [`https://huddle.lazy72.com/org/invite#t=short`, null],
  [`javascript:alert(1)//org/invite#t=${tok}`, null],
  ['hello world', null],
  ['', null],
]) {
  assert.equal(orgInviteTokenFromUrl(input), want, input)
}
pass('orgInviteTokenFromUrl: web / app / pasted links, rejects other routes and junk')

const entry = {
  'app/(auth)/login/page.tsx': /pendingOrgInvitePath\(\)/,
  // signup page: email sign-up retired 2026-10-01; OAuth sign-ups resume via auth/callback below.
  'app/auth/callback/page.tsx': /desktop_return[\s\S]*pendingOrgInvitePath\(\)[\s\S]*pendingOrgInvitePath\(\)/,
  'components/auth/deep-link-handler.tsx': /pendingOrgInvitePath\(\)/,
  'components/auth/redirect-if-authed.tsx': /pendingOrgInvitePath\(\)/,
}
for (const [file, re] of Object.entries(entry)) {
  assert.match(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), re, file)
  pass(`${file} checks the pending org invite`)
}
assert.doesNotMatch(readFileSync(new URL('../../app/org/invite/page.tsx', import.meta.url), 'utf8'), /sessionStorage/); pass('invite page no longer uses sessionStorage')
console.log(`\n${n} checks passed`)
