export type TaskStatus = "open" | "done" | "set_aside";

export type Person = {
  id: string;
  name: string;
  note: string;
  createdAt: string;
};

export type Meeting = {
  id: string;
  personId: string;
  title: string;
  meetingDate: string;
  note: string;
  createdAt: string;
};

export type Task = {
  id: string;
  meetingId: string;
  requesterId: string;
  title: string;
  requestedOn: string;
  dueOn: string | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
};

export type Data = {
  people: Person[];
  meetings: Meeting[];
  tasks: Task[];
};

export type Bucket = "overdue" | "today" | "this_week" | "later" | "none";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayISO(now = new Date()): string {
  return formatISODate(now);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

export function startOfWeek(iso: string): string {
  const date = parseISODate(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatISODate(date);
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

export function daysBetween(from: string, to: string): number {
  const start = parseISODate(from).getTime();
  const end = parseISODate(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function nextMonday(today: string): string {
  const day = parseISODate(today).getDay();
  const delta = day === 0 ? 1 : 8 - day;
  return addDays(today, delta);
}

export function formatDay(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (iso === addDays(today, 1)) return "Tomorrow";
  const date = parseISODate(iso);
  const sameYear = date.getFullYear() === parseISODate(today).getFullYear();
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return sameYear ? base : `${base} ${date.getFullYear()}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getDay()];
}

export function dayNumber(iso: string): number {
  return parseISODate(iso).getDate();
}

export function bucketFor(task: Task, today: string): Bucket | null {
  if (task.status !== "open") return null;
  if (!task.dueOn) return "none";
  if (task.dueOn < today) return "overdue";
  if (task.dueOn === today) return "today";
  if (task.dueOn <= endOfWeek(today)) return "this_week";
  return "later";
}

export function groupOpen(tasks: Task[], today: string): Record<Bucket, Task[]> {
  const groups: Record<Bucket, Task[]> = {
    overdue: [],
    today: [],
    this_week: [],
    later: [],
    none: [],
  };
  for (const task of tasks) {
    const bucket = bucketFor(task, today);
    if (bucket) groups[bucket].push(task);
  }
  const byDue = (a: Task, b: Task) =>
    (a.dueOn ?? "").localeCompare(b.dueOn ?? "") || a.createdAt.localeCompare(b.createdAt);
  groups.overdue.sort(byDue);
  groups.today.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  groups.this_week.sort(byDue);
  groups.later.sort(byDue);
  groups.none.sort(
    (a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.createdAt.localeCompare(b.createdAt),
  );
  return groups;
}

export type DayMark = {
  date: string;
  tasks: number;
  meetings: number;
};

export function nextSevenDays(tasks: Task[], meetings: Meeting[], today: string): DayMark[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return {
      date,
      tasks: tasks.filter((task) => task.status === "open" && task.dueOn === date).length,
      meetings: meetings.filter((meeting) => meeting.meetingDate === date).length,
    };
  });
}

export function weekTotals(tasks: Task[], today: string): { label: string; count: number }[] {
  const start = startOfWeek(today);
  return [0, 1, 2].map((index) => {
    const from = addDays(start, index * 7);
    const to = addDays(from, 6);
    const count = tasks.filter(
      (task) => task.status === "open" && task.dueOn !== null && task.dueOn >= from && task.dueOn <= to,
    ).length;
    const label = index === 0 ? "This week" : index === 1 ? "Next week" : "The week after";
    return { label, count };
  });
}

export function openByPerson(tasks: Task[], people: Person[]): { person: Person; count: number }[] {
  return people
    .map((person) => ({
      person,
      count: tasks.filter((task) => task.status === "open" && task.requesterId === person.id).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name));
}

export function fullestDayLine(days: { date: string; count: number }[], today: string): string {
  const max = Math.max(0, ...days.map((day) => day.count));
  if (max === 0) return "Nothing is due in the next seven days.";
  const names = days
    .filter((day) => day.count === max)
    .map((day) => (day.date === today ? "Today" : weekdayShort(day.date)));
  if (names.length === 1) return `${names[0]} is the fullest day.`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are the fullest days.`;
}

export function waitingLine(rows: { person: Person; count: number }[]): string {
  if (rows.length === 0) return "No one is waiting.";
  const top = rows[0];
  if (rows.length === 1) {
    return top.count === 1
      ? `${top.person.name} is waiting on one task.`
      : `${top.person.name} is waiting on ${top.count} tasks.`;
  }
  return `${top.person.name} has the most open tasks.`;
}

export function oldestOpen(tasks: Task[], limit = 3): Task[] {
  return tasks
    .filter((task) => task.status === "open")
    .sort(
      (a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.createdAt.localeCompare(b.createdAt),
    )
    .slice(0, limit);
}

export function weekFlow(tasks: Task[], today: string): { asked: number; finished: number } {
  const from = startOfWeek(today);
  const to = endOfWeek(today);
  return {
    asked: tasks.filter((task) => task.requestedOn >= from && task.requestedOn <= to).length,
    finished: tasks.filter(
      (task) =>
        task.status === "done" &&
        task.completedAt !== null &&
        task.completedAt >= from &&
        task.completedAt <= to,
    ).length,
  };
}

export function meetingsForPerson(meetings: Meeting[], personId: string): Meeting[] {
  return meetings
    .filter((meeting) => meeting.personId === personId)
    .sort(
      (a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.createdAt.localeCompare(a.createdAt),
    );
}

export function lastMetMeeting(meetings: Meeting[], personId: string, today: string): Meeting | null {
  const past = meetingsForPerson(meetings, personId).filter((meeting) => meeting.meetingDate <= today);
  return past[0] ?? null;
}

export function nextMeeting(meetings: Meeting[], personId: string, today: string): Meeting | null {
  const future = meetingsForPerson(meetings, personId)
    .filter((meeting) => meeting.meetingDate > today)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate) || a.createdAt.localeCompare(b.createdAt));
  return future[0] ?? null;
}

export function meetingIdsForPerson(meetings: Meeting[], personId: string): Set<string> {
  return new Set(meetings.filter((meeting) => meeting.personId === personId).map((meeting) => meeting.id));
}

export function openTasksForPerson(tasks: Task[], meetings: Meeting[], personId: string): Task[] {
  const ids = meetingIdsForPerson(meetings, personId);
  return tasks.filter((task) => task.status === "open" && ids.has(task.meetingId));
}

export function tasksForMeeting(tasks: Task[], meetingId: string): Task[] {
  const rank: Record<TaskStatus, number> = { open: 0, set_aside: 1, done: 2 };
  return tasks
    .filter((task) => task.meetingId === meetingId)
    .sort((a, b) => {
      const status = rank[a.status] - rank[b.status];
      if (status !== 0) return status;
      const dueA = a.dueOn ?? "9999-99-99";
      const dueB = b.dueOn ?? "9999-99-99";
      return dueA.localeCompare(dueB) || a.createdAt.localeCompare(b.createdAt);
    });
}

export function tasksAskedElsewhere(tasks: Task[], meetings: Meeting[], personId: string): Task[] {
  const ids = meetingIdsForPerson(meetings, personId);
  return tasks
    .filter((task) => task.requesterId === personId && !ids.has(task.meetingId))
    .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn) || b.createdAt.localeCompare(a.createdAt));
}

export function personName(people: Person[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? "Someone";
}

export function findPersonByName(people: Person[], name: string): Person | undefined {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return undefined;
  return people.find((person) => person.name.trim().toLowerCase() === trimmed);
}

export type SearchHits = {
  people: Person[];
  meetings: Meeting[];
  tasks: Task[];
};

export function searchAll(data: Data, query: string): SearchHits {
  const needle = query.trim().toLowerCase();
  if (!needle) return { people: [], meetings: [], tasks: [] };
  return {
    people: data.people.filter((person) => person.name.toLowerCase().includes(needle)),
    meetings: data.meetings.filter(
      (meeting) =>
        meeting.title.toLowerCase().includes(needle) || meeting.note.toLowerCase().includes(needle),
    ),
    tasks: data.tasks.filter((task) => task.title.toLowerCase().includes(needle)),
  };
}

export function lateLabel(dueOn: string, today: string): string {
  const days = daysBetween(dueOn, today);
  return days === 1 ? "1 day late" : `${days} days late`;
}

export function waitingAge(requestedOn: string, today: string): string {
  const days = daysBetween(requestedOn, today);
  if (days <= 0) return "Asked today";
  if (days === 1) return "Waiting 1 day";
  return `Waiting ${days} days`;
}

export function savedLine(taskCount: number): string {
  if (taskCount === 0) return "Saved: 1 meeting";
  if (taskCount === 1) return "Saved: 1 meeting, 1 task";
  return `Saved: 1 meeting, ${taskCount} tasks`;
}

export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
