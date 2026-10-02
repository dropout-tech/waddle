// Builds the text sent to the model and the numbers stored with the report
// (design 6.2–6.6 and 8). Structural rules:
//   * Receives ONLY the user-scoped database client (anon key + the caller's
//     JWT, created in index.ts). This file never creates a client and never
//     reads environment variables, so it cannot reach the service key.
//   * Every query names the owner explicitly (.eq user_id / recipient_id) on
//     top of RLS, and selects whitelisted columns only.
//   * Any failed query throws: never continue with partial data.
// Pure apart from the injected client; no Deno APIs.
import { byteLength, FIELD_LIMITS as L, MATERIAL_BYTE_LIMIT, squash, type Locale } from "./contract.ts";
import { inDateWindow, inTimestampWindow, taipeiStamp, type PeriodWindow } from "./period.ts";
import { extractText } from "./richtext.ts";

// deno-lint-ignore no-explicit-any
type Query = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- PostgREST builder chain
/** The user-scoped Supabase client (only `.from()` is used). */
export type UserScopedDb = { from: (table: string) => Query };

// ── Query whitelist (design 6.2) ────────────────────────────────────────────
export const SELECT = {
  workspaces: "id,name,is_archived", // Q1
  categories: "id,name,workspace_id", // Q2
  // Q3: decision columns only, no text. `source` = tasks.source (spec v5 #7).
  tasks:
    "id,workspace_id,category_id,is_completed,completed_at,created_at,scheduled_date,scheduled_start_time,scheduled_end_time,is_meeting,is_archived,due_date,source",
  taskText: "id,title,description,notes,urgency,estimated_minutes", // Q4
  assignments: "task_id", // Q5
  stickyNotes: "id,content,folder_id,updated_at", // Q6
  stickyFolders: "id,name", // Q7
  board: "id,date,type,title,content,is_checked,sort_order,document:metadata->document", // Q8
  timeBlocks: "id,date,start_time,end_time,type,label,notes", // Q9
  meetings: "id,title,meeting_date,summary:result->>summary,decisions:result->decisions", // Q10
} as const;

export const LIMITS = {
  taskPage: 1000,
  taskPages: 5,
  textBatch: 100, // ids per .in() so the URL stays short
  assignmentPage: 1000,
  assignmentPages: 10,
  completed: 120,
  scheduled: 80,
  created: 60,
  open: 40,
  stickyNotes: 60,
  board: 300,
  timeBlocks: 400,
  meetings: 20,
} as const;

// Source of a task row (tasks.source, draft migration 20261003030000):
// 'self' | 'meeting_import' | 'meeting_assignment'. Tasks assigned to me by
// someone else directly are not my rows at all (user_id = the assigner) and
// are excluded by the user_id filter of Q3/Q4.
const R2_ASSIGNED = /(^|\n)指派人：/; // fallback: accepted meeting assignment
const IMPORT_SOURCE = /(^|\n)來源原文：/; // fallback: my own meeting import (transcript excerpt)

export type Level = "L0" | "L1" | "L2";
/** L0 = title and dates only; L1 = no description; L2 = full whitelist
 *  (design 6.3). The source column decides first; R1 (link row) and R2 / the
 *  "來源原文：" line are fallbacks for rows the column cannot vouch for. */
export function taskLevel(input: { source?: unknown; linked: boolean; description?: unknown }): Level {
  const desc = typeof input.description === "string" ? input.description : "";
  if (input.source === "meeting_assignment" || input.linked || R2_ASSIGNED.test(desc)) return "L0";
  if (input.source === "meeting_import" || IMPORT_SOURCE.test(desc)) return "L1";
  return "L2";
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function run(query: Query): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error("MATERIAL_QUERY_FAILED");
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error("MATERIAL_QUERY_FAILED");
  return data as Row[];
}

async function paged(build: (from: number, to: number) => Query, size: number, pages: number, failOnCap: boolean) {
  const rows: Row[] = [];
  for (let p = 0; p < pages; p++) {
    const page = await run(build(p * size, p * size + size - 1));
    rows.push(...page);
    if (page.length < size) return rows;
  }
  // A list that may continue past the cap: tasks are capped by design (5000);
  // the assignment link list must be complete, so it fails closed instead.
  if (failOnCap) throw new Error("MATERIAL_QUERY_FAILED");
  return rows;
}

