import { z } from "npm:zod@3.24.1";

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");
export const generation = z.object({
  action: z.literal("generate"),
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  meetingDate: date,
  transcript: z.string().trim().min(20).max(40000),
});
export const taskSelection = z.object({
  action: z.literal("import"),
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  tasks: z
    .array(
      z.object({
        index: z.number().int().min(0).max(19),
        title: z.string().trim().min(1).max(200),
        owner: z.string().max(100),
        dueDate: z.union([date, z.literal("")]),
      }),
    )
    .min(1)
    .max(20),
});
export const resultSchema = z.object({
  summary: z.string().min(1).max(8000),
  decisions: z.array(z.string().min(1).max(1000)).max(30),
  questions: z.array(z.string().min(1).max(1000)).max(30),
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        owner: z.string().max(100),
        dueDate: z.union([date, z.literal("")]),
        source: z.string().min(1).max(2000),
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
          dueDate: { type: "string" },
          source: { type: "string" },
        },
        required: ["title", "owner", "dueDate", "source"],
      },
    },
  },
  required: ["summary", "decisions", "questions", "tasks"],
};
export function validateResult(raw: unknown, transcript: string) {
  const result = resultSchema.parse(raw);
  // Never attach invented evidence to an executable task.
  if (result.tasks.some((task) => !transcript.includes(task.source)))
    throw new Error("INVALID_SOURCE");
  return result;
}
export function taipeiMonth(now = new Date()) {
  return (
    new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 7) + "-01"
  );
}
