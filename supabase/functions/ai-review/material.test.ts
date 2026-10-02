// node --test supabase/functions/ai-review/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMaterial, LIMITS, SELECT, taskLevel } from "./material.ts";
import { computePeriod } from "./period.ts";
import { byteLength, MATERIAL_BYTE_LIMIT, scanMaterial } from "./contract.ts";
import { fakeDb } from "./test-support.ts";

const U = "00000000-0000-4000-8000-0000000000u1".replace("u1", "a1");
const O = "00000000-0000-4000-8000-0000000000b1"; // someone else
const NOW = new Date("2026-09-24T02:00:00Z"); // Taipei 9/24 10:00
const IN = "2026-09-20T03:00:00Z"; // inside this_week
const OLD = "2026-08-01T03:00:00Z"; // outside
const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

const task = (o: Record<string, unknown>) => ({
  user_id: U, workspace_id: "w1", category_id: "c1", is_completed: false, completed_at: null, created_at: OLD,
  scheduled_date: null, scheduled_start_time: null, scheduled_end_time: null, is_meeting: false, is_archived: false,
  due_date: null, source: "self", urgency: 5, estimated_minutes: null, description: null, notes: null,
  // Columns that must never be selected:
  attendees: "王小明, 李大華", location: "台北市信義路 1 號", meeting_url: "https://meet.example/abc",
  google_event_id: "gev123", assignee_id: null, return_note: "退回原因",
  ...o,
});

function fixture() {
  return {
    workspaces: [
      { id: "w1", user_id: U, name: "工作", is_archived: false },
      { id: "w2", user_id: U, name: "封存區", is_archived: true },
      { id: "wO", user_id: O, name: "別人的", is_archived: false },
    ],
    categories: [
      { id: "c1", user_id: U, name: "報告", workspace_id: "w1" },
      { id: "c2", user_id: U, name: "舊", workspace_id: "w2" },
      { id: "cO", user_id: O, name: "別人", workspace_id: "wO" },
    ],
    tasks: [
      task({ id: "t1", title: "寫季報", is_completed: true, completed_at: IN, description: "彙整三個專案", notes: "圖表下週補", due_date: "2026-09-30" }),
      task({ id: "t2", title: "回覆報價", is_completed: true, completed_at: IN, source: "meeting_assignment", description: "我改掉了開頭的說明", notes: "秘密備註二", due_date: "2026-09-26", scheduled_date: "2026-09-22", scheduled_start_time: "09:00:00", scheduled_end_time: "09:30:00" }),
      task({ id: "t3", title: "連結列任務", created_at: IN, description: "連結列說明三", notes: "備註三" }),
      task({ id: "t4", title: "文字後備任務", created_at: IN, description: "指派人：B\n會議：週會", notes: "備註四" }),
      task({ id: "t5", title: "我的會議匯入", created_at: IN, source: "meeting_import", description: "會議：週會\n來源原文：逐字稿秘密五", notes: "可送備註五" }),
      task({ id: "t6", title: "舊匯入", created_at: IN, description: "第一行\n來源原文：逐字稿秘密六" }),
      task({ id: "t7", title: "封存工作區任務", workspace_id: "w2", category_id: "c2", created_at: IN }),
      task({ id: "t8", title: "週會", scheduled_date: "2026-09-21", scheduled_start_time: "10:00:00", scheduled_end_time: "11:00:00", is_meeting: true }),
      task({ id: "t9", title: "深度工作", scheduled_date: "2026-09-23", scheduled_start_time: "14:00:00", scheduled_end_time: "16:00:00" }),
      task({ id: "t10", title: "逾期未完成", due_date: "2026-09-01" }),
      task({ id: "tO", user_id: O, workspace_id: "wO", category_id: "cO", title: "別人指派給我的任務", assignee_id: U, created_at: IN }),
    ],
    meeting_task_assignments: [
      { task_id: "t3", recipient_id: U, status: "accepted" },
      { task_id: "t1", recipient_id: O, status: "accepted" },
      { task_id: "t9", recipient_id: U, status: "pending" },
    ],
    sticky_notes: [
      {
        id: "s1", user_id: U, folder_id: "f1", updated_at: IN, x: 1, y: 2, color: "rose",
        content: doc(
          p("下一版想加語音輸入"),
          { type: "image", attrs: { src: "data:image/png;base64," + "iVBORw0KGgo".repeat(40) } },
          p("參考這裡", [{ type: "link", attrs: { href: "https://secret.example/path?token=1" } }]),
        ),
      },
      { id: "s2", user_id: U, folder_id: null, updated_at: OLD, content: doc(p("太舊的便條")) },
      { id: "sO", user_id: O, folder_id: null, updated_at: IN, content: doc(p("別人的便條")) },
    ],
    sticky_note_folders: [{ id: "f1", user_id: U, name: "靈感" }],
    scratchpad_items: [
      { id: "b1", user_id: U, date: "2026-09-19", type: "todo", title: "週五檢查", content: "", is_checked: true, sort_order: 0,
        metadata: { document: doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("備份資料庫")] }] }), canvas: { x: 10 } } },
      { id: "b2", user_id: U, date: "2026-09-19", type: "link", title: "參考文件", content: "https://docs.example/?token=abc", is_checked: false, sort_order: 1 },
      { id: "b3", user_id: U, date: "2026-09-19", type: "image", title: "截圖", content: "data:image/png;base64,AAAA", is_checked: false, sort_order: 2 },
      { id: "b4", user_id: U, date: "2026-09-20", type: "text", title: "偽裝", content: "  DATA:image/png;base64,QUFB", is_checked: false, sort_order: 0 },
      { id: "b5", user_id: U, date: "2026-09-20", type: "callout", title: "未知類型", content: "未知內容", is_checked: false, sort_order: 1 },
      { id: "b6", user_id: U, date: "2026-09-21", type: "text", title: null, content: "純文字白板", is_checked: false, sort_order: 0 },
      { id: "b7", user_id: U, date: "2026-09-21", type: "link", title: null, content: "https://no-title.example", is_checked: false, sort_order: 1 },
    ],
    time_blocks: [
      { id: "tb1", user_id: U, date: "2026-09-19", start_time: "09:00:00", end_time: "10:30:00", type: "focus", label: "深度工作", notes: "寫完第一章", color: "#f00" },
      { id: "tbO", user_id: O, date: "2026-09-19", start_time: "09:00:00", end_time: "10:30:00", type: "focus", label: "別人的時段", notes: null, color: "#f00" },
    ],
    meeting_imports: [
      { id: "m1", user_id: U, status: "succeeded", title: "產品週會", meeting_date: "2026-09-18", transcript: "逐字稿不可送出",
        context: { participants: [{ name: "與會者甲" }] }, result: { summary: "確認十月上線範圍", decisions: ["延後匯出功能"], tasks: [{ source: "任務原文不可送" }], questions: ["問題不可送"] } },
      { id: "m2", user_id: U, status: "failed", title: "失敗的會議", meeting_date: "2026-09-18", result: null },
    ],
  };
}

