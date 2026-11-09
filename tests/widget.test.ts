import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, type Data, type Task } from "../src/logic.ts";
import { createWidgetSnapshot, handleWidgetCommand, parseWidgetLink, widgetCandidates, type WidgetCommand, type WidgetCommandPort } from "../src/widget.ts";

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id, title: "Send the brief", meetingId: "private-meeting", requesterId: "person", requestedOn: "2026-11-09",
    dueOn: "2026-11-09", status: "open", completedAt: null, createdAt: "2026-11-09T10:00:00Z", priority: "none",
    pinned: false, evening: false, repeatRule: null, notes: "private notes", movedCount: 0, parentId: null,
    remind: false, updatedAt: "2026-11-09", tagIds: [], owner: "mine", ...patch,
  };
}

function data(tasks: Task[]): Data {
  return {
    people: [], companies: [], meetings: [], tasks, checks: [], tags: [], decisions: [], activity: [], attachments: [],
    templates: [], views: [], removed: [], settings: { ...DEFAULT_SETTINGS, widgetEnabled: true, googleIcal: "private-address" },
    bullets: [], sections: [], lifeDates: [], gifts: [], asks: [], logs: [],
  };
}

const command: WidgetCommand = {
  schema_version: 1, id: "f7fdde4b-6bc3-4892-bb57-830605c584ce", action: "complete_task", task_id: "mine", issued_at: "2026-11-09T10:00:00Z",
};

test("widget projection contains only own active top-level dated tasks and minimal fields", () => {
  const all = data([
    task("mine"), task("overdue", { dueOn: "2026-11-07" }), task("future", { dueOn: "2026-11-10", hideUntil: "2026-11-10" }),
    task("theirs", { owner: "theirs" }), task("child", { parentId: "mine" }), task("no-date", { dueOn: null }),
    task("invalid", { dueOn: "2026-02-30" }), task("waiting", { status: "waiting" }), task("done", { status: "done" }),
    task("someday", { someday: true }), task("wake", { wake: "meeting" }), task("unfiled", { unfiled: true }),
    task("returned", { returned: true }), task("paused", { requesterId: "paused" }),
  ]);
  all.people.push({ id: "paused", name: "Private name", paused: true, note: "", createdAt: "", color: "", companyId: null, checkInOn: null, cadenceDays: null });
  all.settings.onlyPersonId = "someone-else";
  const snapshot = createWidgetSnapshot(all, new Date("2026-11-09T12:00:00Z"));
  assert.deepEqual(snapshot.tasks.map((item) => item.id), ["overdue", "mine", "future"]);
  assert.equal(snapshot.tasks[2].hide_until, "2026-11-10");
  assert.deepEqual(Object.keys(snapshot.tasks[0]).sort(), ["due_on", "hide_until", "id", "title", "visible_on"]);
  const json = JSON.stringify(snapshot);
  for (const secret of ["private-meeting", "private notes", "private-address", "Private name"]) assert.ok(!json.includes(secret));
});

test("widget snapshot is emptied when sharing is off and bounds long task lists and titles", () => {
  const all = data(Array.from({ length: 510 }, (_, i) => task(`task-${String(i).padStart(4, "0")}`, { title: "x".repeat(600) + "\n" })));
  const snapshot = createWidgetSnapshot(all);
  assert.equal(snapshot.tasks.length, 500);
  assert.equal(snapshot.tasks[0].title.length, 512);
  all.tasks = [task("unicode", { title: "😀 ação ".repeat(120) }), task("empty", { title: "\u0000\u0001" })];
  const unicode = createWidgetSnapshot(all);
  assert.equal(unicode.tasks.length, 1);
  assert.ok(new TextEncoder().encode(unicode.tasks[0].title).length <= 512);
  assert.ok(!unicode.tasks[0].title.includes("\ufffd"));
  all.settings.widgetEnabled = false;
  assert.deepEqual(createWidgetSnapshot(all).tasks, []);
});

function portFor(current: Data) {
  const receipts = new Set<string>();
  const completions: string[] = [];
  const port: WidgetCommandPort = {
    hasReceipt: async (id) => receipts.has(id),
    load: async () => current,
    complete: async (id) => { completions.push(id); current.tasks.find((item) => item.id === id)!.status = "done"; },
    recordReceipt: async (item) => { receipts.add(item.id); },
  };
  return { port, receipts, completions };
}

