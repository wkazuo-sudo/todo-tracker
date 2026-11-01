import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { mentioned } from "./tools";
import type { PersonPatch, TaskAction } from "./db";
import { ChipButton } from "./icons";
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
  onGift?: (body: string) => void;
  onDate?: (label: string, onDate: string) => void;
  onAsk?: (body: string, onDate: string) => void;
  onSection?: (name: string) => void;
  onOnly?: () => void;
  onMessage?: () => void;
  onDropText?: (title: string, note: string) => void;
  onTopic?: (text: string) => void;
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
  onMeeting: (meeting: Meeting, fields: { title?: string; meetingDate?: string; note?: string; pinned?: boolean }) => void;
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

  const meetings = meetingsForPerson(data.meetings, person.id)
    .filter((meeting) => {
      if (!data.settings.hideFinished || showFinished) return true;
      return !meetingIsFinished(data.tasks, meeting.id);
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.meetingDate.localeCompare(a.meetingDate));
  const namedIn = mentioned(data, person.id);
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
        <ChipButton icon="list" tone="pin" onClick={tools.onBrief}>
          Brief
        </ChipButton>
        <ChipButton icon="squares" tone="day" onClick={tools.onBeside}>
          Open beside
        </ChipButton>
        <ChipButton icon="file" tone="progress" onClick={tools.onExport}>
          Export open tasks
        </ChipButton>
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

      <details
        className="card about-card"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const text = event.dataTransfer.getData("text/plain");
          if (!text.trim() || !tools.onDropText) return;
          const [title, ...rest] = text.split("\n");
          tools.onDropText(title, rest.join("\n"));
        }}
      >
        <summary>About {person.name}</summary>
        <div className="chips">
          <ChipButton icon="star" tone="eod" className={person.starred ? "selected" : ""} onClick={() => tools.onPerson({ starred: !person.starred })}>
            {person.starred ? "Starred" : "Star"}
          </ChipButton>
          <ChipButton icon="pause" tone="wait" className={person.paused ? "selected" : ""} onClick={() => tools.onPerson({ paused: !person.paused })}>
            {person.paused ? "Paused" : "Pause"}
          </ChipButton>
          <button type="button" className="chip" onClick={() => tools.onPerson({ sequential: !person.sequential })}>
            {person.sequential ? "Showing only the next task" : "Only the next task on home"}
          </button>
          <button type="button" className="chip" onClick={tools.onOnly}>
            Work only these
          </button>
          <button type="button" className="chip" onClick={tools.onMessage}>
            About to message
          </button>
          <button
            type="button"
            className="chip"
            onClick={() =>
              navigator.geolocation.getCurrentPosition((position) =>
                tools.onPerson({ place: `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}` }),
              )
            }
          >
            Remember this place
          </button>
        </div>
        {person.timezone && (
          <p className="quiet">
            Their clock:{" "}
            {theirClock(person.timezone)}
          </p>
        )}
        <label className="field">
          <span>How you met</span>
          <input defaultValue={person.metHow ?? ""} onBlur={(event) => tools.onPerson({ metHow: event.target.value })} />
        </label>
        <label className="field">
          <span>People in their life</span>
          <input defaultValue={person.household ?? ""} onBlur={(event) => tools.onPerson({ household: event.target.value })} />
        </label>
        <label className="field">
          <span>Their city clock</span>
          <input defaultValue={person.timezone ?? ""} placeholder="America/Sao_Paulo" onBlur={(event) => tools.onPerson({ timezone: event.target.value })} />
        </label>
        <label className="field">
          <span>Promise day</span>
          <input type="date" defaultValue={person.promiseOn ?? ""} onChange={(event) => tools.onPerson({ promiseOn: event.target.value || null })} />
        </label>
        <label className="field">
          <span>Event group</span>
          <input defaultValue={person.eventGroup ?? ""} onBlur={(event) => tools.onPerson({ eventGroup: event.target.value })} />
        </label>
        <MemoryFields personId={person.id} data={data} tools={tools} />
      </details>

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

      {meetings.length > 0 && (
        <div className="chips">
          {meetings.slice(0, 10).map((meeting) => (
            <span key={meeting.id} className="chip">
              {formatDay(meeting.meetingDate, today)}
            </span>
          ))}
        </div>
      )}
      {namedIn.length > 0 && (
        <section className="card">
          <h2>Named in someone else’s note</h2>
          {namedIn.map((meeting) => (
            <p key={meeting.id}>
              {data.people.find((item) => item.id === meeting.personId)?.name} · {meeting.title}
            </p>
          ))}
        </section>
      )}

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
              siblings={data.tasks}
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

