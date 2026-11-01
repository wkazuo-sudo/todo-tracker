import { useEffect, useState, type DragEvent } from "react";
import type { TaskAction } from "./db";
import { TaskRow } from "./TaskRow";
import {
  bucketLabel,
  checkInsDue,
  dayNumber,
  fiveWeeks,
  formatDay,
  fullestDayLine,
  groupOpen,
  heavyDayLine,
  isLongWait,
  isOnBoard,
  medianWait,
  nextSevenDays,
  oldestOpen,
  openByPerson,
  openSparkline,
  personName,
  swatch,
  tasksForView,
  waitingAge,
  waitingLine,
  weekdayShort,
  weekFlow,
  weekTotals,
  type Bucket,
  type Data,
  type Task,
} from "./logic";

type Props = {
  data: Data;
  today: string;
  events: { date: string; title: string }[];
  onOpenTask: (task: Task) => void;
  onOpenPerson: (personId: string) => void;
  onLog: (personId?: string) => void;
  onAction: (task: Task, action: TaskAction) => void;
  onCheckIn: (personId: string, kind: "snooze" | "dismiss") => void;
  onMorning: (keepIds: string[], moveIds: string[]) => void;
  onSaveView: (name: string, filter: { stale: boolean; tagId: string | null; personId: string | null }) => void;
  onDeleteView: (id: string) => void;
  onPrint: () => void;
  onExport: (kind: "text" | "csv") => void;
  onBulkDone: (ids: string[]) => void;
  onBulkDue: (ids: string[], dueOn: string) => void;
};

const GROUPS: { bucket: Bucket; id: string }[] = [
  { bucket: "overdue", id: "group-overdue" },
  { bucket: "today", id: "group-today" },
  { bucket: "evening", id: "group-evening" },
  { bucket: "this_week", id: "group-this-week" },
  { bucket: "later", id: "group-later" },
  { bucket: "none", id: "group-none" },
];

function dayMeta(tasks: number, meetings: number): string {
  const parts: string[] = [];
  if (tasks === 1) parts.push("1 task");
  else if (tasks > 1) parts.push(`${tasks} tasks`);
  if (meetings === 1) parts.push("1 meeting");
  else if (meetings > 1) parts.push(`${meetings} meetings`);
  return parts.join(" · ") || "—";
}

