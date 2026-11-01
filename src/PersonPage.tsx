import { useEffect, useState } from "react";
import type { PersonPatch, TaskAction } from "./db";
import { TaskRow } from "./TaskRow";
import {
  companyName,
  daysBetween,
  formatDay,
  lastMetMeeting,
  meetingIsFinished,
  meetingsForPerson,
  nextMeeting,
  openTasksForPerson,
  PERSON_COLORS,
  swatch,
  tasksAskedElsewhere,
  tasksForMeeting,
  type Data,
  type Meeting,
  type Task,
} from "./logic";

type Tools = {
  onAction: (task: Task, action: TaskAction) => void;
  onPerson: (fields: PersonPatch) => void;
  onCompany: (name: string) => void;
  onGuests: (meetingId: string, ids: string[]) => void;
  onDecision: (meetingId: string, body: string) => void;
  onDeleteDecision: (id: string) => void;
  onBrief: () => void;
  onBeside: () => void;
  onExport: () => void;
  onExportMeeting: (meetingId: string) => void;
  onToggleHide: () => void;
  onToggleSort: () => void;
};

type Props = {
  data: Data;
  personId: string;
  today: string;
  focusMeetingId?: string;
  tools: Tools;
  onLog: () => void;
  onDone: (task: Task) => void;
  onReopen: (task: Task) => void;
  onSetAside: (task: Task) => void;
  onTitle: (task: Task, title: string) => void;
  onDue: (task: Task, dueOn: string | null) => void;
  onNote: (note: string) => void;
  onMeeting: (meeting: Meeting, fields: { title?: string; meetingDate?: string; note?: string }) => void;
  onDeleteMeeting: (meetingId: string) => void;
  onDeletePerson: () => void;
};

