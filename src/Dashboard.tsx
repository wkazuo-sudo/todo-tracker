import { TaskRow } from "./TaskRow";
import {
  fullestDayLine,
  formatDay,
  groupOpen,
  nextSevenDays,
  oldestOpen,
  openByPerson,
  personName,
  waitingAge,
  waitingLine,
  weekdayShort,
  weekFlow,
  weekTotals,
  dayNumber,
  type Bucket,
  type Data,
  type Task,
} from "./logic";

type Props = {
  data: Data;
  today: string;
  onOpenTask: (task: Task) => void;
  onDone: (task: Task) => void;
  onSetAside: (task: Task) => void;
  onOpenPerson: (personId: string) => void;
  onLog: () => void;
};

const GROUPS: { bucket: Bucket; id: string; title: string }[] = [
  { bucket: "overdue", id: "group-overdue", title: "Overdue" },
  { bucket: "today", id: "group-today", title: "Due today" },
  { bucket: "this_week", id: "group-this-week", title: "Due this week" },
  { bucket: "later", id: "group-later", title: "Later" },
  { bucket: "none", id: "group-none", title: "No due date" },
];

function dayMeta(tasks: number, meetings: number): string {
  const parts: string[] = [];
  if (tasks === 1) parts.push("1 task");
  else if (tasks > 1) parts.push(`${tasks} tasks`);
  if (meetings === 1) parts.push("1 meeting");
  else if (meetings > 1) parts.push(`${meetings} meetings`);
  return parts.join(" · ") || "—";
}

export function Dashboard({ data, today, onOpenTask, onDone, onSetAside, onOpenPerson, onLog }: Props) {
  const groups = groupOpen(data.tasks, today);
  const days = nextSevenDays(data.tasks, data.meetings, today);
  const totals = weekTotals(data.tasks, today);
  const peopleWaiting = openByPerson(data.tasks, data.people);
  const oldest = oldestOpen(data.tasks);
  const flow = weekFlow(data.tasks, today);
  const openCount = data.tasks.filter((task) => task.status === "open").length;
  const latest = [...data.meetings].sort(
    (a, b) => b.meetingDate.localeCompare(a.meetingDate) || b.createdAt.localeCompare(a.createdAt),
  )[0];

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

  return (
    <>
      <h1 className="page-title">Home</h1>
      <p className="page-sub">Everything people have asked you to do.</p>

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

      <section className="week">
        <h2 className="section-label">The next seven days</h2>
        <div className="week-strip">
          {days.map((day) => (
            <div key={day.date} className={day.date === today ? "day today" : "day"}>
              <span className="day-name">{day.date === today ? "Today" : weekdayShort(day.date)}</span>
              <span className="day-number">{dayNumber(day.date)}</span>
              <span className="day-meta">{dayMeta(day.tasks, day.meetings)}</span>
            </div>
          ))}
        </div>
        <p className="week-totals">
          {totals.map((total) => (
            <span key={total.label}>
              {total.label} · {total.count} due
            </span>
          ))}
        </p>
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
                          style={{
                            width: `${(row.count / peopleWaiting[0].count) * 100}%`,
                            display: "block",
                          }}
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
              <p className="takeaway">Asked against what you finished.</p>
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
            </section>
          </div>
        </>
      )}

      {openCount === 0 && !latest && (
        <div className="empty">
          <p>No open tasks. Log a meeting and its tasks appear here, sorted by due date.</p>
          <button className="primary" onClick={onLog}>
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
          <button className="text-button" onClick={onLog}>
            Log a meeting
          </button>
        </div>
      )}

      {GROUPS.map((group) => {
        const tasks = groups[group.bucket];
        if (tasks.length === 0) return null;
        return (
          <section key={group.id} id={group.id} className="section">
            <h2 className="section-title">
              {group.title}
              <span className="quiet"> · {tasks.length}</span>
            </h2>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                people={data.people}
                meetings={data.meetings}
                today={today}
                editable={false}
                onDone={() => onDone(task)}
                onReopen={() => onDone(task)}
                onSetAside={() => onSetAside(task)}
                onTitle={() => undefined}
                onDue={() => undefined}
                onOpen={() => onOpenTask(task)}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
