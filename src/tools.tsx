import { useState } from "react";
import { addDays, boxOf, formatDay, isActive, tasksForHome, type Data, type Task } from "./logic";
import { BarChart } from "./ui";

export function DayPage({
  data,
  today,
  onLog,
  onCarry,
  onAdd,
  onOpenTask,
}: {
  data: Data;
  today: string;
  onLog: (kind: string, body: string) => void;
  onCarry: (ids: string[]) => void;
  onAdd: (body: string) => void;
  onOpenTask: (task: Task) => void;
}) {
  const [highlight, setHighlight] = useState("");
  const [snag, setSnag] = useState("");
  const [aim, setAim] = useState("");
  const [catchText, setCatchText] = useState("");
  const [carry, setCarry] = useState<string[]>([]);
  const home = tasksForHome(data, today);
  const leftovers = data.tasks.filter((task) => isActive(task) && task.dueOn && task.dueOn <= today);
  const meetings = data.meetings.filter((meeting) => meeting.meetingDate === today);
  const logs = data.logs.filter((item) => item.onDate === today);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">Close the day, name one thing worth remembering, and catch a follow-up before you know who asked.</p>
        </div>
      </div>
      <BarChart title="What is on the board" rows={[{ label: "Open", count: home.length }, { label: "Meetings", count: meetings.length }, { label: "Left", count: leftovers.length }]} />
      <section className="card">
        <h2>Meetings and asks from today</h2>
        {meetings.length === 0 && leftovers.length === 0 && <p className="quiet">Nothing is dated today yet.</p>}
        {meetings.map((meeting) => (
          <p key={meeting.id}>
            {meeting.title} · {data.people.find((person) => person.id === meeting.personId)?.name}
          </p>
        ))}
        {leftovers.map((task) => (
          <button key={task.id} className="person-row" onClick={() => onOpenTask(task)}>
            <span className="person-name">{task.title}</span>
          </button>
        ))}
      </section>
      <section className="card">
        <h2>Catch pile</h2>
        <p className="quiet">Write it before you know who asked. It stays off the home list.</p>
        <div className="add-person">
          <input value={catchText} placeholder="Something you just heard" onChange={(event) => setCatchText(event.target.value)} />
          <button
            className="primary"
            type="button"
            onClick={() => {
              onAdd(catchText);
              setCatchText("");
            }}
          >
            Keep it
          </button>
        </div>
        {data.tasks
          .filter((task) => task.unfiled && isActive(task))
          .map((task) => (
            <p key={task.id}>{task.title}</p>
          ))}
      </section>
      <section className="card">
        <h2>Done for today</h2>
        <label className="field">
          <span>One thing worth remembering</span>
          <input value={highlight} onChange={(event) => setHighlight(event.target.value)} />
        </label>
        <button className="primary" type="button" onClick={() => highlight.trim() && onLog("highlight", highlight)}>
          Save that line
        </button>
        <label className="field">
          <span>What may get in the way</span>
          <input value={snag} onChange={(event) => setSnag(event.target.value)} />
        </label>
        <button className="text-button" type="button" onClick={() => snag.trim() && onLog("snag", snag)}>
          Save the snag
        </button>
        <h3 className="section-label">Move leftovers to tomorrow</h3>
        {leftovers.map((task) => (
          <label key={task.id} className="open-item">
            <input
              type="checkbox"
              checked={carry.includes(task.id)}
              onChange={(event) =>
                setCarry((current) => (event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id)))
              }
            />
            <span>{task.title}</span>
          </label>
        ))}
        <button className="primary" type="button" onClick={() => onCarry(carry)}>
          Move the ticked ones
        </button>
      </section>
      <section className="card">
        <h2>Aims for the week ahead</h2>
        <div className="add-person">
          <input value={aim} placeholder="One aim, not a task" onChange={(event) => setAim(event.target.value)} />
          <button
            className="primary"
            type="button"
            onClick={() => {
              if (!aim.trim()) return;
              onLog("aim", aim);
              setAim("");
            }}
          >
            Add
          </button>
        </div>
        {data.logs
          .filter((item) => item.kind === "aim")
          .map((item) => (
            <p key={item.id}>{item.body}</p>
          ))}
      </section>
      {logs.length > 0 && (
        <section className="card">
          <h2>Written today</h2>
          {logs.map((item) => (
            <p key={item.id}>
              {item.kind} · {item.body}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

const BOXES = ["Matters and soon", "Matters, can wait", "Soon, but light", "Neither"];

export function BoxesPage({ data, today, onOpenTask }: { data: Data; today: string; onOpenTask: (task: Task) => void }) {
  const open = data.tasks.filter((task) => isActive(task) && !task.unfiled);
  const nextMeet = (personId: string) =>
    data.meetings
      .filter((meeting) => meeting.personId === personId && meeting.meetingDate >= today)
      .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))[0]?.meetingDate ?? null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Four boxes</h1>
          <p className="page-sub">Another way to look at the same follow-ups. Home stays as it is.</p>
        </div>
      </div>
      <div className="box-grid">
        {BOXES.map((label, index) => (
          <section className="card" key={label}>
            <h2>{label}</h2>
            {open
              .filter((task) => boxOf(task, today, nextMeet(task.requesterId)) === index)
              .map((task) => (
                <button key={task.id} className="person-row" onClick={() => onOpenTask(task)}>
                  <span className="person-name">{task.title}</span>
                  <span className="person-meta">{data.people.find((person) => person.id === task.requesterId)?.name}</span>
                </button>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}

export function SomedayPage({ data, onOpenTask }: { data: Data; onOpenTask: (task: Task) => void }) {
  const tasks = data.tasks.filter((task) => task.someday && isActive(task));
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Someday</h1>
          <p className="page-sub">These stay off the home list until you bring one back.</p>
        </div>
      </div>
      <section className="card">
        {tasks.length === 0 && <p className="quiet">Nothing is waiting on the shelf.</p>}
        {tasks.map((task) => (
          <button key={task.id} className="person-row" onClick={() => onOpenTask(task)}>
            <span className="person-name">{task.title}</span>
          </button>
        ))}
      </section>
    </>
  );
}

export function hoursLine(data: Data, today: string): string {
  if (!data.settings.weekHours) return "";
  const end = addDays(today, 6);
  const minutes = data.tasks
    .filter((task) => isActive(task) && task.dueOn && task.dueOn >= today && task.dueOn <= end)
    .reduce((sum, task) => sum + (task.durationMin ?? 0), 0);
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `This week’s follow-ups add up to ${hours} hours. You wanted ${data.settings.weekHours}.`;
}

export function startLine(data: Data): Task[] {
  return data.tasks.filter((task) => {
    if (!isActive(task) || !task.blockedBy) return false;
    const blocker = data.tasks.find((item) => item.id === task.blockedBy);
    return blocker?.status === "done";
  });
}

export function formatTheirTime(clock: string, zone: string): string {
  if (!clock || !zone) return "";
  try {
    const [hour, minute] = clock.split(":").map(Number);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" }).format(date);
  } catch {
    return "";
  }
}

export function mentioned(data: Data, personId: string) {
  const person = data.people.find((item) => item.id === personId);
  if (!person) return [];
  const name = person.name.toLowerCase();
  return data.meetings.filter((meeting) => {
    if (meeting.personId === personId || meeting.guestIds.includes(personId)) return false;
    const text = `${meeting.note} ${data.bullets
      .filter((bullet) => bullet.ownerId === meeting.id)
      .map((bullet) => bullet.body)
      .join(" ")}`.toLowerCase();
    return text.includes(name);
  });
}

export { formatDay };
