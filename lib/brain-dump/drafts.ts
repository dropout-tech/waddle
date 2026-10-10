// Server answer / local rules → BrainDumpDraft[]. Pure (no React, no '@/'
// imports) so a node test can run it; ai.ts does the network around it.

import { dayTokenToDate, guessMinutes, parseBrainDump } from './parse'
import type { BrainDumpDraft, BrainDumpLang, DayPart } from './types'

/** One item of the brain-dump function's answer. `time` and `durationMinutes`
 *  are newer than the rest: a function deployed before them leaves them out,
 *  and a client must treat that as "no time was said". */
export interface ServerItem {
  title: string
  dueDate: string
  note: string
  time?: unknown
  durationMinutes?: unknown
}

const SERVER_PARTS: readonly DayPart[] = ['morning', 'noon', 'afternoon', 'evening']
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** The function already checked the quote and converted to 24h; this only
 *  makes sure nothing malformed (an old/odd answer) can reach the scheduler. */
function readTime(raw: unknown): Pick<BrainDumpDraft, 'fixedTime' | 'preferredPart'> {
  const t = raw as { kind?: unknown; time?: unknown; part?: unknown } | null | undefined
  if (t?.kind === 'clock' && typeof t.time === 'string' && HH_MM.test(t.time)) return { fixedTime: t.time }
  if (t?.kind === 'part' && SERVER_PARTS.includes(t.part as DayPart)) return { preferredPart: t.part as DayPart }
  return {}
}

/** Server items → drafts (dates and times already resolved by the server). */
export function fromServerItems(items: ServerItem[]): BrainDumpDraft[] {
  return items
    .filter((x) => typeof x?.title === 'string' && x.title.trim())
    .map((x, i) => {
      const stated = typeof x.durationMinutes === 'number' && Number.isInteger(x.durationMinutes) && x.durationMinutes >= 1 && x.durationMinutes <= 1440
      return {
        id: `bd-${i}`,
        source: x.title,
        title: x.title.trim(),
        estimatedMinutes: stated ? (x.durationMinutes as number) : guessMinutes(x.title),
        minutesGuessed: !stated,
        day: 'today',
        ...(/^\d{4}-\d{2}-\d{2}$/.test(x.dueDate ?? '') ? { dueDate: x.dueDate } : {}),
        ...(x.note?.trim() ? { note: x.note.trim() } : {}),
        ...readTime(x.time),
      }
    })
}

/** Local drafts for the inbox: 「明天回信」 has no deadline word but clearly
 *  belongs to tomorrow — that day becomes its due date. */
export function localInboxDrafts(text: string, now: Date, lang: BrainDumpLang): BrainDumpDraft[] {
  return parseBrainDump(text, now, lang).map((d) => {
    if (d.dueDate || d.day === 'today') return d
    return { ...d, dueDate: dayTokenToDate(d.day, now) }
  })
}