const build = (tables: Record<string, Record<string, unknown>[]>, includeMeetingHighlights = false, opts = {}) => {
  const db = fakeDb(tables, opts);
  return {
    db,
    run: () => buildMaterial({ db, userId: U, window: computePeriod("this_week", NOW), includeMeetingHighlights, locale: "zh-TW", now: NOW }),
  };
};

test("every query names the owner and selects only whitelisted columns", async () => {
  const { db, run } = build(fixture(), true);
  await run();
  assert.ok(db.queries.length >= 10);
  for (const q of db.queries) {
    const owner = q.ops.some(([op, c, v]) => op === "eq" && (c === "user_id" || c === "recipient_id") && v === U);
    assert.ok(owner, `${q.table} query without an owner filter`);
    const allowed = Object.values(SELECT) as string[];
    assert.ok(allowed.includes(q.select), `${q.table} selects ${q.select}`);
    for (const banned of ["attendees", "location", "meeting_url", "google_event_id", "assignee", "return_note", "transcript", "context", "color", "x,", "metadata,", "tasks:", "questions"]) {
      assert.ok(!q.select.includes(banned), `${q.table} selects ${banned}`);
    }
  }
});

test("tasks: another person's task, archived workspace and excluded fields never appear", async () => {
  const { run } = build(fixture());
  const m = await run();
  for (const s of ["別人指派給我的任務", "封存工作區任務", "王小明", "信義路", "meet.example", "gev123", "退回原因", "別人的"]) {
    assert.ok(!m.text.includes(s), `leaked ${s}`);
  }
  assert.ok(m.text.includes("寫季報") && m.text.includes("desc: 彙整三個專案") && m.text.includes("notes: 圖表下週補"));
});