export function Dashboard({
  data,
  today,
  events,
  onOpenTask,
  onOpenPerson,
  onLog,
  onAction,
  onCheckIn,
  onMorning,
  onSaveView,
  onDeleteView,
  onPrint,
  onExport,
  onBulkDone,
  onBulkDue,
}: Props) {
  const [filter, setFilter] = useState({ stale: false, tagId: null as string | null, personId: null as string | null });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState(today);
  const [viewName, setViewName] = useState("");
  const [naming, setNaming] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);

  const visible = tasksForView(data.tasks, today, filter);
  const groups = groupOpen(visible, today);
  const days = nextSevenDays(data.tasks, data.meetings, today);
  const totals = weekTotals(data.tasks, today);
  const peopleWaiting = openByPerson(data.tasks, data.people);
  const oldest = oldestOpen(data.tasks);
  const flow = weekFlow(data.tasks, today);
  const openCount = data.tasks.filter((task) => isOnBoard(task)).length;
  const median = medianWait(data.tasks);
  const spark = openSparkline(data.tasks, today);
  const sparkMax = Math.max(1, ...spark);
  const weeks = fiveWeeks(data.tasks, today);
  const weekMax = Math.max(1, ...weeks.map((day) => day.count));
  const heavy = heavyDayLine(days.map((day) => ({ date: day.date, count: day.tasks })), today);
  const checkIns = checkInsDue(data.people, today);
  const pinned = visible.filter((task) => task.pinned && isOnBoard(task));
  const longWait = visible.filter((task) => isLongWait(task, today));
  const morningPool = data.tasks.filter((task) => isOnBoard(task) && task.dueOn !== null && task.dueOn <= today);
  const showMorning = data.settings.morningDate !== today && morningPool.length > 3;
  const latest = [...data.meetings].sort(
    (a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.createdAt.localeCompare(a.createdAt),
  )[0];
  const filtering = filter.stale || filter.tagId || filter.personId;

  const cards = [
    { id: "group-overdue", label: "Overdue", count: groups.overdue.length, late: groups.overdue.length > 0 },
    { id: "group-today", label: "Due today", count: groups.today.length, late: false },
    { id: "group-this-week", label: "Due this week", count: groups.this_week.length, late: false },
    { id: "group-none", label: "No due date", count: groups.none.length, late: false },
  ];

  function scrollTo(id: string, count: number) {
    if (count === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function dropDue(event: DragEvent, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/task-id");
    const task = data.tasks.find((item) => item.id === id);
    if (task) onAction(task, { type: "due", dueOn: date });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-home-task]"));
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(cursor + 1, Math.max(0, rows.length - 1));
        setCursor(next);
        rows[next]?.focus();
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(cursor - 1, 0);
        setCursor(next);
        rows[next]?.focus();
      } else if (event.key === "]" || event.key === "[") {
        const ids = GROUPS.map((group) => group.id).filter((id) => document.getElementById(id));
        if (ids.length === 0) return;
        const current = ids.findIndex((id) => document.getElementById(id)?.contains(document.activeElement));
        const step = event.key === "]" ? 1 : -1;
        const next = ids[(current + step + ids.length) % ids.length];
        document.getElementById(next)?.scrollIntoView({ block: "start" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor]);

  function renderTask(task: Task) {
    return (
      <div
        key={task.id}
        className="task-wrap"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/task-id", task.id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        {selecting && (
          <label className="pick">
            <input
              type="checkbox"
              aria-label={`Select ${task.title}`}
              checked={selected.includes(task.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                )
              }
            />
          </label>
        )}
        <TaskRow
          task={task}
          people={data.people}
          meetings={data.meetings}
          today={today}
          editable={false}
          listed
          quick
          onDone={() => onAction(task, { type: "status", status: "done" })}
          onReopen={() => onAction(task, { type: "status", status: "open" })}
          onSetAside={() => onAction(task, { type: "status", status: "set_aside" })}
          onTitle={() => undefined}
          onDue={(dueOn) => onAction(task, { type: "due", dueOn })}
          onOpen={() => onOpenTask(task)}
          onAction={(action) => onAction(task, action)}
        />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="page-sub">Everything people have asked you to do.</p>
        </div>
        <div className="chips no-print">
          <button type="button" className="chip" onClick={onPrint}>
            Print
          </button>
          <button type="button" className="chip" onClick={() => onExport("text")}>
            Save as text
          </button>
          <button type="button" className="chip" onClick={() => onExport("csv")}>
            Spreadsheet
          </button>
        </div>
      </div>

      {checkIns.map((person) => (
        <section key={person.id} className="prompt">
          <p>
            Check in with {person.name}
            {person.checkInOn ? ` · ${formatDay(person.checkInOn, today)}` : ""}
          </p>
          <div className="chips">
            <button type="button" className="chip" onClick={() => onLog(person.id)}>
              Log a meeting
            </button>
            <button type="button" className="chip" onClick={() => onCheckIn(person.id, "snooze")}>
              Snooze a week
            </button>
            <button type="button" className="chip" onClick={() => onCheckIn(person.id, "dismiss")}>
              Dismiss
            </button>
          </div>
        </section>
      ))}

      {showMorning && (
        <section className="prompt">
          <p>Pick three tasks for today. The rest of today’s list moves to tomorrow.</p>
          {morningPool.map((task) => (
            <label key={task.id} className="open-item">
              <input
                type="checkbox"
                checked={picks.includes(task.id)}
                onChange={(event) =>
                  setPicks((current) => {
                    if (!event.target.checked) return current.filter((id) => id !== task.id);
                    if (current.length >= 3) return current;
                    return [...current, task.id];
                  })
                }
              />
              <span>{task.title}</span>
            </label>
          ))}
          <button
            type="button"
            className="primary"
            onClick={() => onMorning(picks, morningPool.map((task) => task.id).filter((id) => !picks.includes(id)))}
          >
            Keep these three
          </button>
        </section>
      )}

      <div className="counts">
        {cards.map((card) => (
          <button
            key={card.id}
            className={card.late ? "count-card late" : "count-card"}
            onClick={() => scrollTo(card.id, card.count)}
          >
            <span className="count-number">{card.count}</span>
            <span className="count-label">{card.label}</span>
          </button>
        ))}
      </div>

      {heavy && <p className="hint">{heavy}</p>}

      <section className="week">
        <h2 className="section-label">The next seven days</h2>
        <div className="week-strip">
          {days.map((day) => {
            const people = data.tasks
              .filter((task) => isOnBoard(task) && task.dueOn === day.date)
              .map((task) => data.people.find((person) => person.id === task.requesterId))
              .filter((person): person is NonNullable<typeof person> => Boolean(person));
            const unique = [...new Map(people.map((person) => [person.id, person])).values()];
            const dayEvents = events.filter((event) => event.date === day.date);
            return (
              <div
                key={day.date}
                className={day.date === today ? "day today" : "day"}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropDue(event, day.date)}
              >
                <span className="day-name">{day.date === today ? "Today" : weekdayShort(day.date)}</span>
                <span className="day-number">{dayNumber(day.date)}</span>
                <span className="dots">
                  {unique.slice(0, 4).map((person) => (
                    <i key={person.id} style={{ background: swatch(person, data.people) }} />
                  ))}
                </span>
                <span className="day-meta">{dayMeta(day.tasks, day.meetings)}</span>
                {dayEvents.slice(0, 2).map((event) => (
                  <span key={event.title} className="day-event">
                    {event.title}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <p className="week-totals">
          {totals.map((total) => (
            <span key={total.label}>
              {total.label} · {total.count} due
            </span>
          ))}
        </p>
      </section>

      <section className="card">
        <h2>Five weeks</h2>
        <div className="cal">
          {weeks.map((day) => (
            <button
              key={day.date}
              type="button"
              className={day.date === today ? "cal-day today" : "cal-day"}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropDue(event, day.date)}
              onClick={() => undefined}
            >
              <span>{dayNumber(day.date)}</span>
              <span className="cal-count" style={{ opacity: day.count === 0 ? 0.35 : 0.35 + (day.count / weekMax) * 0.65 }}>
                {day.count}
              </span>
            </button>
          ))}
        </div>
      </section>

      {openCount > 0 && (
        <>
          <div className="charts">
            <section className="card">
              <h2>Tasks due in the next seven days</h2>
              <p className="takeaway">
                {fullestDayLine(
                  days.map((day) => ({ date: day.date, count: day.tasks })),
                  today,
                )}
              </p>
              <div className="vbars">
                {days.map((day) => (
                  <div key={day.date} className="vbar">
                    <span className="vbar-count">{day.tasks}</span>
                    <div className="vbar-track">
                      <div
                        className={day.tasks === 0 ? "vbar-fill empty" : "vbar-fill"}
                        style={{ height: `${(day.tasks / Math.max(1, ...days.map((item) => item.tasks))) * 100}%` }}
                      />
                    </div>
                    <span className="vbar-label">{day.date === today ? "Today" : weekdayShort(day.date)}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card">
              <h2>Who is waiting</h2>
              <p className="takeaway">{waitingLine(peopleWaiting)}</p>
              {peopleWaiting.length === 0 ? (
                <p className="quiet">No open tasks are tied to a person yet.</p>
              ) : (
                <div className="hbars">
                  {peopleWaiting.map((row) => (
                    <button key={row.person.id} className="hbar" onClick={() => onOpenPerson(row.person.id)}>
                      <span className="hbar-name">{row.person.name}</span>
                      <span className="hbar-track">
                        <span
                          className="hbar-fill"
                          style={{ width: `${(row.count / peopleWaiting[0].count) * 100}%`, display: "block" }}
                        />
                      </span>
                      <span className="hbar-count">{row.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="split">
            <section className="card">
              <h2>Waiting the longest</h2>
              <div className="oldest">
                {oldest.map((task) => (
                  <button key={task.id} className="person-row" onClick={() => onOpenTask(task)}>
                    <span className="person-name">{task.title}</span>
                    <span className="person-meta">
                      {personName(data.people, task.requesterId)} · {waitingAge(task.requestedOn, today)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="card">
              <h2>This week</h2>
              <p className="takeaway">
                {flow.asked} asked, {flow.finished} finished.
                {median !== null ? ` A typical request takes ${median} days.` : " The typical wait appears after five finished tasks."}
              </p>
              <div className="flow">
                <div>
                  <span className="flow-number">{flow.asked}</span>
                  <span className="flow-label">asked</span>
                </div>
                <div>
                  <span className="flow-number">{flow.finished}</span>
                  <span className="flow-label">finished</span>
                </div>
              </div>
              <p className="section-label">Open tasks, last twelve weeks</p>
              <svg className="spark" viewBox="0 0 120 36" role="img" aria-label="Open tasks over twelve weeks">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  points={spark
                    .map((count, index) => `${index * (120 / 11)},${34 - (count / sparkMax) * 30}`)
                    .join(" ")}
                />
              </svg>
            </section>
          </div>
        </>
      )}

      {longWait.length > 0 && (
        <section className="section" id="group-long">
          <h2 className="section-title">
            Waiting a long time
            <span className="quiet"> · {longWait.length}</span>
          </h2>
          {longWait.map((task) => (
            <button key={task.id} className="person-row" onClick={() => onOpenTask(task)}>
              <span className="person-name">{task.title}</span>
              <span className="person-meta">
                {personName(data.people, task.requesterId)} · {waitingAge(task.requestedOn, today)}
              </span>
            </button>
          ))}
        </section>
      )}

      {openCount === 0 && !latest && (
        <div className="empty">
          <p>No open tasks. Log a meeting and its tasks appear here, sorted by due date.</p>
          <button className="primary" onClick={() => onLog()}>
            Log a meeting
          </button>
        </div>
      )}

      {openCount === 0 && latest && (
        <div className="caught-up">
          <p>All caught up. Nothing is due.</p>
          <p className="quiet">
            Last meeting logged: {formatDay(latest.meetingDate, today)}, with {personName(data.people, latest.personId)}.
          </p>
          <button className="text-button" onClick={() => onLog()}>
            Log a meeting
          </button>
        </div>
      )}

      <div className="filters no-print">
        <button
          type="button"
          className={filter.stale ? "chip selected" : "chip"}
          onClick={() => setFilter((current) => ({ ...current, stale: !current.stale }))}
        >
          Unchanged for two weeks
        </button>
        <button type="button" className={selecting ? "chip selected" : "chip"} onClick={() => setSelecting((value) => !value)}>
          Select several
        </button>
        {data.tags.length > 0 && (
          <select
            aria-label="Tag"
            value={filter.tagId ?? ""}
            onChange={(event) => setFilter((current) => ({ ...current, tagId: event.target.value || null }))}
          >
            <option value="">Any tag</option>
            {data.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
        {data.views.map((view) => (
          <span key={view.id} className="view-chip">
            <button
              type="button"
              className="chip"
              onClick={() => setFilter({ stale: view.stale, tagId: view.tagId, personId: view.personId })}
            >
              {view.name}
            </button>
            <button type="button" className="text-button" aria-label={`Remove view ${view.name}`} onClick={() => onDeleteView(view.id)}>
              ×
            </button>
          </span>
        ))}
        {filtering && !naming && (
          <button type="button" className="chip" onClick={() => setNaming(true)}>
            Save this view
          </button>
        )}
        {naming && (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveView(viewName, filter);
              setViewName("");
              setNaming(false);
            }}
          >
            <input aria-label="View name" value={viewName} onChange={(event) => setViewName(event.target.value)} />
            <button className="text-button" type="submit">
              Save
            </button>
          </form>
        )}
      </div>

      {selecting && selected.length > 0 && (
        <div className="bulk-bar">
          <button
            type="button"
            className="chip"
            onClick={() => {
              onBulkDone(selected);
              setSelected([]);
            }}
          >
            Mark selected done
          </button>
          <label className="chip">
            Move to
            <input className="sr-only" type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} />
          </label>
          <button
            type="button"
            className="chip"
            onClick={() => {
              onBulkDue(selected, bulkDate);
              setSelected([]);
            }}
          >
            Apply date
          </button>
        </div>
      )}

      {pinned.length > 0 && (
        <section className="section" id="group-pinned">
          <h2 className="section-title">Pinned</h2>
          {pinned.map(renderTask)}
        </section>
      )}

      {GROUPS.map((group) => {
        const tasks = groups[group.bucket].filter((task) => !task.pinned);
        if (tasks.length === 0) return null;
        return (
          <section key={group.id} id={group.id} className="section">
            <h2 className="section-title">
              {group.bucket === "none" ? "No due date" : bucketLabel(group.bucket)}
              <span className="quiet"> · {tasks.length}</span>
            </h2>
            {group.bucket === "none" && <p className="quiet">Drag one of these onto a day.</p>}
            {tasks.map(renderTask)}
          </section>
        );
      })}
    </>
  );
}

