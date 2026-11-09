import { addDays, tasksForHome, todayISO, type Data, type Task } from "./logic.ts";

export type WidgetTask = {
  id: string;
  title: string;
  due_on: string | null;
  hide_until: string | null;
  visible_on: string[];
};

export type WidgetSnapshot = {
  schema_version: 1;
  generated_at: string;
  time_zone: string;
  valid_through: string;
  tasks: WidgetTask[];
};

export type WidgetCommand = {
  schema_version: 1;
  id: string;
  action: "complete_task";
  task_id: string;
  issued_at: string;
};

export type WidgetStatus = {
  state: "ready" | "not_available";
  reason: string | null;
  pending_command_count: number;
  generated_at: string | null;
};

export type WidgetDestination = { page: "capture" | "today" } | { page: "task"; taskId: string };

function validDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const controls = /[\u0000-\u001f\u007f-\u009f]/g;

function byteLength(value: string): number { return encoder.encode(value).length; }

function widgetTitle(value: string): string {
  const clean = value.replace(controls, " ").trim();
  const bytes = encoder.encode(clean);
  if (bytes.length <= 512) return clean;
  let end = 512;
  while ((bytes[end] & 0xc0) === 0x80) end--;
  return decoder.decode(bytes.subarray(0, end));
}

/** Widget scope is independent of the person filter on the main board. */
export function widgetCandidates(data: Data, today = todayISO()): Task[] {
  return tasksForHome({ ...data, settings: { ...data.settings, onlyPersonId: null } }, today).filter((task) =>
    task.owner !== "theirs" && validDay(task.dueOn) &&
    (!task.hideUntil || validDay(task.hideUntil)) &&
    /^[A-Za-z0-9_-]+$/.test(task.id) && byteLength(task.id) <= 128 && task.title.replace(controls, " ").trim().length > 0,
  ).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function createWidgetSnapshot(data: Data, now = new Date()): WidgetSnapshot {
  const today = todayISO(now);
  const tasks = new Map<string, WidgetTask>();
  if (data.settings.widgetEnabled) {
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(today, offset);
      for (const task of widgetCandidates(data, day)) {
        if (task.dueOn! > day) continue;
        const existing = tasks.get(task.id);
        if (existing) { existing.visible_on.push(day); continue; }
        tasks.set(task.id, {
          id: task.id,
          title: widgetTitle(task.title),
          due_on: task.dueOn,
          hide_until: task.hideUntil || null,
          visible_on: [day],
        });
      }
    }
  }
  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    valid_through: addDays(today, 6),
    // Precompute Home's visibility for midnight rollover without sharing private settings or people.
    tasks: [...tasks.values()].sort((a, b) => a.due_on!.localeCompare(b.due_on!) || a.id.localeCompare(b.id)).slice(0, 500),
  };
}

export function parseWidgetLink(raw: string): WidgetDestination | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "todotracker:" || url.username || url.password || url.port || url.search || url.hash) return null;
    if ((url.hostname === "capture" || url.hostname === "today") && (!url.pathname || url.pathname === "/")) {
      return { page: url.hostname };
    }
    if (url.hostname !== "task" || !/^\/[^/]+$/.test(url.pathname)) return null;
    const taskId = decodeURIComponent(url.pathname.slice(1));
    return taskId.length <= 128 && /^[A-Za-z0-9_-]+$/.test(taskId) ? { page: "task", taskId } : null;
  } catch {
    return null;
  }
}

export type WidgetCommandPort = {
  hasReceipt: (id: string) => Promise<boolean>;
  load: () => Promise<Data>;
  complete: (taskId: string) => Promise<void>;
  recordReceipt: (command: WidgetCommand) => Promise<void>;
};

/** Caller pins all four operations to one transaction; acknowledge the queue only after commit. */
export async function handleWidgetCommand(
  command: WidgetCommand,
  port: WidgetCommandPort,
  today = todayISO(),
): Promise<"completed" | "ignored" | "duplicate"> {
  if (await port.hasReceipt(command.id)) return "duplicate";
  const current = await port.load();
  const task = widgetCandidates(current, today).find((item) => item.id === command.task_id);
  const eligible = current.settings.widgetEnabled && task && task.dueOn! <= today && (!task.hideUntil || task.hideUntil <= today);
  if (eligible) await port.complete(task.id);
  // Receipts survive Undo and lost queue acknowledgements, including intentionally skipped taps.
  await port.recordReceipt(command);
  return eligible ? "completed" : "ignored";
}