test("completion retry after lost acknowledgement and Undo never completes a recurring task twice", async () => {
  const current = data([task("mine", { repeatRule: "daily" })]);
  const { port, completions } = portFor(current);
  assert.equal(await handleWidgetCommand(command, port, "2026-11-09"), "completed");
  current.tasks[0].status = "open"; // The user undid the task while queue acknowledgement was lost.
  assert.equal(await handleWidgetCommand(command, port, "2026-11-09"), "duplicate");
  assert.deepEqual(completions, ["mine"]);
  assert.equal(current.tasks[0].status, "open");
});

test("queued completions recheck current ownership, visibility, due date and sharing", async () => {
  const scenarios = [
    data([task("mine", { owner: "theirs" })]), data([task("mine", { dueOn: "2026-11-10" })]),
    data([task("mine", { hideUntil: "2026-11-10" })]), data([task("mine", { status: "done" })]), data([]),
  ];
  const disabled = data([task("mine")]); disabled.settings.widgetEnabled = false; scenarios.push(disabled);
  for (const current of scenarios) {
    const { port, receipts, completions } = portFor(current);
    assert.equal(await handleWidgetCommand(command, port, "2026-11-09"), "ignored");
    assert.equal(completions.length, 0);
    assert.ok(receipts.has(command.id));
  }
});

test("failed completion does not issue a receipt or allow queue acknowledgement", async () => {
  const { port, receipts } = portFor(data([task("mine")]));
  port.complete = async () => { throw new Error("synthetic save failure"); };
  await assert.rejects(handleWidgetCommand(command, port, "2026-11-09"), /synthetic save failure/);
  assert.equal(receipts.size, 0);
});

test("future hidden tasks become eligible after midnight without publishing private context", () => {
  const snapshot = createWidgetSnapshot(data([task("mine", { dueOn: "2026-11-10", hideUntil: "2026-11-10" })]), new Date("2026-11-09T12:00:00Z"));
  assert.equal(snapshot.tasks.length, 1);
  assert.ok(!snapshot.tasks[0].visible_on.includes("2026-11-09"));
  assert.ok(snapshot.tasks[0].visible_on.includes("2026-11-10"));
  assert.equal(snapshot.valid_through, "2026-11-15");
});

test("widget follows weekday, Away and sequential Home rules at each day boundary", () => {
  const all = data([task("weekend", { dueOn: "2026-11-07" }), task("next", { dueOn: "2026-11-10" })]);
  all.settings.weekdayOnly = true;
  const weekend = createWidgetSnapshot(all, new Date("2026-11-07T12:00:00Z"));
  assert.equal(weekend.tasks[0].due_on, "2026-11-09");
  assert.ok(!weekend.tasks[0].visible_on.includes("2026-11-07"));
  all.settings.awayFrom = "2026-11-09"; all.settings.awayUntil = "2026-11-10";
  assert.ok(!widgetCandidates(all, "2026-11-10").some((item) => item.id === "weekend"));
  assert.ok(widgetCandidates(all, "2026-11-11").some((item) => item.id === "weekend"));
  all.settings.awayFrom = null; all.settings.awayUntil = null;
  all.people.push({ id: "person", name: "Fictional", sequential: true, note: "", createdAt: "", color: "", companyId: null, checkInOn: null, cadenceDays: null });
  assert.deepEqual(widgetCandidates(all, "2026-11-10").map((item) => item.id), ["weekend"]);
});

test("widget links permit navigation only, never injected text, external URLs or writes", () => {
  assert.deepEqual(parseWidgetLink("todotracker://capture"), { page: "capture" });
  assert.deepEqual(parseWidgetLink("todotracker://today/"), { page: "today" });
  assert.deepEqual(parseWidgetLink("todotracker://task/123-abc"), { page: "task", taskId: "123-abc" });
  for (const raw of ["https://capture", "todotracker://capture?text=bad", "todotracker://complete_task/id", "todotracker://user@today", "todotracker://task/a/b", "todotracker://task/%2F", "todotracker://today#bad"]) {
    assert.equal(parseWidgetLink(raw), null, raw);
  }
});
