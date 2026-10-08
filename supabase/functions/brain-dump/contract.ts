// Request / model-output contract for brain-dump (丟給企鵝).
//
// Dates follow meeting-import exactly: the model only CLASSIFIES the deadline
// wording (dueSchema), each non-"none" due must quote matching evidence from
// its own source, and resolveDue() turns it into YYYY-MM-DD anchored on the
// member's today. Those pieces are imported from meeting-import, not copied,
// so both features keep one date logic. meeting-import itself is unchanged.
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

export const modelResult = z.object({
  items: z
    .array(
      z.object({
        title: z.string().max(300),
        note: z.string().max(600),
        due: dueSchema,
        dueEvidence: z.string().max(200),
        source: z.string().max(MAX_TEXT),
      }),
    )
    .max(60),
});

// The `due` JSON schema is meeting-import's, so the two never drift.
const dueJsonSchema = meetingOutputSchema.properties.tasks.items.properties.due;
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
        },
        required: ["title", "note", "due", "dueEvidence", "source"],
      },
    },
  },
  required: ["items"],
};

export interface SplitItem {
  title: string;
  dueDate: string;
  note: string;
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
// 「下午去銀行」「3點開會」: a time of day with no other date word means today.
const TIME_OF_DAY =
  /(早上|上午|中午|下午|傍晚|晚上|今早|今晚|\d{1,2}\s*[點点]|\b\d{1,2}\s*(am|pm)\b|\bthis (morning|afternoon|evening)\b|\btonight\b)/i;

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

const squash = (s: string) => s.replace(/[\s，,、。.!！?？；;]+/g, "").toLowerCase();
const FILLER = /^(嗯+|呃+|啊+|喔+|哦+|欸+|那個|對|好|ok|okay|hmm+|um+|uh+|yeah|yes|no)$/i;

/**
 * Model output → items safe to show. Drops anything not grounded in the
 * member's own text (source must appear in it), fillers and duplicates;
 * keeps at most MAX_ITEMS; resolves dates in code.
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
    out.push({ title, dueDate, note });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
