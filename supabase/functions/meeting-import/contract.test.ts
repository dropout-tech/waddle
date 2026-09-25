import {
  generation,
  taskSelection,
  validateResult,
  taipeiMonth,
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
      dueDate: "",
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
          dueDate: "",
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

Deno.test('A participant called 我 is not a reliable speaker label',()=>{
 const p={id:crypto.randomUUID(),name:'我',organization:'',aliases:[],userId:crypto.randomUUID()};
 const source='我會再檢查一次薪資。';
 const result=validateResult({summary:'摘要',decisions:[],questions:[],tasks:[{title:'檢查薪資',owner:'我',dueDate:'',source,ownerParticipantId:p.id,ownerEvidence:source,assignmentConfidence:'explicit',assignmentReason:'我'}]},source,[p]);
 assert(result.tasks[0].ownerParticipantId==='');
})