function minutesBetween(start: unknown, end: unknown): number {
  if (typeof start !== "string" || typeof end !== "string") return 0;
  const [ah, am] = start.split(":").map(Number);
  const [bh, bm] = end.split(":").map(Number);
  const m = bh * 60 + bm - (ah * 60 + am);
  return Number.isFinite(m) ? Math.max(0, m) : 0;
}
const hhmm = (v: unknown) => str(v).slice(0, 5);

function withTimestampWindow(q: Query, column: string, w: PeriodWindow): Query {
  q = q.gte(column, w.start.toISOString());
  return w.bounded ? q.lt(column, w.end.toISOString()) : q;
}
function withDateWindow(q: Query, column: string, w: PeriodWindow): Query {
  q = q.gte(column, w.startDate);
  return w.endDateInclusive ? q.lte(column, w.endDate) : q.lt(column, w.endDate);
}

// ── Numbers (design 8) ──────────────────────────────────────────────────────
export type Stats = Record<string, number>;
export function computeStats(input: {
  tasks: Row[]; // in-scope tasks: own, live workspace, existing category
  timeBlocks: Row[];
  window: PeriodWindow;
  now: Date;
}): { stats: Stats; workspaceMinutes: Map<string, { minutes: number; count: number }> } {
  const { tasks, window: w, now } = input;
  const completed = tasks.filter((t) => t.is_completed === true && inTimestampWindow(w, str(t.completed_at)));
  const created = tasks.filter((t) => inTimestampWindow(w, str(t.created_at)));
  const scheduled = tasks.filter((t) => inDateWindow(w, str(t.scheduled_date)));
  const mins = (t: Row) => minutesBetween(t.scheduled_start_time, t.scheduled_end_time);
  const scheduledMinutes = scheduled.reduce((s, t) => s + mins(t), 0);
  const meetingMinutes = scheduled.filter((t) => t.is_meeting === true).reduce((s, t) => s + mins(t), 0);
  const stats: Stats = {
    completed_count: completed.length,
    created_count: created.length,
    scheduled_minutes: scheduledMinutes,
    meeting_minutes: meetingMinutes,
    focus_minutes: scheduledMinutes - meetingMinutes,
    meeting_count: scheduled.filter((t) => t.is_meeting === true && mins(t) > 0).length,
  };
  if (!w.bounded) {
    stats.open_overdue_count = tasks.filter(
      (t) => t.is_completed !== true && typeof t.due_date === "string" && Date.parse(t.due_date + "T00:00:00Z") < now.getTime(),
    ).length;
  }
  stats.time_block_minutes = input.timeBlocks.reduce((s, b) => s + minutesBetween(b.start_time, b.end_time), 0);
  stats.time_block_count = input.timeBlocks.length;
  const workspaceMinutes = new Map<string, { minutes: number; count: number }>();
  for (const t of scheduled) {
    const name = str(t.__workspace);
    const e = workspaceMinutes.get(name) ?? { minutes: 0, count: 0 };
    e.minutes += mins(t);
    e.count += 1;
    workspaceMinutes.set(name, e);
  }
  return { stats, workspaceMinutes };
}

/** Top five like report-dashboard workspaceShare: by minutes when any
 *  scheduled minutes exist, otherwise by count. */
function workspaceLine(ws: Map<string, { minutes: number; count: number }>): string {
  const all = [...ws.entries()];
  const useMinutes = all.some(([, v]) => v.minutes > 0);
  return all
    .filter(([, v]) => (useMinutes ? v.minutes > 0 : v.count > 0))
    .sort((a, b) => (useMinutes ? b[1].minutes - a[1].minutes : b[1].count - a[1].count))
    .slice(0, 5)
    .map(([name, v]) => `${squash(name, 60)}=${v.minutes}min/${v.count}`)
    .join("; ");
}

