// Test-account authentication only; every data/API call is mocked. No AI spend.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const server = spawn(
  "node",
  ["node_modules/next/dist/bin/next", "start", "-p", "3172"],
  { stdio: "ignore" },
);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch("http://localhost:3172/login")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const env = Object.fromEntries(
  readFileSync(".env.e2e.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ws = "00000000-0000-4000-8000-000000000001",
  cat = "00000000-0000-4000-8000-000000000002";
let meetings = [],
  used = 0,
  imports = 0,
  failImport = true;
await context.route("**/rest/v1/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  let data = [];
  if (path.endsWith("/workspaces"))
    data = [
      {
        id: ws,
        name: "工作",
        color: "#9BBFAC",
        icon: "folder",
        sort_order: 0,
        is_archived: false,
        is_default: true,
      },
    ];
  if (path.endsWith("/categories"))
    data = [
      {
        id: cat,
        workspace_id: ws,
        name: "待辦",
        sort_order: 0,
        is_archived: false,
        is_default: true,
      },
    ];
  return route.fulfill({ status: 200, json: data });
});
await context.route("**/functions/v1/meeting-import", async (route) => {
  const b = route.request().postDataJSON();
  if (b.action === "list")
    return route.fulfill({
      json: {
        meetings,
        used,
        pending: 0,
        limit: 20,
        month: "2026-09-01",
        enabled: true,
      },
    });
  if (b.action === "generate") {
    used++;
    const meeting = {
      id: b.id,
      title: b.title,
      meeting_date: b.meetingDate,
      status: "succeeded",
      created_at: new Date().toISOString(),
      imported_tasks: {},
      result: {
        summary: "確認新版報價與網站改版方向。",
        decisions: ["先完成新版報價。"],
        questions: ["首頁是否改版仍待討論。"],
        tasks: [
          {
            title: "更新報價",
            owner: "小陳",
            dueDate: "2026-09-30",
            source: "小陳下週三更新報價。",
          },
        ],
      },
    };
    meetings = [meeting];
    return route.fulfill({ json: { meeting } });
  }
  if (b.action === "import") {
    imports++;
    assert.equal(b.categoryId, cat);
    assert.equal(b.tasks[0].title, "更新並寄出報價");
    if (failImport)
      return route.fulfill({ status: 400, json: { error: "IMPORT_FAILED" } });
    meetings[0].imported_tasks = { 0: "00000000-0000-4000-8000-000000000003" };
    return route.fulfill({
      json: { importedTasks: meetings[0].imported_tasks },
    });
  }
  throw new Error("Unexpected action");
});
await page.addInitScript(() => {
  localStorage.setItem("waddle.waterReminder.enabled", "0");
  localStorage.setItem("waddle-language-v1", "zh-TW");
});
mkdirSync("/tmp/huddle-meeting-shots", { recursive: true });
try {
  await page.goto("http://localhost:3172/login");
  await page.locator("#email").fill(env.E2E_EMAIL);
  await page.locator("#password").fill(env.E2E_PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), {
    timeout: 60000,
  });
  await page.goto("http://localhost:3172/meetings");
  await page.getByText("本月已用 0 / 20 次", { exact: false }).waitFor();
  await page.getByLabel("會議名稱", { exact: true }).fill("網站改版會議");
  await page.locator("input[type=file]").setInputFiles({
    name: "meeting.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "小陳下週三更新報價。網站首頁是否要修改，我們還要再討論。",
    ),
  });
  await page
    .getByRole("button", { name: "整理紀錄與任務", exact: true })
    .click();
  await page.getByLabel("任務名稱", { exact: true }).fill("更新並寄出報價");
  await page.getByText("本月已用 1 / 20 次", { exact: false }).waitFor();
  await page.locator("main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "/tmp/huddle-meeting-shots/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "確認並加入 1 個任務", exact: true })
    .click();
  await page
    .getByText("任務未能建立，請確認目標分類仍可使用後重試。", { exact: true })
    .waitFor();
  assert.equal(used, 1);
  failImport = false;
  await page
    .getByRole("button", { name: "確認並加入 1 個任務", exact: true })
    .click();
  await page
    .getByText("已加入任務清單，可返回工作面板查看與安排。", { exact: true })
    .waitFor();
  assert.equal(imports, 2);
  assert.equal(used, 1);
  assert(await page.getByRole("checkbox", { name: "選取任務 1" }).isDisabled());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "/tmp/huddle-meeting-shots/mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  used = 20;
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await page.getByText("本月已用 20 / 20 次", { exact: false }).waitFor();
  await page.getByText("整理另一份會議", {exact:true}).click();
  assert(
    await page
      .getByRole("button", { name: "整理紀錄與任務", exact: true })
      .isDisabled(),
  );
  await page.reload();
  await page.getByText("本月已用 20 / 20 次", { exact: false }).waitFor();
  await page.getByRole("button", { name: /網站改版會議/ }).click();
  assert(await page.getByRole("checkbox", { name: "選取任務 1" }).isDisabled());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: file input, conversion, editing, import failure/retry, durable dedup UI, quota, reload/history, 390px layout",
  );
} catch (error) {
  console.log(
    (
      await page
        .locator("main")
        .innerText()
        .catch(() => "No main")
    ).slice(0, 1600),
  );
  throw error;
} finally {
  await browser.close();
  server.kill();
}
