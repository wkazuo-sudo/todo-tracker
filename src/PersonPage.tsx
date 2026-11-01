import { useEffect, useState } from "react";
import { TaskRow } from "./TaskRow";
import {
  daysBetween,
  formatDay,
  lastMetMeeting,
  meetingsForPerson,
  nextMeeting,
  openTasksForPerson,
  tasksAskedElsewhere,
  tasksForMeeting,
  type Data,
  type Meeting,
  type Task,
} from "./logic";

type Props = {
  data: Data;
  personId: string;
  today: string;
  focusMeetingId?: string;
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

  useEffect(() => {
    setNote(person?.note ?? "");
  }, [person?.note]);

  useEffect(() => {
    if (!focusMeetingId) return;
    document.getElementById(`meeting-${focusMeetingId}`)?.scrollIntoView({ block: "start" });
  }, [focusMeetingId]);

  if (!person) return null;

  const meetings = meetingsForPerson(data.meetings, person.id);
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
  if (open.length > 0) {
    summary += open.length === 1 ? " · 1 still open" : ` · ${open.length} still open`;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{person.name}</h1>
          <p className="page-sub">{summary}</p>
          {past && upcoming && (
            <p className="page-sub">Next meeting {formatDay(upcoming.meetingDate, today)} · {upcoming.title}</p>
          )}
        </div>
        <button className="primary" onClick={onLog}>
          Log a meeting
        </button>
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
              onDone={() => onDone(task)}
              onReopen={() => onReopen(task)}
              onSetAside={() => onSetAside(task)}
              onTitle={(title) => onTitle(task, title)}
              onDue={(dueOn) => onDue(task, dueOn)}
              onOpen={() => undefined}
            />
          ))}
        </section>
      )}

      <div className="person-remove">
        {confirming ? (
          <div className="confirm">
            <span>This removes {person.name} and the meetings you logged with them.</span>
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
  const [confirming, setConfirming] = useState(false);
  const tasks = tasksForMeeting(data.tasks, meeting.id);

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
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          people={data.people}
          meetings={data.meetings}
          today={today}
          editable
          onDone={() => onDone(task)}
          onReopen={() => onReopen(task)}
          onSetAside={() => onSetAside(task)}
          onTitle={(next) => onTitle(task, next)}
          onDue={(dueOn) => onDue(task, dueOn)}
          onOpen={() => undefined}
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
          <button className="text-button" onClick={() => setConfirming(true)}>
            Remove meeting
          </button>
        </div>
      )}
    </article>
  );
}
