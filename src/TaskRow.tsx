import { useEffect, useState } from "react";
import {
  formatDay,
  lateLabel,
  personName,
  type Meeting,
  type Person,
  type Task,
} from "./logic";

type Props = {
  task: Task;
  people: Person[];
  meetings: Meeting[];
  today: string;
  editable: boolean;
  onDone: () => void;
  onReopen: () => void;
  onSetAside: () => void;
  onTitle: (title: string) => void;
  onDue: (dueOn: string | null) => void;
  onOpen: () => void;
};

export function TaskRow({
  task,
  people,
  meetings,
  today,
  editable,
  onDone,
  onReopen,
  onSetAside,
  onTitle,
  onDue,
  onOpen,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const meeting = meetings.find((item) => item.id === task.meetingId);
  const overdue = task.status === "open" && task.dueOn !== null && task.dueOn < today;
  const asked = formatDay(task.requestedOn, today).toLowerCase();

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  let due: string;
  if (task.status === "done") {
    due = task.completedAt ? `Done ${formatDay(task.completedAt, today).toLowerCase()}` : "Done";
  } else if (task.status === "set_aside") {
    due = "Set aside";
  } else if (!task.dueOn) {
    due = "No due date";
  } else if (overdue) {
    due = `Due ${formatDay(task.dueOn, today).toLowerCase()} · ${lateLabel(task.dueOn, today)}`;
  } else {
    due = `Due ${formatDay(task.dueOn, today).toLowerCase()}`;
  }

  function commitTitle() {
    const next = title.trim();
    setEditing(false);
    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }
    onTitle(next);
  }

  return (
    <div className={`task${task.status === "done" ? " done" : ""}${task.status === "set_aside" ? " aside" : ""}`}>
      {task.status === "set_aside" ? (
        <span aria-hidden="true" />
      ) : (
        <input
          type="checkbox"
          checked={task.status === "done"}
          aria-label={task.status === "done" ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          onChange={() => (task.status === "done" ? onReopen() : onDone())}
        />
      )}
      <div>
        {editing ? (
          <input
            className="title-edit"
            value={title}
            aria-label="Task"
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitTitle();
              }
              if (event.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className="task-title"
            onClick={() => (editable ? setEditing(true) : onOpen())}
          >
            {task.title}
          </button>
        )}
        <span className="ask">
          {personName(people, task.requesterId)}
          {" · "}
          {meeting?.title ?? "Meeting"}
          {" · "}
          Asked {asked}
          {" · "}
          {overdue ? <span className="late">{due}</span> : due}
        </span>
        {editable && task.status !== "done" && (
          <label className="due-edit">
            Due date
            <input
              type="date"
              value={task.dueOn ?? ""}
              onChange={(event) => onDue(event.target.value || null)}
            />
          </label>
        )}
      </div>
      {task.status === "open" ? (
        <button className="text-button" onClick={onSetAside}>
          Set aside
        </button>
      ) : task.status === "set_aside" ? (
        <button className="text-button" onClick={onReopen}>
          Reopen
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