test("levels: source column first, then R1 link row, then R2 text; imports lose the description", async () => {
  const { run } = build(fixture());
  const m = await run();
  const line = (title: string) => m.text.split("\n").find((l) => l.includes(title)) ?? "";
  // L0 by source column even though the description no longer starts with 指派人：
  assert.match(line("回覆報價"), /^- \[from-meeting-assignment\] 回覆報價 \| done=2026-09-20T11:00\+08:00 \| due=2026-09-26 \| sched=2026-09-22 09:00-09:30$/);
  assert.ok(!m.text.includes("秘密備註二") && !m.text.includes("我改掉了開頭"));
  // L0 by R1 (link row) and by R2 (text fallback)
  assert.ok(line("連結列任務").startsWith("- [from-meeting-assignment]") && !m.text.includes("連結列說明三") && !m.text.includes("備註三"));
  assert.ok(line("文字後備任務").startsWith("- [from-meeting-assignment]") && !m.text.includes("備註四"));
  // L1 by source column and by the 來源原文 fallback: notes allowed, description never
  assert.ok(line("我的會議匯入").includes("notes: 可送備註五") && !m.text.includes("逐字稿秘密五"));
  assert.ok(line("舊匯入") && !m.text.includes("逐字稿秘密六"));
  // An accepted link of SOMEONE ELSE (recipient O) does not demote my task
  assert.ok(!line("寫季報").includes("[from-meeting-assignment]"));
});

test("taskLevel truth table", () => {
  assert.equal(taskLevel({ source: "meeting_assignment", linked: false, description: "x" }), "L0");
  assert.equal(taskLevel({ source: "self", linked: true, description: "x" }), "L0");
  assert.equal(taskLevel({ source: "self", linked: false, description: "前言\n指派人：A" }), "L0");
  assert.equal(taskLevel({ source: "meeting_import", linked: true, description: "" }), "L0");
  assert.equal(taskLevel({ source: "meeting_import", linked: false, description: null }), "L1");
  assert.equal(taskLevel({ source: "self", linked: false, description: "來源原文：x" }), "L1");
  assert.equal(taskLevel({ source: "self", linked: false, description: "說明裡提到指派人：但不在行首" }), "L2");
  assert.equal(taskLevel({ source: undefined, linked: false, description: undefined }), "L2");
});

test("sticky notes and focus board: text only, no images, no URLs, unknown types dropped", async () => {
  const { run } = build(fixture());
  const m = await run();
  assert.ok(m.text.includes("folder=靈感") && m.text.includes("下一版想加語音輸入") && m.text.includes("參考這裡"));
  for (const s of ["secret.example", "token", "base64", "iVBORw0KGgo", "太舊的便條", "別人的便條", "data:", "DATA:", "截圖", "未知", "no-title", "docs.example"]) {
    assert.ok(!m.text.includes(s), `leaked ${s}`);
  }
  assert.ok(m.text.includes("- 2026-09-19 | todo[x] | 週五檢查 | [x] 備份資料庫"));
  assert.ok(m.text.includes("- 2026-09-19 | link | 參考文件"));
  assert.ok(m.text.includes("- 2026-09-21 | text | 純文字白板"));
  assert.ok(!scanMaterial(m.text), "material passes the final scan");
});

test("meeting highlights only when the stored switch is on, and only summary + decisions", async () => {
  const off = build(fixture(), false);
  const mOff = await off.run();
  assert.ok(!mOff.text.includes("## meetings") && !mOff.text.includes("產品週會"));
  assert.ok(!off.db.queries.some((q) => q.table === "meeting_imports"), "Q10 not even issued");
  const on = build(fixture(), true);
  const mOn = await on.run();
  assert.ok(mOn.text.includes("- 2026-09-18 | 產品週會 | summary: 確認十月上線範圍 | decisions: 延後匯出功能"));
  for (const s of ["逐字稿不可送出", "與會者甲", "任務原文不可送", "問題不可送", "失敗的會議"]) assert.ok(!mOn.text.includes(s), s);
});

