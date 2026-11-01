import Database from "@tauri-apps/plugin-sql";
import {
  findPersonByName,
  sortPeople,
  todayISO,
  type Data,
  type Meeting,
  type Person,
  type Task,
  type TaskStatus,
} from "./logic";

const DATABASE = "sqlite:todo-tracker.db";

let opening: Promise<Database> | null = null;

export function openDatabase(): Promise<Database> {
  if (!opening) {
    opening = Database.load(DATABASE);
  }
  return opening;
}

type PersonRow = { id: string; name: string; note: string; created_at: string };
type MeetingRow = {
  id: string;
  person_id: string;
  title: string;
  meeting_date: string;
  note: string;
  created_at: string;
};
type TaskRow = {
  id: string;
  meeting_id: string;
  requester_id: string;
  title: string;
  requested_on: string;
  due_on: string | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
};

function mapPerson(row: PersonRow): Person {
  return { id: row.id, name: row.name, note: row.note, createdAt: row.created_at };
}

function mapMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    personId: row.person_id,
    title: row.title,
    meetingDate: row.meeting_date,
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    requesterId: row.requester_id,
    title: row.title,
    requestedOn: row.requested_on,
    dueOn: row.due_on,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function loadAll(db: Database): Promise<Data> {
  const [people, meetings, tasks] = await Promise.all([
    db.select<PersonRow[]>("SELECT id, name, note, created_at FROM people"),
    db.select<MeetingRow[]>(
      "SELECT id, person_id, title, meeting_date, note, created_at FROM meetings",
    ),
    db.select<TaskRow[]>(
      "SELECT id, meeting_id, requester_id, title, requested_on, due_on, status, completed_at, created_at FROM tasks",
    ),
  ]);
  return {
    people: sortPeople(people.map(mapPerson)),
    meetings: meetings.map(mapMeeting),
    tasks: tasks.map(mapTask),
  };
}

export type NewTaskInput = {
  title: string;
  requesterId: string | null;
  dueOn: string | null;
};

export type SaveMeetingInput = {
  personId: string | null;
  newPersonName: string | null;
  title: string;
  meetingDate: string;
  note: string;
  tasks: NewTaskInput[];
  markDoneIds: string[];
};

export type SaveMeetingResult = {
  meetingId: string;
  personId: string;
  createdPerson: boolean;
  taskCount: number;
};

export async function saveMeeting(db: Database, input: SaveMeetingInput): Promise<SaveMeetingResult> {
  const existing = await loadAll(db);
  let personId = input.personId;
  let createdPerson = false;
  if (!personId && input.newPersonName) {
    const match = findPersonByName(existing.people, input.newPersonName);
    if (match) {
      personId = match.id;
    } else {
      personId = crypto.randomUUID();
      createdPerson = true;
      await db.execute("INSERT INTO people (id, name, note, created_at) VALUES ($1, $2, $3, $4)", [
        personId,
        input.newPersonName.trim(),
        "",
        new Date().toISOString(),
      ]);
    }
  }
  if (!personId) {
    throw new Error("Choose a person for this meeting.");
  }

  const meetingId = crypto.randomUUID();
  await db.execute(
    "INSERT INTO meetings (id, person_id, title, meeting_date, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [meetingId, personId, input.title.trim(), input.meetingDate, input.note.trim(), new Date().toISOString()],
  );

  let taskCount = 0;
  for (const task of input.tasks) {
    const title = task.title.trim();
    if (!title) continue;
    const requesterId = task.requesterId && task.requesterId !== personId ? task.requesterId : personId;
    await db.execute(
      "INSERT INTO tasks (id, meeting_id, requester_id, title, requested_on, due_on, status, completed_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        crypto.randomUUID(),
        meetingId,
        requesterId,
        title,
        input.meetingDate,
        task.dueOn,
        "open",
        null,
        new Date().toISOString(),
      ],
    );
    taskCount += 1;
  }

  const today = todayISO();
  for (const id of input.markDoneIds) {
    await db.execute("UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3 AND status = 'open'", [
      "done",
      today,
      id,
    ]);
  }

  return { meetingId, personId, createdPerson, taskCount };
}

