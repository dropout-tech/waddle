import { z } from "npm:zod@3.24.1";

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
export const participant = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  organization: z.string().trim().max(100),
  aliases: z.array(z.string().trim().min(1).max(80)).max(12),
  userId: z.union([z.string().uuid(), z.literal("")]),
});
export type Participant = z.infer<typeof participant>;
export const contextSchema = z
  .object({
    meetingTime: z
      .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")])
      .default(""),
    participants: z.array(participant).max(30).default([]),
    categoryId: z.union([z.string().uuid(), z.literal("")]).default(""),
    autoSelf: z.boolean().default(false),
  })
  .refine(
    (c) =>
      new Set(c.participants.map((p) => p.id)).size === c.participants.length,
    "Duplicate participant",
  );
export const generation = z.object({
  action: z.literal("generate"),
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  meetingDate: date,
  transcript: z.string().trim().min(20).max(40000),
  context: contextSchema.default({}),
});
export const taskSelection = z.object({
  action: z.literal("import"),
  id: z.string().uuid(),
  categoryId: z.union([z.string().uuid(), z.literal("")]),
  tasks: z
    .array(
      z.object({
        assigneeId: z.union([z.string().uuid(), z.literal("")]).default(""),
        index: z.number().int().min(0).max(19),
        title: z.string().trim().min(1).max(200),
        owner: z.string().max(100),
        dueDate: z.union([date, z.literal("")]),
      }),
    )
    .min(1)
    .max(20),
});
// The model must never do weekday/date arithmetic itself — it only
// classifies what kind of deadline the transcript expresses. The actual
// YYYY-MM-DD is always computed deterministically in resolveDue(), anchored
// on meetingDate. This replaced an approach where the model was asked to
// compute dueDate directly (even with a this-week/next-week lookup table
// handed to it): gpt-4.1-mini was still unreliable, e.g. turning an
// unambiguous "下週一" into a date a full week too late.
export const dueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  // Only for a literal calendar date written in the transcript itself.
  z.object({ kind: z.literal("date"), date }),
  // "明天"=1, "後天"=2, ...
  z.object({ kind: z.literal("relative_days"), days: z.number().int().min(0).max(60) }),
  // 1=週一 ... 7=週日. week:"this" for "這週X"/bare "週X"/"禮拜X";
  // week:"next" for an explicit "下週X".
  z.object({
    kind: z.literal("weekday"),
    weekday: z.number().int().min(1).max(7),
    week: z.enum(["this", "next"]),
  }),
]);
export type Due = z.infer<typeof dueSchema>;
export const resultSchema = z.object({
  summary: z.string().min(1).max(8000),
  decisions: z.array(z.string().min(1).max(1000)).max(30),
  questions: z.array(z.string().min(1).max(1000)).max(30),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        owner: z.string().max(100),
        due: dueSchema,
        source: z.string().min(1).max(2000),
        ownerParticipantId: z.string().default(""),
        ownerEvidence: z.string().max(2000).default(""),
        assignmentConfidence: z
          .enum(["explicit", "uncertain"])
          .default("uncertain"),
        assignmentReason: z.string().max(1000).default("負責人待確認"),
      }),
    )
    .max(20),
});
export const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          owner: { type: "string" },
          due: {
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
                  kind: { type: "string", enum: ["date"] },
                  date: { type: "string" },
                },
                required: ["kind", "date"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["relative_days"] },
                  days: { type: "integer" },
                },
                required: ["kind", "days"],
              },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string", enum: ["weekday"] },
                  weekday: { type: "integer" },
                  week: { type: "string", enum: ["this", "next"] },
                },
                required: ["kind", "weekday", "week"],
              },
            ],
          },
          source: { type: "string" },
          ownerParticipantId: { type: "string" },
          ownerEvidence: { type: "string" },
          assignmentConfidence: {
            type: "string",
            enum: ["explicit", "uncertain"],
          },
          assignmentReason: { type: "string" },
        },
        required: [
          "title",
          "owner",
          "due",
          "source",
          "ownerParticipantId",
          "ownerEvidence",
          "assignmentConfidence",
          "assignmentReason",
        ],
      },
    },
  },
  required: ["summary", "decisions", "questions", "tasks"],
};
export function validateResult(
  raw: unknown,
  transcript: string,
  participants: Participant[] = [],
  meetingDate = "",
) {
  const parsed = resultSchema.parse(raw);
  // The model only classifies what kind of deadline was said (a literal
  // date, N relative days, or a weekday in "this"/"next" week) — the actual
  // YYYY-MM-DD is always computed here, deterministically, never by the
  // model. External shape (result.tasks[].dueDate as a plain string) is
  // unchanged so the frontend/DB contract stays compatible.
  const result = {
    ...parsed,
    tasks: parsed.tasks.map(({ due, ...task }) => ({
      ...task,
      dueDate: resolveDue(due, meetingDate),
    })),
  };
  // Never attach invented evidence to an executable task.
  if (result.tasks.some((task) => !transcript.includes(task.source)))
    throw new Error("INVALID_SOURCE");
  for (const task of result.tasks) {
    const person = participants.find((p) => p.id === task.ownerParticipantId);
    const names = person ? [person.name, ...person.aliases] : [];
    // Unknown speakers, group-level owners, duplicated aliases, or invented
    // evidence never become an automatic assignment.
    const named = names.some(
      (name) =>
        !['我','我們','自己','本人','這邊','對方','大家','主持人'].includes(name) &&
        task.ownerEvidence.includes(name) &&
        participants.filter((p) => [p.name, ...p.aliases].includes(name))
          .length === 1,
    );
    if (
      !person ||
      task.assignmentConfidence !== "explicit" ||
      !task.ownerEvidence ||
      !transcript.includes(task.ownerEvidence) ||
      !task.source.includes(task.ownerEvidence) ||
      !named
    ) {
      task.ownerParticipantId = "";
      task.assignmentConfidence = "uncertain";
      task.assignmentReason =
        task.assignmentReason || "說話者或負責人不明，請人工指派";
    }
  }
  return result;
}
export function taipeiMonth(now = new Date()) {
  return (
    new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 7) + "-01"
  );
}
const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
// meetingDate is a plain Asia/Taipei calendar date (YYYY-MM-DD); reading it
// as UTC midnight gives the correct weekday without any timezone shifting.
export function meetingWeekday(meetingDate: string): string {
  const d = new Date(meetingDate + "T00:00:00Z");
  return `星期${WEEKDAY_NAMES[d.getUTCDay()]}`;
}
// LLMs are unreliable at doing weekday arithmetic in their head (observed:
// gpt-4.1-mini overshoots "下週一" by a full extra week and undershoots
// "週三" by a day). Handing it a precomputed lookup table for "this week"
// and "next week" (Monday-start, matching common Taiwan usage) turns the
// task into a lookup instead of mental math.
const MONDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
export function meetingWeekDates(
  meetingDate: string,
): { thisWeek: Record<string, string>; nextWeek: Record<string, string> } {
  const base = new Date(meetingDate + "T00:00:00Z");
  const mondayOffset = (base.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const monday = new Date(base.getTime() - mondayOffset * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const thisWeek: Record<string, string> = {};
  const nextWeek: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    thisWeek[`週${MONDAY_LABELS[i]}`] = fmt(
      new Date(monday.getTime() + i * 86400000),
    );
    nextWeek[`週${MONDAY_LABELS[i]}`] = fmt(
      new Date(monday.getTime() + (i + 7) * 86400000),
    );
  }
  return { thisWeek, nextWeek };
}
// Deterministically turns the model's structured `due` classification into
// a YYYY-MM-DD string (or "" when there is none). The model never computes
// a date itself: "weekday"+week:"this" is auto-corrected forward to next
// week when that weekday has already passed within meetingDate's own week,
// matching how a person reading "週三" on a Saturday would mean next
// Wednesday; week:"next" always means the week after meetingDate's week,
// unconditionally. A final backstop refuses to return any date earlier
// than meetingDate, whatever the classification was.
export function resolveDue(due: Due, meetingDate: string): string {
  if (!meetingDate) return "";
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  let resolved = "";
  if (due.kind === "date") {
    resolved = due.date;
  } else if (due.kind === "relative_days") {
    const base = new Date(meetingDate + "T00:00:00Z");
    resolved = fmt(new Date(base.getTime() + due.days * 86400000));
  } else if (due.kind === "weekday") {
    const { thisWeek, nextWeek } = meetingWeekDates(meetingDate);
    const label = `週${MONDAY_LABELS[due.weekday - 1]}`;
    resolved =
      due.week === "next"
        ? nextWeek[label]
        : thisWeek[label] < meetingDate
          ? nextWeek[label]
          : thisWeek[label];
  }
  // Hard backstop: never surface a due date earlier than the meeting date.
  return resolved && resolved >= meetingDate ? resolved : "";
}
