import {
  generation,
  taskSelection,
  validateResult,
  taipeiMonth,
  meetingWeekday,
  resolveDue,
} from "./contract.ts";
const assert = (v: unknown) => {
  if (!v) throw new Error("Assertion failed");
};
Deno.test("Taipei month boundary is independent of client timezone", () => {
  assert(taipeiMonth(new Date("2026-09-30T15:59:59Z")) === "2026-09-01");
  assert(taipeiMonth(new Date("2026-09-30T16:00:00Z")) === "2026-10-01");
});
Deno.test("Reject excessive input and impossible dates", () => {
  const base = {
    action: "generate",
    id: crypto.randomUUID(),
    title: "Meeting",
    meetingDate: "2026-09-25",
    transcript: "x".repeat(20),
  };
  assert(generation.safeParse(base).success);
  assert(
    !generation.safeParse({ ...base, transcript: "x".repeat(40001) }).success,
  );
  assert(!generation.safeParse({ ...base, meetingDate: "2026-02-30" }).success);
  assert(
    !generation.safeParse({ ...base, transcript: " ".repeat(20) }).success,
  );
});
Deno.test(
  "Task evidence must occur verbatim; empty task lists are valid",
  () => {
    const result = {
      summary: "Summary",
      decisions: [],
      questions: [],
      tasks: [],
    };
    assert(validateResult(result, "hello").tasks.length === 0);
    const task = {
      title: "Prepare quote",
      owner: "",
      due: { kind: "none" },
      source: "Prepare quote",
    };
    assert(
      validateResult(
        { ...result, tasks: [task] },
        "Please Prepare quote tomorrow",
      ).tasks.length === 1,
    );
    let rejected = false;
    try {
      validateResult({ ...result, tasks: [task] }, "Nothing was decided");
    } catch {
      rejected = true;
    }
    assert(rejected);
  },
);
Deno.test(
  "Task import rejects empty selections, out of range indices and malformed due dates",
  () => {
    const base = {
      action: "import",
      id: crypto.randomUUID(),
      categoryId: crypto.randomUUID(),
      tasks: [{ index: 0, title: "Do work", owner: "", dueDate: "" }],
    };
    assert(taskSelection.safeParse(base).success);
    assert(!taskSelection.safeParse({ ...base, tasks: [] }).success);
    assert(
      !taskSelection.safeParse({
        ...base,
        tasks: [{ ...base.tasks[0], index: 20 }],
      }).success,
    );
    assert(
      !taskSelection.safeParse({
        ...base,
        tasks: [{ ...base.tasks[0], dueDate: "2026-02-30" }],
      }).success,
    );
  },
);

Deno.test(
  "Unlabelled first-person, team owners, and ambiguous aliases never auto-assign",
  () => {
    const person = {
      id: crypto.randomUUID(),
      name: "林怡",
      organization: "開發",
      aliases: ["小林"],
      userId: crypto.randomUUID(),
    };
    const make = (source: string, evidence: string, id = person.id) => ({
      summary: "摘要",
      decisions: [],
      questions: [],
      tasks: [
        {
          title: "確認薪資",
          owner: "林怡",
          due: { kind: "none" },
          source,
          ownerParticipantId: id,
          ownerEvidence: evidence,
          assignmentConfidence: "explicit",
          assignmentReason: "測試",
        },
      ],
    });
    const unknown = "我會再檢查一次薪資。";
    assert(
      validateResult(make(unknown, unknown), unknown, [person]).tasks[0]
        .assignmentConfidence === "uncertain",
    );
    const named = "請小林確認薪資。";
    assert(
      validateResult(make(named, named), named, [person]).tasks[0]
        .ownerParticipantId === person.id,
    );
    const ambiguous = {
      ...person,
      id: crypto.randomUUID(),
      name: "林明",
      userId: crypto.randomUUID(),
    };
    assert(
      validateResult(make(named, named), named, [person, ambiguous]).tasks[0]
        .ownerParticipantId === "",
    );
    assert(
      validateResult(make(named, named, crypto.randomUUID()), named, [person])
        .tasks[0].ownerParticipantId === "",
    );
  },
);
Deno.test(
  "Metadata and idempotency context reject repeated identities and malformed time",
  () => {
    const id = crypto.randomUUID();
    const base = {
      action: "generate",
      id: crypto.randomUUID(),
      title: "會議",
      meetingDate: "2026-09-25",
      transcript: "原文".repeat(20),
      context: { meetingTime: "25:00" },
    };
    assert(!generation.safeParse(base).success);
    const participant = {
      id,
      name: "測試",
      organization: "",
      aliases: [],
      userId: "",
    };
    assert(
      !generation.safeParse({
        ...base,
        context: { participants: [participant, participant] },
      }).success,
    );
  },
);

