import { useEffect, useMemo, useState } from "react";
import {
  companyName,
  formatDay,
  isActive,
  personName,
  prepFor,
  shortcutList,
  type Data,
  type Task,
  type TaskStatus,
} from "./logic";

type Command = { id: string; label: string; hint: string; run: () => void };

export function Palette({
  data,
  initialQuery,
  onClose,
  onPerson,
  onTask,
  onDone,
  onScreen,
  onLog,
  onPrint,
  onToggleTheme,
  onToggleType,
}: {
  data: Data;
  initialQuery: string;
  onClose: () => void;
  onPerson: (personId: string) => void;
  onTask: (task: Task) => void;
  onDone: (task: Task) => void;
  onScreen: (name: "home" | "people" | "review" | "archive" | "settings") => void;
  onLog: () => void;
  onPrint: () => void;
  onToggleTheme: () => void;
  onToggleType: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const commands = useMemo(() => {
    const items: Command[] = [
      { id: "log", label: "Log a meeting", hint: "Capture", run: onLog },
      { id: "home", label: "Home", hint: "Go", run: () => onScreen("home") },
      { id: "people", label: "People", hint: "Go", run: () => onScreen("people") },
      { id: "review", label: "Review", hint: "Go", run: () => onScreen("review") },
      { id: "archive", label: "Set aside", hint: "Go", run: () => onScreen("archive") },
      { id: "settings", label: "Settings", hint: "Go", run: () => onScreen("settings") },
      { id: "print", label: "Print", hint: "File", run: onPrint },
      {
        id: "theme",
        label: data.settings.theme === "dark" ? "Use the light appearance" : "Use the dark appearance",
        hint: "Appearance",
        run: onToggleTheme,
      },
      {
        id: "type",
        label: data.settings.typeSize === "large" ? "Use the normal type size" : "Use a larger type size",
        hint: "Appearance",
        run: onToggleType,
      },
    ];
    for (const person of data.people) {
      items.push({
        id: `person-${person.id}`,
        label: person.name,
        hint: companyName(data.companies, person.companyId) || "Person",
        run: () => onPerson(person.id),
      });
    }
    for (const task of data.tasks.filter((item) => isActive(item))) {
      items.push({
        id: `task-${task.id}`,
        label: task.title,
        hint: personName(data.people, task.requesterId),
        run: () => onTask(task),
      });
      items.push({
        id: `done-${task.id}`,
        label: `Mark done: ${task.title}`,
        hint: "Task",
        run: () => onDone(task),
      });
    }
    const needle = query.trim().toLowerCase();
    return (needle ? items.filter((item) => item.label.toLowerCase().includes(needle)) : items).slice(0, 12);
  }, [data, onDone, onLog, onPerson, onPrint, onScreen, onTask, onToggleTheme, onToggleType, query]);

  useEffect(() => setIndex(0), [query]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          aria-label="Command menu"
          placeholder="Jump to a person, a task, or an action"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((current) => Math.min(current + 1, commands.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((current) => Math.max(current - 1, 0));
            }
            if (event.key === "Enter" && commands[index]) {
              event.preventDefault();
              commands[index].run();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {commands.map((command, commandIndex) => (
            <button
              key={command.id}
              type="button"
              className={commandIndex === index ? "suggestion selected" : "suggestion"}
              onMouseEnter={() => setIndex(commandIndex)}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span>{command.label}</span>
              <span className="quiet">{command.hint}</span>
            </button>
          ))}
          {commands.length === 0 && <p className="quiet">Nothing matches.</p>}
        </div>
      </div>
    </div>
  );
}

export function ReviewPage({
  data,
  today,
  onStatus,
}: {
  data: Data;
  today: string;
  onStatus: (task: Task, status: TaskStatus) => void;
}) {
  const people = data.people.filter((person) =>
    data.tasks.some((task) => isActive(task) && task.requesterId === person.id),
  );
  const [index, setIndex] = useState(0);
  const person = people[index];

  return (
    <>
      <h1 className="page-title">Review</h1>
      <p className="page-sub">Walk each person and decide whether the open tasks are still real.</p>
      {people.length === 0 && <p className="empty">Nothing is waiting on a review.</p>}
      {person && (
        <section className="card">
          <h2>
            {person.name}
            <span className="quiet"> · {index + 1} of {people.length}</span>
          </h2>
          {data.tasks
            .filter((task) => isActive(task) && task.requesterId === person.id)
            .map((task) => (
              <div key={task.id} className="review-row">
                <div>
                  <p className="person-name">{task.title}</p>
                  <p className="quiet">
                    {task.dueOn ? `Due ${formatDay(task.dueOn, today)}` : "No due date"}
                  </p>
                </div>
                <div className="chips">
                  <button type="button" className="chip" onClick={() => onStatus(task, "open")}>
                    Still real
                  </button>
                  <button type="button" className="chip" onClick={() => onStatus(task, "done")}>
                    Done
                  </button>
                  <button type="button" className="chip" onClick={() => onStatus(task, "set_aside")}>
                    Set aside
                  </button>
                </div>
              </div>
            ))}
          <div className="sheet-actions">
            <button type="button" className="text-button" onClick={() => setIndex((current) => Math.max(0, current - 1))}>
              Previous person
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setIndex((current) => Math.min(people.length - 1, current + 1))}
            >
              Next person
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function ArchivePage({
  data,
  today,
  onReopen,
  onOpen,
}: {
  data: Data;
  today: string;
  onReopen: (task: Task) => void;
  onOpen: (task: Task) => void;
}) {
  const tasks = data.tasks.filter((task) => task.status === "set_aside");
  return (
    <>
      <h1 className="page-title">Set aside</h1>
      <p className="page-sub">Tasks you parked. They stay out of the home list until you bring one back.</p>
      {tasks.length === 0 && <p className="empty">Nothing is set aside.</p>}
      {tasks.map((task) => {
        const meeting = data.meetings.find((item) => item.id === task.meetingId);
        return (
          <div key={task.id} className="task">
            <span />
            <div>
              <button className="task-title" onClick={() => onOpen(task)}>
                {task.title}
              </button>
              <span className="ask">
                {personName(data.people, task.requesterId)}
                {meeting ? ` · ${meeting.title}` : ""}
                {task.dueOn ? ` · Due ${formatDay(task.dueOn, today)}` : ""}
              </span>
            </div>
            <button className="text-button" onClick={() => onReopen(task)}>
              Reopen
            </button>
          </div>
        );
      })}
    </>
  );
}

export function BriefPage({
  data,
  personId,
  today,
  onBack,
}: {
  data: Data;
  personId: string;
  today: string;
  onBack: () => void;
}) {
  const prep = prepFor(data, personId, today);
  const person = data.people.find((item) => item.id === personId);
  if (!prep || !person) return null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Before you meet {person.name}</h1>
          <p className="page-sub">Open tasks, what finished since last time, and the standing note.</p>
        </div>
        <button className="primary no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {prep.note && (
        <section className="card">
          <h2>Standing note</h2>
          <p>{prep.note}</p>
        </section>
      )}
      <section className="card">
        <h2>Still open</h2>
        {prep.open.length === 0 && <p className="quiet">Nothing is open.</p>}
        {prep.open.map((task) => (
          <p key={task.id}>
            {task.title}
            {task.dueOn ? ` · due ${formatDay(task.dueOn, today)}` : ""}
          </p>
        ))}
      </section>
      <section className="card">
        <h2>Finished since last time</h2>
        {prep.finishedSince.length === 0 && <p className="quiet">Nothing finished since the last meeting.</p>}
        {prep.finishedSince.map((task) => (
          <p key={task.id}>{task.title}</p>
        ))}
      </section>
      {prep.decisions.length > 0 && (
        <section className="card">
          <h2>Decisions last time</h2>
          {prep.decisions.map((decision) => (
            <p key={decision.id}>{decision.body}</p>
          ))}
        </section>
      )}
      <button className="text-button no-print" onClick={onBack}>
        Back to {person.name}
      </button>
    </>
  );
}

export function SettingsPage({
  data,
  onTheme,
  onType,
  onKeep,
  onHide,
  onSort,
  onBackup,
  onRestore,
  onExportText,
  onExportCsv,
  onPrint,
}: {
  data: Data;
  onTheme: () => void;
  onType: () => void;
  onKeep: () => void;
  onHide: () => void;
  onSort: () => void;
  onBackup: () => void;
  onRestore: (id: string) => void;
  onExportText: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
}) {
  const settings = data.settings;
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Appearance, backups, and shortcuts. Your tasks stay on this Mac.</p>
      <section className="card">
        <h2>Appearance</h2>
        <div className="chips">
          <button type="button" className={settings.theme === "dark" ? "chip selected" : "chip"} onClick={onTheme}>
            {settings.theme === "dark" ? "Dark appearance on" : "Dark appearance"}
          </button>
          <button type="button" className={settings.typeSize === "large" ? "chip selected" : "chip"} onClick={onType}>
            {settings.typeSize === "large" ? "Larger type on" : "Larger type"}
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Logging meetings</h2>
        <div className="chips">
          <button type="button" className={settings.keepSheetOpen ? "chip selected" : "chip"} onClick={onKeep}>
            {settings.keepSheetOpen ? "Sheet stays open after saving" : "Keep the sheet open after saving"}
          </button>
          <button type="button" className={settings.hideFinished ? "chip selected" : "chip"} onClick={onHide}>
            {settings.hideFinished ? "Finished meetings are hidden" : "Hide finished meetings"}
          </button>
          <button type="button" className={settings.sortClosest ? "chip selected" : "chip"} onClick={onSort}>
            {settings.sortClosest ? "Closest to done sits first" : "Sort closest to done first"}
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Backup</h2>
        <p className="quiet">
          A copy is kept on this Mac{settings.backupPath ? `. Latest: ${settings.backupPath}` : ""}. Calendar events
          show on the week strip when this Mac allows Calendar access.
        </p>
        <div className="chips">
          <button type="button" className="chip" onClick={onBackup}>
            Back up now
          </button>
          <button type="button" className="chip" onClick={onExportText}>
            Save the board as text
          </button>
          <button type="button" className="chip" onClick={onExportCsv}>
            Save the board as a spreadsheet
          </button>
          <button type="button" className="chip" onClick={onPrint}>
            Print the home screen
          </button>
        </div>
        {data.removed.length > 0 && (
          <div className="detail-block">
            <p className="section-label">Bring someone back</p>
            {data.removed.map((person) => (
              <button key={person.id} type="button" className="text-button" onClick={() => onRestore(person.id)}>
                Bring back {person.name}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="card" id="shortcuts">
        <h2>Shortcuts</h2>
        <div className="shortcut-list">
          {shortcutList().map((item) => (
            <p key={item.keys}>
              <kbd className="kbd">{item.keys}</kbd> {item.does}
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
