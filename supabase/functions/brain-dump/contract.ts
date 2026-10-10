// Request / model-output contract for brain-dump (丟給企鵝).
//
// Dates follow meeting-import exactly: the model only CLASSIFIES the deadline
// wording (dueSchema), each non-"none" due must quote matching evidence from
// its own source, and resolveDue() turns it into YYYY-MM-DD anchored on the
// member's today. Those pieces are imported from meeting-import, not copied,
// so both features keep one date logic. meeting-import itself is unchanged.
//
// Time of day (排進行事曆) follows the same design: the model only CLASSIFIES
// what the member said ("下午三點" → clock hour 3 / pm, "晚上" → part evening,
// "一小時" → 60) and quotes the exact words; this file checks the quote, drops
// deadlines ("三點前" is a due time, not an appointment) and turns the spoken
// hour into 24h "HH:mm" in code. Where the item lands in the calendar (free
// slots, "now", midnight) is decided on the device, never here — the member's
// calendar is not sent to the model or this function.
import { z } from "npm:zod@3.24.1";
import {
  date,
  dueSchema,
  dueSupported,
  outputSchema as meetingOutputSchema,
  resolveDue,
  type Due,
} from "../meeting-import/contract.ts";

export const MAX_TEXT = 4000;
export const MAX_ITEMS = 20;

export const statusRequest = z.object({
  action: z.literal("status"),
  today: date,
});
export const splitRequest = z.object({
  action: z.literal("split"),
  text: z.string().trim().min(1).max(MAX_TEXT),
  today: date,
  lang: z.enum(["zh-TW", "en"]).default("zh-TW"),
});

// What the member said about the time of day. Numbers are exactly as spoken
// (「三點」→ hour 3, meridiem "none"); validateTime() converts to 24h in code.
// Range checks live there too (an odd hour drops the time, not the response).
export const timeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("clock"),
    hour: z.number().int(),
    minute: z.number().int(),
    meridiem: z.enum(["am", "pm", "none"]),
  }),
  z.object({
    kind: z.literal("part"),
    part: z.enum(["morning", "noon", "afternoon", "evening"]),
  }),
]);
export type SpokenTime = z.infer<typeof timeSchema>;

export const modelResult = z.object({
  items: z
    .array(
      z.object({
        title: z.string().max(300),
        note: z.string().max(600),
        due: dueSchema,
        dueEvidence: z.string().max(200),
        source: z.string().max(MAX_TEXT),
        // The four fields below are new. They default to "nothing said" so a
        // model answer without them (older prompt, cached output) still parses
        // and simply schedules nothing.
        time: timeSchema.default({ kind: "none" }),
        timeEvidence: z.string().max(200).default(""),
        durationMinutes: z.number().int().nullable().default(null),
        durationEvidence: z.string().max(200).default(""),
      }),
    )
    .max(60),
});

// The `due` JSON schema is meeting-import's, so the two never drift.
const dueJsonSchema = meetingOutputSchema.properties.tasks.items.properties.due;
const timeJsonSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: { kind: { type: "string", enum: ["none"] } },
      required: ["kind"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["clock"] },
        hour: { type: "integer" },
        minute: { type: "integer" },
        meridiem: { type: "string", enum: ["am", "pm", "none"] },
      },
      required: ["kind", "hour", "minute", "meridiem"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["part"] },
        part: { type: "string", enum: ["morning", "noon", "afternoon", "evening"] },
      },
      required: ["kind", "part"],
    },
  ],
};
export const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          note: { type: "string" },
          due: dueJsonSchema,
          dueEvidence: { type: "string" },
          source: { type: "string" },
          // After `source` on purpose: the model has already written the
          // quote when it has to copy a time phrase out of it.
          time: timeJsonSchema,
          timeEvidence: { type: "string" },
          durationMinutes: { type: ["integer", "null"] },
          durationEvidence: { type: "string" },
        },
        required: [
          "title",
          "note",
          "due",
          "dueEvidence",
          "source",
          "time",
          "timeEvidence",
          "durationMinutes",
          "durationEvidence",
        ],
      },
    },
  },
  required: ["items"],
};

/** A time the member said, already checked and in 24h. */
export type ItemTime =
  | { kind: "clock"; time: string } // "HH:mm", 24h
  | { kind: "part"; part: "morning" | "noon" | "afternoon" | "evening" };

export interface SplitItem {
  title: string;
  dueDate: string;
  note: string;
  // Only present when the member said it. Both are additive: a client that
  // predates them ignores the extra keys, and a client reading a response
  // without them (older function) schedules nothing.
  time?: ItemTime;
  durationMinutes?: number;
}

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function todayWeekday(today: string): string {
  const d = new Date(today + "T00:00:00Z").getUTCDay();
  return `星期${WEEKDAY_NAMES[d]} / ${EN_WEEKDAYS[d]}`;
}

