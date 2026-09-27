// Pending organization-invite token, carried across the login / sign-up
// round trip. localStorage (not sessionStorage): a new invitee confirms their
// email from a link that opens in a NEW tab, where sessionStorage is empty.
// A TTL keeps an abandoned invite from hijacking some later login.
// Dependency-free so it can be unit tested (scripts/tests/pending-org-invite.test.mjs).

export const PENDING_ORG_INVITE_KEY = 'huddle-pending-org-invite'
export const PENDING_ORG_INVITE_TTL_MS = 24 * 60 * 60 * 1000

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function store(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export function savePendingOrgInvite(token: string, now = Date.now(), kv: KV | null = store()) {
  try { kv?.setItem(PENDING_ORG_INVITE_KEY, JSON.stringify({ token, exp: now + PENDING_ORG_INVITE_TTL_MS })) } catch { /* private mode / quota */ }
}

export function readPendingOrgInvite(now = Date.now(), kv: KV | null = store()): string | null {
  try {
    const raw = kv?.getItem(PENDING_ORG_INVITE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: unknown; exp?: unknown }
    if (typeof parsed.token !== 'string' || typeof parsed.exp !== 'number' || parsed.exp <= now) {
      kv?.removeItem(PENDING_ORG_INVITE_KEY)
      return null
    }
    return parsed.token
  } catch {
    try { kv?.removeItem(PENDING_ORG_INVITE_KEY) } catch { /* ignore */ }
    return null
  }
}

export function clearPendingOrgInvite(kv: KV | null = store()) {
  try { kv?.removeItem(PENDING_ORG_INVITE_KEY) } catch { /* ignore */ }
}

/** Where to resume after any login / sign-up / deep-link return (else null). */
export function pendingOrgInvitePath(now = Date.now(), kv: KV | null = store()): string | null {
  return readPendingOrgInvite(now, kv) ? '/org/invite' : null
}
