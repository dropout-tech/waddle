import { t } from '@/lib/i18n'

// Maps the limit errors the database / Edge Functions raise into plain-language
// messages (design doc §3). DB triggers raise `exception 'TASK_LIMIT'` etc.,
// which PostgREST returns as { code: 'P0001', message: 'TASK_LIMIT' } — so the
// code is matched with `includes`, the same way lib/assignments.ts does it.
//
// Only imports the i18n core, so scripts/verify-pro-limits-ui.mjs can load it.

export type PlanLimitCode = 'TASK_LIMIT' | 'NOTE_LIMIT' | 'IMAGE_LIMIT' | 'PRO_REQUIRED'

const CODES: PlanLimitCode[] = ['TASK_LIMIT', 'NOTE_LIMIT', 'IMAGE_LIMIT', 'PRO_REQUIRED']

const MESSAGES: Record<PlanLimitCode, string> = {
  TASK_LIMIT: '進行中的任務已達免費版上限。完成或刪除一些舊任務，或看看 Pro 方案，就能繼續新增。',
  NOTE_LIMIT: '筆記數量已達免費版上限。整理一下舊筆記，或看看 Pro 方案，就能繼續新增。',
  IMAGE_LIMIT: '圖片空間已達上限，暫時無法再上傳。刪除一些舊圖片，或看看 Pro 方案取得更多空間。',
  PRO_REQUIRED: '這是 Pro 會員功能。',
}

/** Translated, user-facing message for a limit code. */
export function planLimitMessage(code: PlanLimitCode): string {
  return t(MESSAGES[code])
}

/** Finds a limit code in any error shape (PostgrestError, StorageError, Error, string). */
export function planLimitCode(err: unknown): PlanLimitCode | null {
  if (!err) return null
  if (err instanceof PlanLimitError) return err.planLimit
  const parts: string[] = []
  if (typeof err === 'string') parts.push(err)
  else if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    for (const k of ['message', 'details', 'hint', 'error', 'code']) if (typeof e[k] === 'string') parts.push(e[k] as string)
  }
  const raw = parts.join(' ')
  return CODES.find((c) => raw.includes(c)) ?? null
}

/** Thrown by the client-side image-quota pre-check so existing catch blocks show the right text. */
export class PlanLimitError extends Error {
  readonly planLimit: PlanLimitCode
  constructor(code: PlanLimitCode) {
    super(planLimitMessage(code))
    this.name = 'PlanLimitError'
    this.planLimit = code
  }
}

/**
 * Supabase Storage answers a row-level-security refusal with HTTP 403 and
 * "new row violates row-level security policy". With limits on, that is the
 * image-quota policy (the user's own-prefix policy always passes for their own
 * uploads) — so it is reported as IMAGE_LIMIT. Only call this when the server
 * has said limits are enforced.
 */
export function looksLikeStorageQuotaRefusal(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const message = typeof e.message === 'string' ? e.message : ''
  const status = String(e.statusCode ?? e.status ?? '')
  return /row-level security|violates|IMAGE_LIMIT/i.test(message) || status === '403'
}
