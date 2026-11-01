import { useState } from "react";
import {
  daysBetween,
  formatDay,
  lastMetMeeting,
  nextMeeting,
  openTasksForPerson,
  type Data,
} from "./logic";

type Props = {
  data: Data;
  today: string;
  onOpen: (personId: string) => void;
  onAdd: (name: string) => Promise<void>;
};

function meta(data: Data, personId: string, today: string): string {
  const open = openTasksForPerson(data.tasks, data.meetings, personId).length;
  const openLabel = open === 0 ? "Nothing open" : open === 1 ? "1 open" : `${open} open`;
  const past = lastMetMeeting(data.meetings, personId, today);
  const future = nextMeeting(data.meetings, personId, today);
  if (past) {
    const days = daysBetween(past.meetingDate, today);
    const when = days === 0 ? "today" : days === 1 ? "yesterday" : formatDay(past.meetingDate, today);
    return `${openLabel} · Last met ${when}`;
  }
  if (future) return `${openLabel} · Next meeting ${formatDay(future.meetingDate, today)}`;
  return "No meetings yet";
}

export function People({ data, today, onOpen, onAdd }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Add a name.");
      return;
    }
    setError("");
    await onAdd(trimmed);
    setName("");
    setAdding(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-sub">Everyone you meet, and what they are waiting on.</p>
        </div>
        {data.people.length > 0 && (
          <button className="primary" onClick={() => setAdding(true)}>
            Add a person
          </button>
        )}
      </div>

      {data.people.length === 0 && !adding && (
        <div className="empty">
          <p>Add the people you meet with, and their meetings and tasks will gather here.</p>
          <button className="primary" onClick={() => setAdding(true)}>
            Add a person
          </button>
        </div>
      )}

      {adding && (
        <form
          className="add-person"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            aria-label="Name"
            placeholder="Name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <button className="primary" type="submit">
            Add
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setAdding(false);
              setName("");
              setError("");
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      <div className="people-list">
        {data.people.map((person) => (
          <button key={person.id} className="person-row" onClick={() => onOpen(person.id)}>
            <span className="person-name">{person.name}</span>
            <span className="person-meta">{meta(data, person.id, today)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
