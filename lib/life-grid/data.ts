/**
 * 人生年曆 data access — the「每日一句」 lives in `journal_entries`
 * (migration 0001: one row per user+date, `content` = the line, `mood` =
 * mood_enum; RLS 0002 limits every read/write to the owner).
 *
 * ── For the AI 回顧 (later) ─────────────────────────────────────────────
 * `getDailyLines(userId, from, to)` is the one read the AI review should use:
 * it returns the user's own lines for an inclusive date range, oldest first,
 * already trimmed to { date, content, mood }. Intended use: when building a
 * weekly/monthly review payload, fetch the period's lines and pass them as
 * extra context ("what the user chose to remember each day" + the mood
 * curve). The lines are personal — they must only be sent to the model under
 * the AI-consent gate (lib/ai-consent.ts). Adding them is a NEW data category
 * for `ai_review`, so its `scopeVersion` must be bumped (on both the client
 * and supabase/functions/_shared/ai-consent.ts) to force re-consent before the
 * first review that reads them. The review text should paraphrase rather than
 * quote the lines verbatim. The edge function runs server-side, so it would
 * call the same query with its own user-scoped client (pass it as `client`).
 * Days without a line are simply absent (not null rows).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { isMood, normalizeLine, type Mood } from './compute'

type Client = SupabaseClient<Database>

export interface DailyLine {
  /** YYYY-MM-DD — the user's local calendar day the line belongs to. */
  date: string
  content: string
  mood: Mood | null
}

/**
 * The user's daily lines between `from` and `to` (both inclusive,
 * YYYY-MM-DD), oldest first. Pages past PostgREST's 1000-row cap, so a
 * multi-year range is complete. Throws on a read error — callers decide
 * whether that means "retry" or "skip the lines".
 */
export async function getDailyLines(
  userId: string,
  from: string,
  to: string,
  client: Client = createClient(),
): Promise<DailyLine[]> {
  const { data, error } = await fetchAllRows((start, end) =>
    client
      .from('journal_entries')
      .select('id, date, content, mood', { count: 'exact' })
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(start, end),
  )
  if (error) throw error
  return (data ?? [])
    .map((row) => ({
      date: row.date,
      content: row.content ?? '',
      mood: isMood(row.mood) ? row.mood : null,
    }))
    .filter((line) => line.content !== '' || line.mood !== null)
}

/** Insert or replace one day's line (unique user_id+date). */
export async function saveDailyLine(client: Client, userId: string, line: DailyLine): Promise<void> {
  const { error } = await client
    .from('journal_entries')
    .upsert(
      { user_id: userId, date: line.date, content: normalizeLine(line.content) || null, mood: line.mood },
      { onConflict: 'user_id,date' },
    )
  if (error) throw error
}

export async function deleteDailyLine(client: Client, userId: string, date: string): Promise<void> {
  const { error } = await client.from('journal_entries').delete().eq('user_id', userId).eq('date', date)
  if (error) throw error
}

/** Cheap existence check (head request) — used by the penguin's evening question. */
export async function hasDailyLine(client: Client, userId: string, date: string): Promise<boolean> {
  const { count, error } = await client
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', date)
  if (error) throw error
  return (count ?? 0) > 0
}