test("numbers are computed by code (review-page algorithm)", async () => {
  const { run } = build(fixture());
  const m = await run();
  assert.deepEqual(m.stats, {
    completed_count: 2, // t1, t2 (t2 is my row; the review page counts it too)
    created_count: 4, // t3 t4 t5 t6 (t7 archived workspace, tO not mine)
    scheduled_minutes: 210, // t2 30 + t8 60 + t9 120
    meeting_minutes: 60,
    focus_minutes: 150,
    meeting_count: 1,
    open_overdue_count: 1, // t10
    time_block_minutes: 90,
    time_block_count: 1,
    sticky_note_count: 1,
    board_item_count: 3,
  });
  assert.ok(m.text.includes("[stats] completed_count=2 created_count=4 scheduled_minutes=210"));
  assert.ok(m.text.includes("[workspaces] 工作=210min/3"));
  assert.ok(m.hasData);
});

test("last_week has no open_overdue_count and an exclusive date end", async () => {
  const db = fakeDb(fixture());
  const m = await buildMaterial({ db, userId: U, window: computePeriod("last_week", NOW), includeMeetingHighlights: false, locale: "en", now: NOW });
  assert.ok(!("open_overdue_count" in m.stats));
  const tb = db.queries.find((q) => q.table === "time_blocks")!;
  assert.ok(tb.ops.some(([op, c, v]) => op === "lt" && c === "date" && v === "2026-09-17"));
});

test("NO_DATA: only overdue/open tasks do not count as activity", async () => {
  const t = fixture();
  const { run } = build({ workspaces: t.workspaces, categories: t.categories, tasks: [t.tasks.find((x) => (x as Record<string, unknown>).id === "t10")!] });
  const m = await run();
  assert.equal(m.hasData, false);
  const empty = await build({}).run();
  assert.equal(empty.hasData, false);
});

test("any failed query aborts the whole material (fail closed)", async () => {
  for (const table of ["tasks", "meeting_task_assignments", "sticky_notes", "scratchpad_items", "time_blocks", "workspaces"]) {
    const { run } = build(fixture(), false, { failOn: [table] });
    await assert.rejects(run(), /MATERIAL_QUERY_FAILED/, table);
  }
});

test("the assignment link list must be complete: hitting the page cap fails closed", async () => {
  const many = Array.from({ length: LIMITS.assignmentPage * LIMITS.assignmentPages }, (_, i) => ({
    task_id: `x${String(i).padStart(6, "0")}`, recipient_id: U, status: "accepted",
  }));
  const { run } = build({ ...fixture(), meeting_task_assignments: many });
  await assert.rejects(run(), /MATERIAL_QUERY_FAILED/);
});

test("total material stays under 60,000 bytes and reports what was left out", async () => {
  const notes = Array.from({ length: 60 }, (_, i) => ({
    id: `n${i}`, user_id: U, folder_id: null, updated_at: `2026-09-2${i % 3}T03:00:00Z`, content: doc(p("字".repeat(800))),
  }));
  const blocks = Array.from({ length: 400 }, (_, i) => ({
    id: `b${i}`, user_id: U, date: "2026-09-20", start_time: "09:00:00", end_time: "09:30:00", type: "focus", label: "標".repeat(80), notes: "備".repeat(300),
  }));
  const { run } = build({ ...fixture(), sticky_notes: notes, time_blocks: blocks });
  const m = await run();
  assert.ok(byteLength(m.text) <= MATERIAL_BYTE_LIMIT, String(byteLength(m.text)));
  assert.match(m.text, /另有 \d+ 筆未列出/);
  assert.equal(m.stats.time_block_count, 400, "stats use every row even when the material is trimmed");
  assert.ok(m.stats.sticky_note_count < 60 || /## time_blocks \(\d+，另有/.test(m.text));
});

test("task text is fetched in batches by id, owner-filtered", async () => {
  const many = Array.from({ length: 250 }, (_, i) => task({ id: `k${String(i).padStart(4, "0")}`, title: `T${i}`, created_at: IN }));
  const { db, run } = build({ ...fixture(), tasks: many });
  await run();
  const textQueries = db.queries.filter((q) => q.table === "tasks" && q.select === SELECT.taskText);
  assert.ok(textQueries.length >= 1);
  for (const q of textQueries) {
    const ids = q.ops.find(([op]) => op === "in")![2] as unknown[];
    assert.ok(ids.length <= LIMITS.textBatch);
  }
});