export function PersonPage({
  data,
  personId,
  today,
  focusMeetingId,
  tools,
  onLog,
  onDone,
  onReopen,
  onSetAside,
  onTitle,
  onDue,
  onNote,
  onMeeting,
  onDeleteMeeting,
  onDeletePerson,
}: Props) {
  const person = data.people.find((item) => item.id === personId);
  const [note, setNote] = useState(person?.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [company, setCompany] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  useEffect(() => {
    setNote(person?.note ?? "");
    setCompany(companyName(data.companies, person?.companyId ?? null));
  }, [person?.note, person?.companyId, data.companies]);

  useEffect(() => {
    if (!focusMeetingId) return;
    document.getElementById(`meeting-${focusMeetingId}`)?.scrollIntoView({ block: "start" });
  }, [focusMeetingId]);

  if (!person) return null;

  const meetings = meetingsForPerson(data.meetings, person.id).filter((meeting) => {
    if (!data.settings.hideFinished || showFinished) return true;
    return !meetingIsFinished(data.tasks, meeting.id);
  });
  const past = lastMetMeeting(data.meetings, person.id, today);
  const upcoming = nextMeeting(data.meetings, person.id, today);
  const open = openTasksForPerson(data.tasks, data.meetings, person.id);
  const elsewhere = tasksAskedElsewhere(data.tasks, data.meetings, person.id);

  let summary = "No meetings yet";
  if (past) {
    const days = daysBetween(past.meetingDate, today);
    const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    summary = `Last met ${when} · ${past.title}`;
  } else if (upcoming) {
    summary = `Next meeting ${formatDay(upcoming.meetingDate, today)} · ${upcoming.title}`;
  }
  if (open.length > 0) summary += open.length === 1 ? " · 1 still open" : ` · ${open.length} still open`;
  if (person.checkInOn) summary += ` · Next check-in ${formatDay(person.checkInOn, today)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <i className="color-dot" style={{ background: swatch(person, data.people) }} />
            {person.name}
          </h1>
          <p className="page-sub">{summary}</p>
          {past && upcoming && (
            <p className="page-sub">
              Next meeting {formatDay(upcoming.meetingDate, today)} · {upcoming.title}
            </p>
          )}
        </div>
        <button className="primary" onClick={onLog}>
          Log a meeting
        </button>
      </div>

      <div className="chips">
        <button type="button" className="chip" onClick={tools.onBrief}>
          Brief
        </button>
        <button type="button" className="chip" onClick={tools.onBeside}>
          Open beside
        </button>
        <button type="button" className="chip" onClick={tools.onExport}>
          Export open tasks
        </button>
        <button type="button" className="chip" onClick={tools.onToggleHide}>
          {data.settings.hideFinished ? "Show finished meetings" : "Hide finished meetings"}
        </button>
        <button type="button" className="chip" onClick={tools.onToggleSort}>
          {data.settings.sortClosest ? "Usual order" : "Closest to done first"}
        </button>
        {data.settings.hideFinished && (
          <button type="button" className="chip" onClick={() => setShowFinished((value) => !value)}>
            {showFinished ? "Hiding finished again" : "Show finished now"}
          </button>
        )}
      </div>

      <div className="detail-row">
        <div className="chips" aria-label="Color">
          {PERSON_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={person.color === color ? "color-dot selected" : "color-dot"}
              style={{ background: color }}
              aria-label={`Color ${color}`}
              onClick={() => tools.onPerson({ color })}
            />
          ))}
        </div>
        <label>
          Company
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            onBlur={() => {
              if (company.trim()) tools.onCompany(company);
              else if (person.companyId) tools.onPerson({ companyId: null });
            }}
          />
        </label>
        <label>
          Next check-in
          <input
            type="date"
            value={person.checkInOn ?? ""}
            onChange={(event) => tools.onPerson({ checkInOn: event.target.value || null })}
          />
        </label>
        <label>
          Every N days
          <input
            type="number"
            min={0}
            value={person.cadenceDays ?? ""}
            onChange={(event) =>
              tools.onPerson({ cadenceDays: event.target.value ? Number(event.target.value) : null })
            }
          />
        </label>
      </div>

      <textarea
        className="standing-note"
        aria-label={`Note about ${person.name}`}
        placeholder={`A note you want to remember about ${person.name}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== person.note) onNote(note);
        }}
      />

      {meetings.length === 0 && (
        <div className="empty">
          <p>No meetings with {person.name} yet.</p>
          <button className="primary" onClick={onLog}>
            Log a meeting
          </button>
        </div>
      )}

      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          data={data}
          today={today}
          tools={tools}
          onDone={onDone}
          onReopen={onReopen}
          onSetAside={onSetAside}
          onTitle={onTitle}
          onDue={onDue}
          onMeeting={onMeeting}
          onDelete={() => onDeleteMeeting(meeting.id)}
        />
      ))}

      {elsewhere.length > 0 && (
        <section className="section">
          <h2 className="section-title">Also asked for</h2>
          <p className="quiet">These came up in a meeting with someone else.</p>
          {elsewhere.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              people={data.people}
              meetings={data.meetings}
              today={today}
              editable
              checks={data.checks}
              tags={data.tags}
              activity={data.activity}
              attachments={data.attachments}
              subtasks={data.tasks.filter((item) => item.parentId === task.id)}
              onDone={() => onDone(task)}
              onReopen={() => onReopen(task)}
              onSetAside={() => onSetAside(task)}
              onTitle={(title) => onTitle(task, title)}
              onDue={(dueOn) => onDue(task, dueOn)}
              onOpen={() => undefined}
              onAction={(action) => tools.onAction(task, action)}
            />
          ))}
        </section>
      )}

      <div className="person-remove">
        {confirming ? (
          <div className="confirm">
            <span>This removes {person.name} and the meetings you logged with them. You can bring them back from Settings.</span>
            <button className="text-button danger" onClick={onDeletePerson}>
              Remove
            </button>
            <button className="text-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="text-button" onClick={() => setConfirming(true)}>
            Remove this person
          </button>
        )}
      </div>
    </>
  );
}

