// ═══════════════════════════════════════════════════════════════════════
// AI 解析器插座（目前沒接 → 自動退回本地規則 parseBrainDump）
// ═══════════════════════════════════════════════════════════════════════
//
// 老闆之後要接 AI 時，照下面四步，UI 和排程器都不用改：
//
// 1. 新增 supabase/functions/brain-dump/（照 meeting-import 的分工）：
//    - prompt.ts：system prompt 寫「把使用者亂丟的一段話拆成待辦；只分類
//      時間的說法，不要自己算日期」。
//    - contract.ts：用 zod 定義輸出，轉成 OpenAI `response_format:
//      { type: 'json_schema', json_schema: { name: 'brain_dump', strict: true,
//      schema } }`。每個 item 建議欄位：
//        title           string（去掉時間詞後的自然標題）
//        minutes         number | null（沒說就 null，前端用 guessMinutes 補）
//        when            { kind: 'today' } | { kind: 'relative_days', days }
//                        | { kind: 'weekday', weekday: 1-7, week: 'this'|'next' }
//                        | { kind: 'date', date: 'YYYY-MM-DD' }   ← 就是 BrainDumpWhen
//        due             同上或 { kind: 'none' }
//        part            'morning' | 'afternoon' | 'evening' | null
//        fixedTime       'HH:mm' | null
//        urgent          boolean
//      ⚠️ 和 meeting-import 的 resolveDue 同一個原則：日期「不讓模型心算」，
//      模型只回 when/due 的種類，真正的 YYYY-MM-DD 一律由前端
//      resolveWhen(when, now)（lib/brain-dump/parse.ts）算。
//    - index.ts：驗 JWT、算用量（可參考 meeting-import/quota.mjs）、呼叫模型、
//      用 contract 驗證後回傳 { items: [...] }。
// 2. 在下方 `aiBrainDumpParser` 換成真的實作：
//      supabase.functions.invoke('brain-dump', { body: { text, lang, timezone } })
//    拿到 items 後用 fromAiItems(items, now) 轉成 BrainDumpDraft[] 回傳。
// 3. 失敗、逾時、沒額度、離線 → 回 null（或丟錯），就會退回本地規則；
//    使用者永遠拿得到結果。
// 4. 若要讓使用者知道是 AI 排的，面板會拿到 source: 'ai'，可在 UI 加小字。
//
// 不需要改的地方：planDay（排程器）、預覽動畫、寫入行事曆都吃同一個
// BrainDumpDraft 型別。
// ═══════════════════════════════════════════════════════════════════════

import { BRAIN_DUMP_MAX_ITEMS, cleanTitle, dateKey, dayToken, guessMinutes, parseBrainDump, resolveWhen } from './parse'
import type { BrainDumpDraft, BrainDumpLang, BrainDumpWhen, DayPart } from './types'

export interface BrainDumpParseInput {
  text: string
  /** Device "now" — every relative date is anchored on this. */
  now: Date
  lang: BrainDumpLang
}

/**
 * The socket. Same input → same output type as the local parser.
 * Return `null` to mean "not connected / gave up" → local rules are used.
 */
export type BrainDumpAiParser = (input: BrainDumpParseInput) => Promise<BrainDumpDraft[] | null>

/** Not connected yet (tonight: no AI calls, no edge function). */
export const aiBrainDumpParser: BrainDumpAiParser | null = null

/** Shape the future edge function is expected to return per item. */
export interface BrainDumpAiItem {
  title: string
  minutes: number | null
  when: BrainDumpWhen
  due: BrainDumpWhen | { kind: 'none' }
  part: DayPart | null
  fixedTime: string | null
  urgent: boolean
}

/** Convert model output into drafts — dates resolved here, never by the model. */
export function fromAiItems(items: BrainDumpAiItem[], now: Date): BrainDumpDraft[] {
  return items.slice(0, BRAIN_DUMP_MAX_ITEMS).flatMap((item, i) => {
    const title = cleanTitle(item.title ?? '')
    if (!title) return []
    const dueDate = item.due && item.due.kind !== 'none' ? resolveWhen(item.due, now) : undefined
    const minutes = typeof item.minutes === 'number' && item.minutes > 0
      ? Math.min(480, Math.max(5, Math.round(item.minutes / 5) * 5))
      : undefined
    const draft: BrainDumpDraft = {
      id: `bd-${i}`,
      source: item.title,
      title,
      estimatedMinutes: minutes ?? guessMinutes(title),
      minutesGuessed: minutes === undefined,
      day: dayToken(item.when ? resolveWhen(item.when, now) : dateKey(now), now),
      ...(dueDate ? { dueDate } : {}),
      ...(item.part ? { preferredPart: item.part } : {}),
      ...(item.fixedTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.fixedTime) ? { fixedTime: item.fixedTime } : {}),
      ...(item.urgent ? { urgency: 8 } : {}),
    }
    return [draft]
  })
}

/** AI first when connected; any failure or empty answer → local rules. */
export async function parseWithBestAvailable(
  input: BrainDumpParseInput,
  ai: BrainDumpAiParser | null = aiBrainDumpParser,
): Promise<{ drafts: BrainDumpDraft[]; source: 'ai' | 'local' }> {
  if (ai) {
    try {
      const drafts = await ai(input)
      if (drafts && drafts.length) return { drafts, source: 'ai' }
    } catch {
      /* fall through to local rules */
    }
  }
  return { drafts: parseBrainDump(input.text, input.now, input.lang), source: 'local' }
}