export async function undoSave(
  db: Database,
  result: SaveMeetingResult,
  markDoneIds: string[],
): Promise<void> {
  for (const id of markDoneIds) {
    await db.execute("UPDATE tasks SET status = 'open', completed_at = NULL WHERE id = $1", [id]);
  }
  await db.execute("DELETE FROM tasks WHERE meeting_id = $1", [result.meetingId]);
  await db.execute("DELETE FROM meetings WHERE id = $1", [result.meetingId]);
  if (result.createdPerson) {
    await db.execute("DELETE FROM people WHERE id = $1", [result.personId]);
  }
}

export async function addPerson(db: Database, name: string): Promise<string> {
  const existing = await loadAll(db);
  const match = findPersonByName(existing.people, name);
  if (match) return match.id;
  const id = crypto.randomUUID();
  await db.execute("INSERT INTO people (id, name, note, created_at) VALUES ($1, $2, $3, $4)", [
    id,
    name.trim(),
    "",
    new Date().toISOString(),
  ]);
  return id;
}

export async function updatePersonNote(db: Database, id: string, note: string): Promise<void> {
  await db.execute("UPDATE people SET note = $1 WHERE id = $2", [note, id]);
}

export async function updateMeeting(
  db: Database,
  id: string,
  fields: { title?: string; meetingDate?: string; note?: string },
): Promise<void> {
  if (fields.title !== undefined) {
    await db.execute("UPDATE meetings SET title = $1 WHERE id = $2", [fields.title.trim(), id]);
  }
  if (fields.meetingDate !== undefined) {
    const rows = await db.select<{ meeting_date: string }[]>(
      "SELECT meeting_date FROM meetings WHERE id = $1",
      [id],
    );
    const previous = rows[0]?.meeting_date;
    await db.execute("UPDATE meetings SET meeting_date = $1 WHERE id = $2", [fields.meetingDate, id]);
    if (previous && previous !== fields.meetingDate) {
      await db.execute(
        "UPDATE tasks SET requested_on = $1 WHERE meeting_id = $2 AND requested_on = $3",
        [fields.meetingDate, id, previous],
      );
    }
  }
  if (fields.note !== undefined) {
    await db.execute("UPDATE meetings SET note = $1 WHERE id = $2", [fields.note, id]);
  }
}

export async function updateTaskTitle(db: Database, id: string, title: string): Promise<void> {
  await db.execute("UPDATE tasks SET title = $1 WHERE id = $2", [title.trim(), id]);
}

export async function updateTaskDue(db: Database, id: string, dueOn: string | null): Promise<void> {
  await db.execute("UPDATE tasks SET due_on = $1 WHERE id = $2", [dueOn, id]);
}

export async function setTaskStatus(db: Database, id: string, status: TaskStatus): Promise<void> {
  const completedAt = status === "done" ? todayISO() : null;
  await db.execute("UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3", [
    status,
    completedAt,
    id,
  ]);
}

export async function deleteMeeting(db: Database, id: string): Promise<void> {
  await db.execute("DELETE FROM tasks WHERE meeting_id = $1", [id]);
  await db.execute("DELETE FROM meetings WHERE id = $1", [id]);
}

export async function deletePerson(db: Database, personId: string): Promise<void> {
  const meetings = await db.select<{ id: string }[]>("SELECT id FROM meetings WHERE person_id = $1", [
    personId,
  ]);
  for (const meeting of meetings) {
    await deleteMeeting(db, meeting.id);
  }
  const leftover = await db.select<{ id: string; meeting_id: string }[]>(
    "SELECT id, meeting_id FROM tasks WHERE requester_id = $1",
    [personId],
  );
  for (const task of leftover) {
    const hosts = await db.select<{ person_id: string }[]>(
      "SELECT person_id FROM meetings WHERE id = $1",
      [task.meeting_id],
    );
    const host = hosts[0]?.person_id;
    if (host) {
      await db.execute("UPDATE tasks SET requester_id = $1 WHERE id = $2", [host, task.id]);
    }
  }
  await db.execute("DELETE FROM people WHERE id = $1", [personId]);
}