function MeetingCard({
  meeting,
  data,
  today,
  tools,
  onDone,
  onReopen,
  onSetAside,
  onTitle,
  onDue,
  onMeeting,
  onDelete,
}: {
  meeting: Meeting;
  data: Data;
  today: string;
  tools: Tools;
  onDone: (task: Task) => void;
  onReopen: (task: Task) => void;
  onSetAside: (task: Task) => void;
  onTitle: (task: Task, title: string) => void;
  onDue: (task: Task, dueOn: string | null) => void;
  onMeeting: (meeting: Meeting, fields: { title?: string; meetingDate?: string; note?: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(meeting.title);
  const [date, setDate] = useState(meeting.meetingDate);
  const [note, setNote] = useState(meeting.note);
  const [decision, setDecision] = useState("");
  const [confirming, setConfirming] = useState(false);
  const tasks = tasksForMeeting(data.tasks, meeting.id, {
    closest: data.settings.sortClosest,
    checks: data.checks,
  }).filter((task) => !task.parentId);
  const decisions = data.decisions.filter((item) => item.meetingId === meeting.id);

  useEffect(() => {
    setTitle(meeting.title);
    setDate(meeting.meetingDate);
    setNote(meeting.note);
  }, [meeting.title, meeting.meetingDate, meeting.note]);

  return (
    <article className="meeting" id={`meeting-${meeting.id}`}>
      <p className="meeting-date">{formatDay(meeting.meetingDate, today)}</p>
      <input
        className="quiet-field meeting-title"
        aria-label="Meeting name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          const next = title.trim();
          if (next && next !== meeting.title) onMeeting(meeting, { title: next });
          else setTitle(meeting.title);
        }}
      />
      <input
        className="quiet-field meeting-date-input"
        aria-label="Meeting date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        onBlur={() => {
          if (date && date !== meeting.meetingDate) onMeeting(meeting, { meetingDate: date });
        }}
      />
      <textarea
        className="quiet-field meeting-note"
        aria-label="Meeting note"
        placeholder="What this meeting was about"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== meeting.note) onMeeting(meeting, { note });
        }}
      />
      <div className="chips">
        {data.people
          .filter((person) => person.id !== meeting.personId)
          .map((person) => (
            <button
              key={person.id}
              type="button"
              className={(meeting.guestIds ?? []).includes(person.id) ? "chip selected" : "chip"}
              onClick={() => {
                const current = meeting.guestIds ?? [];
                const next = current.includes(person.id)
                  ? current.filter((id) => id !== person.id)
                  : [...current, person.id];
                tools.onGuests(meeting.id, next);
              }}
            >
              {person.name}
            </button>
          ))}
      </div>
      {decisions.map((item) => (
        <p key={item.id} className="quiet">
          Decision: {item.body}{" "}
          <button type="button" className="text-button" onClick={() => tools.onDeleteDecision(item.id)}>
            Remove
          </button>
        </p>
      ))}
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          tools.onDecision(meeting.id, decision);
          setDecision("");
        }}
      >
        <input
          aria-label="Decision"
          placeholder="Add a decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
        />
        <button className="text-button" type="submit">
          Add
        </button>
      </form>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          people={data.people}
          meetings={data.meetings}
          today={today}
          editable
          checks={data.checks}
          tags={data.tags}
          activity={data.activity}
          attachments={data.attachments}
          subtasks={data.tasks.filter((item) => item.parentId === task.id)}
          onDone={() => onDone(task)}
          onReopen={() => onReopen(task)}
          onSetAside={() => onSetAside(task)}
          onTitle={(next) => onTitle(task, next)}
          onDue={(dueOn) => onDue(task, dueOn)}
          onOpen={() => undefined}
          onAction={(action) => tools.onAction(task, action)}
        />
      ))}
      {confirming ? (
        <div className="confirm">
          <span>Remove this meeting and its tasks?</span>
          <button className="text-button danger" onClick={onDelete}>
            Remove
          </button>
          <button className="text-button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="confirm">
          <button className="text-button" onClick={() => tools.onExportMeeting(meeting.id)}>
            Save this meeting
          </button>
          <button className="text-button" onClick={() => setConfirming(true)}>
            Remove meeting
          </button>
        </div>
      )}
    </article>
  );
}
