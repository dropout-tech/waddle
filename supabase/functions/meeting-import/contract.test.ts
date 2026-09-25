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