// ── Section assembly with the total byte cap (design 6.5) ───────────────────
type Section = { name: string; total: number; rows: string[] };
function render(head: string[], sections: Section[], locale: Locale): string {
  const more = (n: number) => (locale === "en" ? `, ${n} more not listed` : `，另有 ${n} 筆未列出`);
  const body = sections
    .filter((s) => s.rows.length > 0)
    .map((s) => {
      const omitted = s.total - s.rows.length;
      return [`## ${s.name} (${s.rows.length}${omitted > 0 ? more(omitted) : ""})`, ...s.rows].join("\n");
    });
  return [...head, ...body].join("\n");
}
function fit(head: string[], sections: Section[], locale: Locale): string {
  let text = render(head, sections, locale);
  while (byteLength(text) > MATERIAL_BYTE_LIMIT) {
    // Drop the last row of the currently largest section.
    let target: Section | undefined;
    let size = -1;
    for (const s of sections) {
      const b = s.rows.reduce((n, r) => n + byteLength(r), 0);
      if (s.rows.length > 0 && b > size) [target, size] = [s, b];
    }
    if (!target) break;
    target.rows.pop();
    text = render(head, sections, locale);
  }
  return text;
}

export interface MaterialInput {
  db: UserScopedDb; // user-scoped client ONLY
  userId: string;
  window: PeriodWindow;
  includeMeetingHighlights: boolean; // from the stored consent, never from the request
  locale: Locale;
  now: Date;
}
export interface Material {
  text: string;
  stats: Stats;
  hasData: boolean;
}