// meetingDate 2026-09-26 is a Saturday. These are exactly the acceptance
// cases the coordinator specified for the deterministic due-date engine.
Deno.test("resolveDue: this-week weekday already past rolls forward to next week", () => {
  // 這週五 -> weekday=5 (Fri), week:"this". This week's Friday (09-25) is
  // before the meeting, so it must roll to next week's Friday.
  assert(
    resolveDue({ kind: "weekday", weekday: 5, week: "this" }, "2026-09-26") ===
      "2026-10-02",
  );
});
Deno.test("resolveDue: bare 週三 (this-week) already past rolls forward", () => {
  // 週三 -> weekday=3 (Wed), week:"this". This week's Wednesday (09-23) is
  // before the meeting, so it must roll to next week's Wednesday.
  assert(
    resolveDue({ kind: "weekday", weekday: 3, week: "this" }, "2026-09-26") ===
      "2026-09-30",
  );
});
Deno.test("resolveDue: explicit 下週一 always means next week, unconditionally", () => {
  assert(
    resolveDue({ kind: "weekday", weekday: 1, week: "next" }, "2026-09-26") ===
      "2026-09-28",
  );
});
Deno.test("resolveDue: relative_days counts from the meeting date (明天=1)", () => {
  assert(
    resolveDue({ kind: "relative_days", days: 1 }, "2026-09-26") ===
      "2026-09-27",
  );
});
Deno.test("resolveDue: none/date/backstop", () => {
  assert(resolveDue({ kind: "none" }, "2026-09-26") === "");
  // A literal transcript date is passed through as-is when not in the past.
  assert(
    resolveDue({ kind: "date", date: "2026-10-10" }, "2026-09-26") ===
      "2026-10-10",
  );
  // The hard backstop still applies even to a literal past date.
  assert(resolveDue({ kind: "date", date: "2026-09-01" }, "2026-09-26") === "");
  // A this-week weekday that is still upcoming (not yet past) stays as-is.
  assert(
    resolveDue({ kind: "weekday", weekday: 6, week: "this" }, "2026-09-26") ===
      "2026-09-26",
  );
});
Deno.test(
  "validateResult wires the model's structured `due` into a plain dueDate string, end to end",
  () => {
    const result = {
      summary: "摘要",
      decisions: [],
      questions: [],
      tasks: [
        {
          title: "交設計稿",
          owner: "",
          due: { kind: "weekday", weekday: 5, week: "this" },
          source: "這週五前交設計稿",
        },
        {
          title: "跟供應商確認報價",
          owner: "",
          due: { kind: "weekday", weekday: 3, week: "this" },
          source: "記得週三要跟供應商確認報價",
        },
        {
          title: "提交報告",
          owner: "",
          due: { kind: "weekday", weekday: 1, week: "next" },
          source: "下週一前提交報告",
        },
        {
          title: "回覆信件",
          owner: "",
          due: { kind: "relative_days", days: 1 },
          source: "明天回覆信件",
        },
      ],
    };
    const transcript =
      "這週五前交設計稿。記得週三要跟供應商確認報價。下週一前提交報告。明天回覆信件。";
    const out = validateResult(result, transcript, [], "2026-09-26").tasks;
    assert(out[0].dueDate === "2026-10-02", "這週五 -> next Friday");
    assert(out[1].dueDate === "2026-09-30", "週三 -> next Wednesday");
    assert(out[2].dueDate === "2026-09-28", "下週一 -> next Monday");
    assert(out[3].dueDate === "2026-09-27", "明天 -> meetingDate+1");
    assert(!("due" in out[0]), "internal `due` must not leak externally");
  },
);
Deno.test("meetingWeekday reports the Taipei calendar weekday", () => {
  assert(meetingWeekday("2026-09-26") === "星期六");
  assert(meetingWeekday("2026-09-28") === "星期一");
});
Deno.test('A participant called 我 is not a reliable speaker label',()=>{
 const p={id:crypto.randomUUID(),name:'我',organization:'',aliases:[],userId:crypto.randomUUID()};
 const source='我會再檢查一次薪資。';
 const result=validateResult({summary:'摘要',decisions:[],questions:[],tasks:[{title:'檢查薪資',owner:'我',due:{kind:'none'},source,ownerParticipantId:p.id,ownerEvidence:source,assignmentConfidence:'explicit',assignmentReason:'我'}]},source,[p]);
 assert(result.tasks[0].ownerParticipantId==='');
})
