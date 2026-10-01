// Optimistic locking for notebook / sticky-note content saves.
//
// A note's `updated_at`, exactly as the server last returned it, is used as
// an opaque version token: a save is sent as
//   UPDATE … WHERE id = :id AND updated_at = :token  RETURNING updated_at
// and only counts when it touched a row. Zero rows means the server holds a
// version this device has not seen (another device saved, or this device's
// own earlier request landed but its answer was lost). Tokens are compared
// for equality only — never "newer/older" — so device clocks don't matter.
//
// After a miss the caller re-reads the row and asks `decideAfterMiss` what
// it means. Nothing here may decide to drop either side: a real conflict
// keeps the server version in place and stores this device's text as a new
// "conflict copy" note.
//
// Pure functions only (no '@/…' runtime imports) so node --test can load it.

import type { TiptapDoc } from '@/lib/types'

/** JSON with object keys sorted. jsonb doesn't keep key order, so the
 *  server's copy of a document can serialise differently from ours. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function sameContent(a: TiptapDoc | null | undefined, b: TiptapDoc | null | undefined): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null)
}

export type MissDecision =
  /** The row no longer exists (deleted elsewhere): keep ours as a copy. */
  | 'gone'
  /** The server already holds exactly what we wanted to write. */
  | 'same'
  /** Only other fields moved (title, position…); our base content is still
   *  the server's content, so retry against the server's new token. */
  | 'rebase'
  /** The content itself changed elsewhere: keep both. */
  | 'conflict'

/**
 * @param server the row as re-read after a missed conditional update (null = gone)
 * @param mine   what this device tried to write (only the present fields count)
 * @param base   the server content this device's edit started from, when known.
 *               Unknown (undefined) for drafts restored after a reload — those
 *               can never be rebased, only saved, matched or copied.
 */
export function decideAfterMiss(
  server: { title?: string | null; content: TiptapDoc | null | unknown } | null,
  mine: { title?: string; content?: TiptapDoc | null },
  base?: { content: TiptapDoc | null },
): MissDecision {
  if (!server) return 'gone'
  const serverContent = server.content as TiptapDoc | null
  const titleSame = mine.title === undefined || mine.title === (server.title ?? '')
  const contentSame = mine.content === undefined || sameContent(serverContent, mine.content)
  if (titleSame && contentSame) return 'same'
  if (base && mine.content !== undefined && sameContent(serverContent, base.content) && mine.title === undefined) {
    return 'rebase'
  }
  return 'conflict'
}

// cyrb128: a small, well-mixed non-cryptographic 128-bit hash. Used instead
// of crypto.subtle, which needs a secure context the iOS WebView may not be.
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

/**
 * Deterministic id for the conflict copy of (note, text). Two tabs, two
 * hook instances or a retry after a lost response all compute the same id,
 * so the copy's INSERT can only succeed once (a repeat fails with 23505 and
 * is treated as "already copied") instead of piling up duplicate copies.
 */
export function conflictCopyId(noteId: string, payload: unknown): string {
  const hex = cyrb128(`${noteId}\n${stableStringify(payload)}`)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
  // UUID layout, version nibble 8 (custom), RFC 4122 variant.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