export async function buildMaterial(input: MaterialInput): Promise<Material> {
  const { db, userId, window: w, locale, now } = input;
  if (!userId) throw new Error("MATERIAL_QUERY_FAILED");

  const [workspaces, categories, links, taskRows] = await Promise.all([
    run(db.from("workspaces").select(SELECT.workspaces).eq("user_id", userId)),
    run(db.from("categories").select(SELECT.categories).eq("user_id", userId)),
    paged(
      (a, b) =>
        db.from("meeting_task_assignments").select(SELECT.assignments)
          .eq("recipient_id", userId).eq("status", "accepted").not("task_id", "is", null)
          .order("task_id", { ascending: true }).range(a, b),
      LIMITS.assignmentPage,
      LIMITS.assignmentPages,
      true,
    ),
    paged(
      (a, b) =>
        db.from("tasks").select(SELECT.tasks).eq("user_id", userId)
          .order("id", { ascending: true }).range(a, b),
      LIMITS.taskPage,
      LIMITS.taskPages,
      false,
    ),
  ]);

  // Scope = report-dashboard allTasks: own task, its workspace and category
  // exist, and the category's workspace is not archived.
  const wsById = new Map(workspaces.map((r) => [str(r.id), r]));
  const catById = new Map(categories.map((r) => [str(r.id), r]));
  const linked = new Set(links.map((r) => str(r.task_id)));
  const tasks: Row[] = [];
  for (const t of taskRows) {
    const cat = catById.get(str(t.category_id));
    const ws = cat && wsById.get(str(cat.workspace_id));
    if (!wsById.has(str(t.workspace_id)) || !cat || !ws || ws.is_archived === true) continue;
    tasks.push({ ...t, __workspace: str(ws.name), __category: str(cat.name) });
  }

  // Groups A–D (design 6.3); a task is listed once, in the first group.
  const seen = new Set<string>();
  const pick = (rows: Row[], limit: number) => {
    const fresh = rows.filter((t) => !seen.has(str(t.id)));
    fresh.forEach((t) => seen.add(str(t.id)));
    return { total: fresh.length, rows: fresh.slice(0, limit) };
  };
  const desc = (k: string) => (a: Row, b: Row) => str(b[k]).localeCompare(str(a[k]));
  const asc = (k: string) => (a: Row, b: Row) => str(a[k]).localeCompare(str(b[k]));
  const groupA = pick(
    tasks.filter((t) => t.is_completed === true && inTimestampWindow(w, str(t.completed_at))).sort(desc("completed_at")),
    LIMITS.completed,
  );
  const groupB = pick(tasks.filter((t) => inDateWindow(w, str(t.scheduled_date))).sort(asc("scheduled_date")), LIMITS.scheduled);
  const groupC = pick(tasks.filter((t) => inTimestampWindow(w, str(t.created_at))).sort(desc("created_at")), LIMITS.created);
  const openEnd = w.endDate;
  const groupD = pick(
    tasks
      .filter((t) => t.is_completed !== true && t.is_archived !== true && typeof t.due_date === "string" && t.due_date <= openEnd)
      .sort(asc("due_date")),
    LIMITS.open,
  );

  // Q4: text of the selected tasks only.
  const ids = [...groupA.rows, ...groupB.rows, ...groupC.rows, ...groupD.rows].map((t) => str(t.id));
  const textById = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += LIMITS.textBatch) {
    const batch = ids.slice(i, i + LIMITS.textBatch);
    const rows = await run(db.from("tasks").select(SELECT.taskText).eq("user_id", userId).in("id", batch));
    for (const r of rows) textById.set(str(r.id), r);
  }

  const taskLine = (t: Row): string | null => {
    const text = textById.get(str(t.id));
    if (!text) return null; // deleted between Q3 and Q4: skip
    const level = taskLevel({ source: t.source, linked: linked.has(str(t.id)), description: text.description });
    const title = squash(text.title, L.taskTitle) || "-";
    const sched = t.scheduled_date
      ? `sched=${str(t.scheduled_date)}${t.scheduled_start_time ? ` ${hhmm(t.scheduled_start_time)}-${hhmm(t.scheduled_end_time)}` : ""}`
      : "";
    const done = t.is_completed === true ? (t.completed_at ? `done=${taipeiStamp(str(t.completed_at))}` : "done=yes") : "done=no";
    const due = t.due_date ? `due=${str(t.due_date)}` : "";
    if (level === "L0") {
      return ["- [from-meeting-assignment] " + title, done, due, sched].filter(Boolean).join(" | ");
    }
    const parts = [
      `- ${title}`,
      `ws=${squash(t.__workspace, 60)}/${squash(t.__category, 60)}`,
      typeof text.urgency === "number" ? `urgency=${text.urgency}` : "",
      due,
      sched,
      typeof text.estimated_minutes === "number" ? `est=${text.estimated_minutes}` : "",
      done,
      `created=${taipeiStamp(str(t.created_at))}`,
      `meeting=${t.is_meeting === true ? "yes" : "no"}`,
    ];
    if (level === "L2") {
      const d = squash(text.description, L.taskDescription);
      if (d) parts.push(`desc: ${d}`);
    }
    const n = squash(text.notes, L.taskNotes);
    if (n) parts.push(`notes: ${n}`);
    return parts.filter(Boolean).join(" | ");
  };
  const taskSection = (name: string, g: { total: number; rows: Row[] }): Section => {
    const rows = g.rows.map(taskLine).filter((r): r is string => r !== null);
    return { name, total: g.total - (g.rows.length - rows.length), rows };
  };

  // Q6–Q10.
  const stickyQuery = withTimestampWindow(
    db.from("sticky_notes").select(SELECT.stickyNotes).eq("user_id", userId),
    "updated_at",
    w,
  ).order("updated_at", { ascending: false }).limit(LIMITS.stickyNotes);
  const boardQuery = withDateWindow(
    db.from("scratchpad_items").select(SELECT.board).eq("user_id", userId)
      .in("type", ["text", "todo", "link"]).not("content", "like", "data:%"),
    "date",
    w,
  ).order("date", { ascending: true }).order("sort_order", { ascending: true }).limit(LIMITS.board);
  const blockQuery = withDateWindow(
    db.from("time_blocks").select(SELECT.timeBlocks).eq("user_id", userId),
    "date",
    w,
  ).order("date", { ascending: true }).order("start_time", { ascending: true }).limit(LIMITS.timeBlocks);
  const [stickyRows, folders, boardRows, blockRows, meetingRows] = await Promise.all([
    run(stickyQuery),
    run(db.from("sticky_note_folders").select(SELECT.stickyFolders).eq("user_id", userId)),
    run(boardQuery),
    run(blockQuery),
    input.includeMeetingHighlights
      ? run(
        withDateWindow(
          db.from("meeting_imports").select(SELECT.meetings).eq("user_id", userId).eq("status", "succeeded"),
          "meeting_date",
          w,
        ).order("meeting_date", { ascending: true }).limit(LIMITS.meetings),
      )
      : Promise.resolve([] as Row[]),
  ]);

  const folderById = new Map(folders.map((f) => [str(f.id), str(f.name)]));
  const stickyLines: string[] = [];
  for (const s of stickyRows) {
    const text = squash(extractText(s.content, L.stickyNote * 2), L.stickyNote);
    if (!text) continue;
    const folder = s.folder_id ? squash(folderById.get(str(s.folder_id)) ?? "", 60) : "";
    stickyLines.push(["-", folder ? `folder=${folder} |` : "", `updated=${taipeiStamp(str(s.updated_at)).slice(0, 10)} |`, text].filter(Boolean).join(" "));
  }

  const startsWithData = (v: unknown) => typeof v === "string" && /^\s*data:/i.test(v);
  const boardLines: string[] = [];
  for (const b of boardRows) {
    if (!["text", "todo", "link"].includes(str(b.type)) || startsWithData(b.content)) continue;
    const title = squash(b.title, L.boardTitle);
    if (b.type === "link") {
      if (title) boardLines.push(`- ${str(b.date)} | link | ${title}`); // never the URL
      continue;
    }
    const doc = b.document && typeof b.document === "object" ? b.document : null;
    const body = squash(doc ? extractText(doc, L.boardContent * 2) : str(b.content), L.boardContent);
    if (!body && !title) continue;
    const kind = b.type === "todo" ? `todo[${b.is_checked === true ? "x" : " "}]` : "text";
    boardLines.push([`- ${str(b.date)}`, kind, title, body].filter(Boolean).join(" | "));
  }

  const blockLines = blockRows.map((b) => {
    const notes = squash(b.notes, L.timeBlockNotes);
    return [
      `- ${str(b.date)} ${hhmm(b.start_time)}-${hhmm(b.end_time)}`,
      `type=${squash(b.type, 40)}`,
      `label=${squash(b.label, L.timeBlockLabel)}`,
      notes ? `notes: ${notes}` : "",
    ].filter(Boolean).join(" | ");
  });

  const meetingLines: string[] = [];
  for (const m of meetingRows) {
    const decisions = Array.isArray(m.decisions)
      ? m.decisions.filter((d): d is string => typeof d === "string").slice(0, L.meetingDecisions)
        .map((d) => squash(d, L.meetingDecision)).filter(Boolean)
      : [];
    const summary = squash(m.summary, L.meetingSummary);
    meetingLines.push([
      `- ${str(m.meeting_date)}`,
      squash(m.title, L.meetingTitle) || "-",
      summary ? `summary: ${summary}` : "",
      decisions.length ? `decisions: ${decisions.join("; ")}` : "",
    ].filter(Boolean).join(" | "));
  }

  const { stats, workspaceMinutes } = computeStats({ tasks, timeBlocks: blockRows, window: w, now });
  const sections: Section[] = [
    taskSection("tasks.completed", groupA),
    taskSection("tasks.scheduled", groupB),
    taskSection("tasks.created", groupC),
    taskSection("tasks.open", groupD),
    { name: "sticky_notes", total: stickyLines.length, rows: stickyLines },
    { name: "focus_board", total: boardLines.length, rows: boardLines },
    { name: "time_blocks", total: blockLines.length, rows: blockLines },
    ...(input.includeMeetingHighlights ? [{ name: "meetings", total: meetingLines.length, rows: meetingLines }] : []),
  ];

  const hasData = groupA.total + groupB.total + groupC.total > 0 ||
    stickyLines.length + boardLines.length + blockLines.length + meetingLines.length > 0;

  const header = (s: Stats) => [
    `[period] ${w.key} ${taipeiStamp(w.start)} ~ ${taipeiStamp(w.end)} (Asia/Taipei)`,
    `[stats] ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(" ")}`,
    `[workspaces] ${workspaceLine(workspaceMinutes) || "-"}`,
  ];
  // Counts of what is actually in the material (after the byte cap).
  stats.sticky_note_count = stickyLines.length;
  stats.board_item_count = boardLines.length;
  let text = fit(header(stats), sections, locale);
  const finalSticky = sections.find((s) => s.name === "sticky_notes")!.rows.length;
  const finalBoard = sections.find((s) => s.name === "focus_board")!.rows.length;
  if (finalSticky !== stats.sticky_note_count || finalBoard !== stats.board_item_count) {
    stats.sticky_note_count = finalSticky;
    stats.board_item_count = finalBoard;
    text = fit(header(stats), sections, locale);
  }
  return { text, stats, hasData };
}