// English (and time-of-day) evidence on top of meeting-import's Chinese rules.
const EN_WEEKDAY = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;
const EN_DATE =
  /\b\d{1,2}\/\d{1,2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;
const EN_RELATIVE =
  /\b(today|tonight|tomorrow|tmrw?|day after tomorrow|in \d+ days?|within \d+ days?)\b/i;
const EN_VAGUE = /\b(few|couple|some|several)\b/i;
// 「下午去銀行」「3點開會」「三點前寄出」: a time of day with no other date word
// means today. Chinese numerals count too (「三點」 used to lose its date).
const TIME_OF_DAY =
  /(早上|上午|中午|下午|傍晚|晚上|今早|今晚|(?:\d{1,2}|[一二兩两三四五六七八九十]{1,3})\s*[點点]|\b\d{1,2}\s*(am|pm)\b|\bthis (morning|afternoon|evening)\b|\btonight\b)/i;

export function dueEvidenceOk(due: Due, evidence: string, source: string): boolean {
  if (due.kind === "none") return true;
  if (dueSupported(due, evidence, source)) return true;
  if (!evidence || !source.includes(evidence)) return false;
  if (due.kind === "date") return EN_DATE.test(evidence);
  if (due.kind === "weekday") return EN_WEEKDAY.test(evidence);
  if (EN_VAGUE.test(evidence)) return false;
  if (EN_RELATIVE.test(evidence)) return true;
  return due.days === 0 && TIME_OF_DAY.test(evidence);
}

// ───────────────────────── time of day & duration ─────────────────────────

// Words in the quote that settle morning vs afternoon by themselves. They beat
// the model's label: 「下午八點」 is 20:00 even if the model said "none".
// (中午 and 半夜 are special-cased in clockTo24h: 「中午11點」 is still morning.)
const AM_CUE = /凌晨|清晨|早上|早晨|上午|一早|今早|明早|\ba\.?m\.?(?![a-z])|\bmorning\b/i;
const PM_CUE = /下午|午後|傍晚|晚上|晚間|今晚|明晚|\bp\.?m\.?(?![a-z])|\b(?:afternoon|evening|tonight|night)\b/i;
function meridiemCue(quote: string): "am" | "pm" | null {
  const am = AM_CUE.test(quote);
  const pm = PM_CUE.test(quote);
  return am === pm ? null : am ? "am" : "pm";
}

/**
 * Spoken hour → 24h "HH:mm". The rule for an hour written WITHOUT 上午/下午 is
 * the same one the on-device parser uses (lib/brain-dump/parse.ts
 * normaliseClock; scripts/tests/brain-dump-function.test.mjs checks the two
 * agree on every hour when there is no quote): 1–7 點 reads as the afternoon
 * (「3點開會」= 15:00), 8–12 stay as written (「9點」= 09:00, 「12點」= noon),
 * 13+ is already 24h. With a meridiem: pm adds 12 below noon, am turns 12
 * into 0. The quote's own words win over the model's meridiem label.
 * Returns null for anything that is not a real, same-day time — including
 * 「晚上12點」 / 「半夜12點」, which are midnight (the next day), not noon.
 */
export function clockTo24h(
  hour: number,
  minute: number,
  meridiem: "am" | "pm" | "none",
  evidence = "",
): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const said = meridiemCue(evidence) ?? meridiem;
  let h = hour;
  if (hour >= 13) {
    // Written as 24h ("15:00", "下午15:00"): trust the digits.
  } else if (/[半深]夜/.test(evidence)) {
    // 「半夜兩點」 = 02:00, 「半夜11點」 = 23:00; anything else is not a time.
    if (hour >= 1 && hour <= 5) h = hour;
    else if (hour >= 9 && hour <= 11) h = hour + 12;
    else return null;
  } else if (/中午|正午/.test(evidence) && (hour === 10 || hour === 11)) {
    h = hour; // 「中午11點半」 is before noon
  } else if (said === "pm") {
    if (hour === 12 && /[晚夜]|night|midnight/i.test(evidence)) return null;
    if (hour < 12) h = hour + 12;
  } else if (said === "am") {
    if (hour === 12) h = 0;
  } else if (hour >= 1 && hour <= 7) {
    h = hour + 12;
  }
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Words that make a quote a time of day at all (checked on the quote, so a
// model that "finds" 3pm in a sentence without one gets nothing scheduled).
const CLOCK_WORDS =
  /[點点时時:：]|\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])|\bat\s+\d{1,2}\b|\b\d{1,2}\s+(?:o'?clock|in the (?:morning|afternoon|evening))|\b(?:noon|midnight)\b|\d\s*h\b/i;
const PART_WORDS: Record<"morning" | "noon" | "afternoon" | "evening", RegExp> = {
  morning: /早上|早晨|上午|清晨|一早|今早|明早|凌晨|morning/i,
  noon: /中午|正午|午間|noon|midday/i,
  afternoon: /下午|午後|afternoon/i,
  evening: /傍晚|晚上|晚間|今晚|明晚|下班後|睡前|夜|evening|tonight|night|after work/i,
};
// 「三點前」「3pm 之前」「by 3pm」: a deadline, not an appointment. 「前往／前面／
// 前天…」 are different words that merely start with 前.
const DEADLINE_AFTER = /^\s*(?:之|以)?前(?![往進进來来去面方後后年天日一輩辈台臺端])/;
const DEADLINE_BEFORE = /\b(?:by|before|until|till|no later than)\s*$/i;

/** True when the quote is the "by when" of the sentence rather than "at when". */
export function isDeadlineWording(evidence: string, source: string): boolean {
  if (/(?:之|以)?前$/.test(evidence.trim())) return true;
  if (/^(?:by|before|until|till)\b/i.test(evidence.trim())) return true;
  const at = source.indexOf(evidence);
  if (at < 0) return false;
  return (
    DEADLINE_AFTER.test(source.slice(at + evidence.length)) ||
    DEADLINE_BEFORE.test(source.slice(0, at))
  );
}

/**
 * The model's `time` → a time we trust, or undefined. Same defence as
 * dueEvidenceOk: no quote from the item's own source, no time. Also none
 * when the wording is a deadline, when the quote has no clock / day-part
 * word, or when the part named does not match the quoted word.
 */
export function validateTime(
  time: SpokenTime,
  evidence: string,
  source: string,
): ItemTime | undefined {
  if (time.kind === "none") return undefined;
  const quote = evidence.trim();
  if (!quote || !source.includes(quote)) return undefined;
  if (isDeadlineWording(quote, source)) return undefined;
  if (time.kind === "part") {
    return PART_WORDS[time.part].test(quote) ? { kind: "part", part: time.part } : undefined;
  }
  if (!CLOCK_WORDS.test(quote)) return undefined;
  const hhmm = clockTo24h(time.hour, time.minute, time.meridiem, quote);
  return hhmm ? { kind: "clock", time: hhmm } : undefined;
}

const DURATION_WORDS = /小時|小时|鐘頭|钟头|分|半|hour|hr|minute|min|\d\s*[hm]\b/i;

/** The model's stated length in minutes, only with a quote that is a length. */
export function validateDuration(
  minutes: number | null,
  evidence: string,
  source: string,
): number | undefined {
  if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return undefined;
  const quote = evidence.trim();
  if (!quote || !source.includes(quote) || !DURATION_WORDS.test(quote)) return undefined;
  return minutes;
}

const squash = (s: string) => s.replace(/[\s，,、。.!！?？；;]+/g, "").toLowerCase();
const FILLER = /^(嗯+|呃+|啊+|喔+|哦+|欸+|那個|對|好|ok|okay|hmm+|um+|uh+|yeah|yes|no)$/i;

/**
 * Model output → items safe to show. Drops anything not grounded in the
 * member's own text (source must appear in it), fillers and duplicates;
 * keeps at most MAX_ITEMS; resolves dates (and 24h times) in code.
 */
export function validateItems(raw: unknown, text: string, today: string): SplitItem[] {
  const parsed = modelResult.parse(raw);
  const haystack = squash(text);
  const seen = new Set<string>();
  const out: SplitItem[] = [];
  for (const item of parsed.items) {
    const title = item.title.trim().replace(/\s+/g, " ").slice(0, 200);
    const key = squash(title);
    if (!key || FILLER.test(title) || seen.has(key)) continue;
    const source = item.source.trim();
    if (!source || !haystack.includes(squash(source))) continue;
    seen.add(key);
    const dueDate = dueEvidenceOk(item.due, item.dueEvidence, source)
      ? resolveDue(item.due, today)
      : "";
    let note = item.note.trim().replace(/\s+/g, " ").slice(0, 200);
    if (squash(note) === key) note = "";
    const split: SplitItem = { title, dueDate, note };
    const time = validateTime(item.time, item.timeEvidence, source);
    if (time) split.time = time;
    const durationMinutes = validateDuration(item.durationMinutes, item.durationEvidence, source);
    if (durationMinutes !== undefined) split.durationMinutes = durationMinutes;
    out.push(split);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
