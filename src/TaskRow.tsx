import { useEffect, useState } from "react";
import type { TaskAction } from "./db";
import { TaskDetails } from "./TaskDetails";
import { ChipButton, Icon } from "./icons";
import { DueChips } from "./ui";
import {
  formatDay,
  lateLabel,
  personName,
  spanPercent,
  type Activity,
  type Attachment,
  type CheckItem,
  type Meeting,
  type Person,
  type Tag,
  type Task,
} from "./logic";

type Props = {
  task: Task;
  people: Person[];
  meetings: Meeting[];
  today: string;
  editable: boolean;
  listed?: boolean;
  quick?: boolean;
  checks?: CheckItem[];
  tags?: Tag[];
  activity?: Activity[];
  attachments?: Attachment[];
  subtasks?: Task[];
  siblings?: Task[];
  onDone: () => void;
  onReopen: () => void;
  onSetAside: () => void;
  onTitle: (title: string) => void;
  onDue: (dueOn: string | null) => void;
  onOpen: () => void;
  onAction?: (action: TaskAction) => void;
};

export function TaskRow({
  task,
  people,
  meetings,
  today,
  editable,
  listed,
  quick,
  checks = [],
  tags = [],
  activity = [],
  attachments = [],
  subtasks = [],
  siblings = [],
  onDone,
  onReopen,
  onSetAside,
  onTitle,
  onDue,
  onOpen,
  onAction,
}: Props) {
  const [title, setTitle] = useState(task.title);
  const [editing, setEditing] = useState(false);
  const meeting = meetings.find((item) => item.id === task.meetingId);
  const active = task.status === "open" || task.status === "in_progress";
  const overdue = active && task.dueOn !== null && task.dueOn < today;
  const asked = formatDay(task.requestedOn, today).toLowerCase();
  const span = spanPercent(task, today);
  const doneChecks = checks.filter((item) => item.taskId === task.id && item.done).length;
  const allChecks = checks.filter((item) => item.taskId === task.id).length;

  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);

  let due: string;
  if (task.status === "done") {
    due = task.completedAt ? `Done ${formatDay(task.completedAt, today).toLowerCase()}` : "Done";
  } else if (task.status === "set_aside") {
    due = "Set aside";
  } else if (task.status === "waiting") {
    due = "Waiting on them";
  } else if (task.status === "in_progress" && !task.dueOn) {
    due = "In progress";
  } else if (!task.dueOn) {
    due = "No due date";
  } else if (overdue) {
    due = `Due ${formatDay(task.dueOn, today).toLowerCase()} · ${lateLabel(task.dueOn, today)}`;
  } else {
    due = `Due ${formatDay(task.dueOn, today).toLowerCase()}`;
  }
  if (task.status === "in_progress" && task.dueOn) due = `In progress · ${due}`;

  function commitTitle() {
    const next = title.trim();
    setEditing(false);
    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }
    onTitle(next);
  }

  function shift(days: number) {
    const base = task.dueOn && task.dueOn >= today ? task.dueOn : today;
    const [year, month, day] = base.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    onDue(next);
  }

  return (
    <div className={`task${task.status === "done" ? " done" : ""}${task.status === "set_aside" ? " aside" : ""}`}>
      {task.status === "set_aside" || task.status === "waiting" ? (
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
            data-home-task={listed ? "true" : undefined}
            onClick={() => (editable ? setEditing(true) : onOpen())}
          >
            {task.pinned ? "Pinned · " : ""}
            {task.priority === "high" ? "High · " : ""}
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
          {overdue ? <span className="late">Late · {due}</span> : due}
          {allChecks > 0 ? ` · ${doneChecks} of ${allChecks}` : ""}
          {task.movedCount > 0 ? ` · Moved ${task.movedCount}` : ""}
        </span>
        {span !== null && active && (
          <span className="span" aria-hidden="true">
            <span style={{ width: `${span}%` }} />
          </span>
        )}
        {editable && task.status !== "done" && (
          <DueChips dueOn={task.dueOn} today={today} index={task.id.length + task.title.length} onChoose={onDue} />
        )}
        {quick && active && (
          <div className="chips">
            <ChipButton icon="clock" tone="day" onClick={() => shift(1)}>
              Snooze a day
            </ChipButton>
            <ChipButton icon="calendar" tone="week" onClick={() => shift(7)}>
              Snooze a week
            </ChipButton>
            {onAction && (
              <>
                <ChipButton
                  icon="pin"
                  tone="pin"
                  className={task.pinned ? "selected" : ""}
                  onClick={() => onAction({ type: "patch", patch: { pinned: !task.pinned } })}
                >
                  {task.pinned ? "Unpin" : "Pin"}
                </ChipButton>
                <ChipButton
                  icon="moon"
                  tone="evening"
                  className={task.evening ? "selected" : ""}
                  onClick={() => onAction({ type: "patch", patch: { evening: !task.evening } })}
                >
                  This evening
                </ChipButton>
                <ChipButton
                  icon="play"
                  tone="progress"
                  className={task.status === "in_progress" ? "selected" : ""}
                  onClick={() => onAction({ type: "status", status: "in_progress" })}
                >
                  In progress
                </ChipButton>
                <ChipButton
                  icon="hourglass"
                  tone="wait"
                  className={task.status === "waiting" ? "selected" : ""}
                  onClick={() => onAction({ type: "status", status: "waiting" })}
                >
                  Waiting on them
                </ChipButton>
              </>
            )}
          </div>
        )}
        {editable && onAction && task.status !== "done" && (
          <details className="more">
            <summary>Details</summary>
            <TaskDetails
              task={task}
              today={today}
              checks={checks}
              tags={tags}
              activity={activity}
              attachments={attachments}
              subtasks={subtasks}
              siblings={siblings}
              onAction={onAction}
            />
          </details>
        )}
      </div>
      {active ? (
        <button className="text-button tone-aside" onClick={onSetAside}>
          <Icon name="box" />
          Set aside
        </button>
      ) : task.status === "set_aside" || task.status === "waiting" ? (
        <button className="text-button" onClick={onReopen}>
          {task.status === "waiting" ? "Back on my list" : "Reopen"}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
