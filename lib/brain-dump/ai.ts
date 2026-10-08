// 丟給企鵝 — AI split client (Edge Function `brain-dump`) with the local
// rule parser as a fallback.
//
// The server (supabase/functions/brain-dump) asks gpt-4.1-mini to split the
// text into to-dos and resolves every due date in code (meeting-import's
// resolveDue: the model only classifies "明天 / 週五 / 10/9"). Free members
// get 20 AI splits per day, Pro members no daily cap.
//
// Whenever AI is not available — function not deployed yet, offline, daily
// limit reached, AI paused, any error or a 30 s timeout — the panel still gets
// a result from parseBrainDump() and is told why, so the member is never stuck.

import { createClient } from '@/lib/supabase/client'
import { dateKey, dayTokenToDate, guessMinutes, parseBrainDump } from './parse'
import type { BrainDumpDraft, BrainDumpLang } from './types'

export interface BrainDumpParseInput {
  text: string
  /** Device "now" — the member's today anchors every relative date. */
  now: Date
  lang: BrainDumpLang
}

export interface BrainDumpQuota {
  used: number
  /** null = Pro, no daily cap. */
  limit: number | null
  remaining: number | null
  enabled: boolean
}

export type BrainDumpFallback = 'limit' | 'unavailable'

export interface BrainDumpParseResult {
  drafts: BrainDumpDraft[]
  source: 'ai' | 'local'
  /** Why the local rules were used. */
  fallback?: BrainDumpFallback
  /** Daily limit (for the 'limit' message). */
  limit?: number
  quota?: BrainDumpQuota
}

const AI_TIMEOUT_MS = 30000

class AiError extends Error {
  constructor(public code: string, public limit?: number) {
    super(code)
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const client = createClient()
  const call = client.functions.invoke('brain-dump', { body })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError('TIMEOUT')), AI_TIMEOUT_MS)
  })
  try {
    const { data, error } = await Promise.race([call, timeout])
    if (error) {
      let code = 'UNAVAILABLE'
      let limit: number | undefined
      try {
        const payload = await (error as { context?: Response }).context?.json()
        if (typeof payload?.error === 'string') code = payload.error
        if (typeof payload?.limit === 'number') limit = payload.limit
      } catch {
        /* offline / not deployed */
      }
      throw new AiError(code, limit)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

/** Today's AI quota, or null when the function can't be reached. */
export async function fetchBrainDumpQuota(now = new Date()): Promise<BrainDumpQuota | null> {
  try {
    const q = await invoke<BrainDumpQuota>({ action: 'status', today: dateKey(now) })
    return q && typeof q.used === 'number' ? q : null
  } catch {
    return null
  }
}

interface SplitResponse extends Omit<BrainDumpQuota, 'enabled'> {
  items: { title: string; dueDate: string; note: string }[]
}

/** Server items → drafts (dates already resolved by the server). */
export function fromServerItems(items: SplitResponse['items']): BrainDumpDraft[] {
  return items
    .filter((x) => typeof x?.title === 'string' && x.title.trim())
    .map((x, i) => ({
      id: `bd-${i}`,
      source: x.title,
      title: x.title.trim(),
      estimatedMinutes: guessMinutes(x.title),
      minutesGuessed: true,
      day: 'today',
      ...(/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate ?? '') ? { dueDate: x.dueDate } : {}),
      ...(x.note?.trim() ? { note: x.note.trim() } : {}),
    }))
}

/** Local drafts for the inbox: 「明天回信」 has no deadline word but clearly
 *  belongs to tomorrow — that day becomes its due date. */
export function localInboxDrafts(text: string, now: Date, lang: BrainDumpLang): BrainDumpDraft[] {
  return parseBrainDump(text, now, lang).map((d) => {
    if (d.dueDate || d.day === 'today') return d
    return { ...d, dueDate: dayTokenToDate(d.day, now) }
  })
}

/** AI first; any failure → local rules, with the reason. */
export async function parseWithBestAvailable(input: BrainDumpParseInput): Promise<BrainDumpParseResult> {
  try {
    const res = await invoke<SplitResponse>({
      action: 'split',
      text: input.text,
      today: dateKey(input.now),
      lang: input.lang,
    })
    return {
      drafts: fromServerItems(Array.isArray(res?.items) ? res.items : []),
      source: 'ai',
      quota: { used: res.used, limit: res.limit, remaining: res.remaining, enabled: true },
    }
  } catch (err) {
    const local = localInboxDrafts(input.text, input.now, input.lang)
    if (err instanceof AiError && err.code === 'DAILY_LIMIT') {
      return { drafts: local, source: 'local', fallback: 'limit', limit: err.limit ?? 20 }
    }
    return { drafts: local, source: 'local', fallback: 'unavailable' }
  }
}
