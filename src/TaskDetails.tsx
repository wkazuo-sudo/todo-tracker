import { useState } from "react";
import type { TaskAction, TaskPatch } from "./db";
import { ChipButton } from "./icons";
import { openFocus } from "./native";
import {
  formatDay,
  type Activity,
  type Attachment,
  type CheckItem,
  type Priority,
  type RepeatRule,
  type Tag,
  type Task,
} from "./logic";

type Props = {
  task: Task;
  today: string;
  checks: CheckItem[];
  tags: Tag[];
  activity: Activity[];
  attachments: Attachment[];
  subtasks: Task[];
  siblings?: Task[];
  onAction: (action: TaskAction) => void;
};

export function TaskDetails({
  task,
  today,
  checks,
  tags,
  activity,
  attachments,
  subtasks,
  siblings = [],
  onAction,
}: Props) {
  const [checkTitle, setCheckTitle] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [tagText, setTagText] = useState(
    task.tagIds
      .map((id) => tags.find((tag) => tag.id === id)?.name ?? "")
      .filter(Boolean)
      .join(", "),
  );
  const [notes, setNotes] = useState(task.notes);
  const [ask, setAsk] = useState("");
  const [clockOn, setClockOn] = useState<number | null>(null);
  const mine = checks.filter((item) => item.taskId === task.id);
  const history = activity.filter((item) => item.taskId === task.id).slice(-6).reverse();
  const files = attachments.filter((item) => item.taskId === task.id);

  function patch(next: TaskPatch) {
    onAction({ type: "patch", patch: next });
  }

  return (
    <div className="details">
      <div className="chips">
        <ChipButton icon="play" tone="progress" className={task.status === "in_progress" ? "selected" : ""} onClick={() => onAction({ type: "status", status: "in_progress" })}>
          In progress
        </ChipButton>
        <ChipButton icon="hourglass" tone="wait" className={task.status === "waiting" ? "selected" : ""} onClick={() => onAction({ type: "status", status: "waiting" })}>
          Waiting on them
        </ChipButton>
        <ChipButton icon="circle" tone="none" className={task.status === "open" ? "selected" : ""} onClick={() => onAction({ type: "status", status: "open" })}>
          Open
        </ChipButton>
        <ChipButton icon="pin" tone="pin" className={task.pinned ? "selected" : ""} onClick={() => patch({ pinned: !task.pinned })}>
          {task.pinned ? "Unpin" : "Pin"}
        </ChipButton>
        <ChipButton icon="moon" tone="evening" className={task.evening ? "selected" : ""} onClick={() => patch({ evening: !task.evening })}>
          {task.evening ? "Not this evening" : "This evening"}
        </ChipButton>
        <ChipButton icon="clock" tone="day" onClick={() => onAction({ type: "due", dueOn: task.dueOn ? addSafe(task.dueOn, 1, today) : today })}>
          Snooze a day
        </ChipButton>
        <ChipButton icon="calendar" tone="week" onClick={() => onAction({ type: "due", dueOn: task.dueOn ? addSafe(task.dueOn, 7, today) : today })}>
          Snooze a week
        </ChipButton>
      </div>

      <div className="detail-row">
        <label>
          Priority
          <select
            value={task.priority}
            onChange={(event) => patch({ priority: event.target.value as Priority })}
          >
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Repeats
          <select
            value={task.repeatRule ?? ""}
            onChange={(event) => patch({ repeatRule: (event.target.value || null) as RepeatRule })}
          >
            <option value="">Does not repeat</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={task.remind}
            onChange={(event) => patch({ remind: event.target.checked })}
          />
          Remind me on the due date
        </label>
      </div>

      {task.movedCount > 0 && (
        <p className="quiet">Moved {task.movedCount === 1 ? "once" : `${task.movedCount} times`}.</p>
      )}

      <label className="field">
        <span>Note on this task</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== task.notes) patch({ notes });
          }}
        />
      </label>

      <label className="field">
        <span>Tags</span>
        <input
          value={tagText}
          placeholder="deck, follow-up"
          onChange={(event) => setTagText(event.target.value)}
          onBlur={() => patch({ tagNames: tagText.split(",") })}
        />
      </label>

      <div className="detail-block">
        <p className="section-label">Checklist</p>
        {mine.map((item) => (
          <label key={item.id} className="open-item">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(event) => onAction({ type: "check-toggle", id: item.id, done: event.target.checked })}
            />
            <span>{item.title}</span>
            <button type="button" className="text-button" onClick={() => onAction({ type: "check-delete", id: item.id })}>
              Remove
            </button>
          </label>
        ))}
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!checkTitle.trim()) return;
            onAction({ type: "check-add", title: checkTitle });
            setCheckTitle("");
          }}
        >
          <input
            value={checkTitle}
            placeholder="Add a step"
            aria-label="Checklist step"
            onChange={(event) => setCheckTitle(event.target.value)}
          />
          <button className="text-button" type="submit">
            Add
          </button>
        </form>
      </div>

      <div className="detail-block">
        <p className="section-label">Subtasks</p>
        {subtasks.map((item) => (
          <p key={item.id} className="quiet">
            {item.title}
            {item.dueOn ? ` · ${formatDay(item.dueOn, today)}` : ""}
          </p>
        ))}
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!subTitle.trim()) return;
            onAction({ type: "subtask", title: subTitle });
            setSubTitle("");
          }}
        >
          <input
            value={subTitle}
            placeholder="Add a subtask"
            aria-label="Subtask"
            onChange={(event) => setSubTitle(event.target.value)}
          />
          <button className="text-button" type="submit">
            Add
          </button>
        </form>
      </div>

      <div className="detail-block">
        <p className="section-label">Files on this Mac</p>
        {files.map((file) => (
          <p key={file.id} className="quiet">
            {file.name}{" "}
            <button type="button" className="text-button" onClick={() => onAction({ type: "detach", id: file.id })}>
              Remove
            </button>
          </p>
        ))}
        <button type="button" className="text-button" onClick={() => onAction({ type: "attach", name: "", path: "" })}>
          Attach a file
        </button>
      </div>

      <div className="detail-block">
        <p className="section-label">How this follow-up behaves</p>
        <div className="chips">
          <ChipButton icon="cloud" tone="evening" className={task.someday ? "selected" : ""} onClick={() => patch({ someday: !task.someday })}>
            {task.someday ? "Bring it back" : "Someday"}
          </ChipButton>
          <ChipButton icon="slash" tone="aside" onClick={() => onAction({ type: "status", status: "void" })}>
            Void it
          </ChipButton>
          <ChipButton icon="sun" tone="eod" onClick={() => patch({ wake: "open" })}>
            When I next open this Mac
          </ChipButton>
          <ChipButton icon="people" tone="day" onClick={() => patch({ wake: "meeting" })}>
            When I next log them
          </ChipButton>
          <ChipButton icon="play" tone="progress" onClick={() => void openFocus(task.id, task.title)}>
            Work on this alone
          </ChipButton>
          <ChipButton
            icon="clock"
            tone="week"
            onClick={() => {
              if (clockOn === null) {
                setClockOn(Date.now());
                return;
              }
              const mins = Math.max(1, Math.round((Date.now() - clockOn) / 60000));
              patch({ spentMin: (task.spentMin ?? 0) + mins });
              setClockOn(null);
            }}
          >
            {clockOn === null ? "Start a clock" : "Stop the clock"}
          </ChipButton>
        </div>
        {(task.spentMin ?? 0) > 0 && <p className="quiet">{task.spentMin} minutes on this so far.</p>}
        {task.sourceLine && <p className="quiet">From the note: {task.sourceLine}</p>}
        <div className="detail-row">
          <label>
            Hide until
            {task.hideUntil ? (
              <input type="date" value={task.hideUntil} onChange={(event) => patch({ hideUntil: event.target.value || null })} />
            ) : (
              <button type="button" className="chip" onClick={() => patch({ hideUntil: today })}>
                Hide until a day
              </button>
            )}
          </label>
          <label>
            Do it on
            {task.doOn ? (
              <input type="date" value={task.doOn} onChange={(event) => patch({ doOn: event.target.value || null })} />
            ) : (
              <button type="button" className="chip" onClick={() => patch({ doOn: today })}>
                A day to start
              </button>
            )}
          </label>
          <label>
            Clock
            <input value={task.clockTime ?? ""} placeholder="17:00" onChange={(event) => patch({ clockTime: event.target.value })} />
          </label>
          <label>
            Nudge at
            <input value={task.remindTime ?? ""} placeholder="09:00" onChange={(event) => patch({ remindTime: event.target.value })} />
          </label>
          <label>
            Count
            <input
              value={task.countGoal ? `${task.countDone ?? 0} of ${task.countGoal}` : ""}
              placeholder="3 of 5"
              onBlur={(event) => {
                const match = event.target.value.match(/(\d+)\s*of\s*(\d+)/i);
                if (!match) return;
                patch({ countDone: Number(match[1]), countGoal: Number(match[2]) });
              }}
            />
          </label>
          <label>
            Length
            <input
              value={task.durationMin ? String(task.durationMin) : ""}
              placeholder="Minutes"
              onBlur={(event) => patch({ durationMin: Number(event.target.value) || 0 })}
            />
          </label>
          <label>
            Waits on
            <select value={task.blockedBy ?? ""} onChange={(event) => patch({ blockedBy: event.target.value || null })}>
              <option value="">Nothing</option>
              {siblings
                .filter((item) => item.id !== task.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <form
          className="add-person"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ask.trim()) return;
            onAction({ type: "ask", title: ask.trim(), personId: task.requesterId });
            setAsk("");
          }}
        >
          <input value={ask} placeholder="A new ask for the same person" onChange={(event) => setAsk(event.target.value)} />
          <button className="text-button" type="submit">
            Add
          </button>
        </form>
      </div>

      {history.length > 0 && (
        <div className="detail-block">
          <p className="section-label">History</p>
          {history.map((item) => (
            <p key={item.id} className="quiet">
              {item.kind} · {item.detail} · {item.createdAt.slice(0, 10)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function addSafe(iso: string, days: number, today: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return today;
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