function MemoryFields({ personId, data, tools }: { personId: string; data: Data; tools: Tools }) {
  const [gift, setGift] = useState("");
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState("");
  const [ask, setAsk] = useState("");
  const [section, setSection] = useState("");
  return (
    <>
      <div className="add-person">
        <input value={section} placeholder="A section, such as budget" onChange={(event) => setSection(event.target.value)} />
        <button type="button" className="text-button" onClick={() => { tools.onSection?.(section); setSection(""); }}>Add section</button>
      </div>
      {data.sections.filter((item) => item.personId === personId).map((item) => <p key={item.id}>{item.name}</p>)}
      <div className="add-person">
        <input value={label} placeholder="Birthday or anniversary" onChange={(event) => setLabel(event.target.value)} />
        <input type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
        <button type="button" className="text-button" onClick={() => { tools.onDate?.(label, when); setLabel(""); }}>Add date</button>
      </div>
      {data.lifeDates.filter((item) => item.personId === personId).map((item) => <p key={item.id}>{item.label} · {formatDay(item.onDate, todayISO())}</p>)}
      <div className="add-person">
        <input value={gift} placeholder="A gift" onChange={(event) => setGift(event.target.value)} />
        <button type="button" className="text-button" onClick={() => { tools.onGift?.(gift); setGift(""); }}>Add gift</button>
      </div>
      {data.gifts.filter((item) => item.personId === personId).map((item) => <p key={item.id}>{item.body}</p>)}
      <div className="add-person">
        <input value={ask} placeholder="Ask how it went" onChange={(event) => setAsk(event.target.value)} />
        <button type="button" className="text-button" onClick={() => { tools.onAsk?.(ask, when || todayISO()); setAsk(""); }}>Ask later</button>
      </div>
      {data.asks.filter((item) => item.personId === personId && !item.done).map((item) => <p key={item.id}>{item.body} · {formatDay(item.onDate, todayISO())}</p>)}
      <TopicBox onTopic={tools.onTopic} />
    </>
  );
}

function theirClock(zone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date());
  } catch {
    return "";
  }
}

function TopicBox({ onTopic }: { onTopic?: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="add-person">
      <input value={text} placeholder="A topic for next time" onChange={(event) => setText(event.target.value)} />
      <button
        type="button"
        className="text-button"
        onClick={() => {
          onTopic?.(text);
          setText("");
        }}
      >
        Keep the topic
      </button>
    </div>
  );
}

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  onMeeting: (meeting: Meeting, fields: { title?: string; meetingDate?: string; note?: string; pinned?: boolean }) => void;
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
      <div className="chips">
        <ChipButton icon="pin" tone="pin" className={meeting.pinned ? "selected" : ""} onClick={() => onMeeting(meeting, { pinned: !meeting.pinned })}>
          {meeting.pinned ? "Unpin this meeting" : "Pin this meeting"}
        </ChipButton>
        {meeting.calendarUid && <span className="chip">Notes linked to this calendar meeting</span>}
        {meeting.sourceUrl && (
          <button type="button" className="chip" onClick={() => void openUrl(meeting.sourceUrl ?? "")}>
            Open the source
          </button>
        )}
      </div>
      <ul className="note-list">
        {(data.bullets ?? [])
          .filter((bullet) => bullet.ownerId === meeting.id && bullet.kind === "note")
          .sort((a, b) => a.position - b.position)
          .map((bullet) => (
            <li key={bullet.id} style={{ marginLeft: bullet.indent * 22 }}>
              {bullet.body}
            </li>
          ))}
      </ul>
      {(meeting.privateNote ?? "") !== "" && <p className="quiet">Private, kept off the brief: {meeting.privateNote}</p>}
      {data.meetings
        .filter((item) => item.id !== meeting.id && item.meetingDate === meeting.meetingDate)
        .map((item) => (
          <p key={item.id} className="quiet">
            Same day: {data.people.find((person) => person.id === item.personId)?.name} · {item.title}
          </p>
        ))}
      {(meeting.nextFocus ?? "") !== "" && <p className="quiet">Next time: {meeting.nextFocus}</p>}
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
          siblings={data.tasks}
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
