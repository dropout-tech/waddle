// Turns whatever a failed Supabase call hands back into a coarse reason the
// save-failed toast can show. Before this, the reason only reached the
// console, so "儲存失敗" looked identical for an expired login, a dropped
// connection and a rejected write.
//
// Deliberately free of `@/` imports so scripts/verify-auth-retry.mjs can load
// it directly under Node.

export type DbErrorReason =
  | { kind: 'auth' }
  | { kind: 'network' }
  | { kind: 'code'; code: string }
  | { kind: 'unknown' }

function field(err: unknown, key: string): string {
  if (!err || typeof err !== 'object') return ''
  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

export function classifyDbError(err: unknown): DbErrorReason {
  const code = field(err, 'code')
  const message = field(err, 'message') || (typeof err === 'string' ? err : '')

  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) return { kind: 'auth' }
  // postgrest-js reports a thrown fetch as `TypeError: Failed to fetch` (Chrome),
  // `Load failed` (Safari / WKWebView) or `NetworkError …` (Firefox), code ''.
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(message)) return { kind: 'network' }
  if (code) return { kind: 'code', code }
  return { kind: 'unknown' }
}
