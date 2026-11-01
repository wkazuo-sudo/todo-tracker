import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  addDays,
  findPersonByName,
  formatDay,
  nextMonday,
  openTasksForPerson,
  readDateInTitle,
  todayISO,
  type Data,
  type Person,
  type RepeatRule,
} from "./logic";
import type { NewTaskInput, SaveMeetingInput } from "./db";

const DRAFT_KEY = "todo-tracker.meeting-draft";

type Row = {
  key: string;
  title: string;
  requesterId: string;
  dueOn: string | null;
  keptWords: boolean;
  dateTouched: boolean;
  evening: boolean;
  repeatRule: RepeatRule;
};

type Draft = {
  personText: string;
  personId: string | null;
  title: string;
  meetingDate: string;
  note: string;
  rows: Row[];
  markDoneIds: string[];
  guestIds: string[];
  decisionText: string;
};

type Props = {
  data: Data;
  presetPersonId: string | null;
  busy: boolean;
  stayOpen: boolean;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSave: (input: SaveMeetingInput) => Promise<void>;
  onSaveTemplate: (name: string, lines: string[]) => void;
  onDeleteTemplate: (id: string) => void;
};

function explain(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === "string" && caught) return caught;
  try {
    const text = JSON.stringify(caught);
    if (text && text !== "{}") return text;
  } catch {
    // Fall through to the plain sentence below.
  }
  return "Could not save the meeting.";
}

function blankRow(): Row {
  return {
    key: crypto.randomUUID(),
    title: "",
    requesterId: "",
    dueOn: null,
    keptWords: false,
    dateTouched: false,
    evening: false,
    repeatRule: null,
  };
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return {
      personText: parsed.personText ?? "",
      personId: parsed.personId ?? null,
      title: parsed.title ?? "",
      meetingDate: parsed.meetingDate || todayISO(),
      note: parsed.note ?? "",
      rows: parsed.rows.map((row) => ({
        key: row.key || crypto.randomUUID(),
        title: row.title ?? "",
        requesterId: row.requesterId ?? "",
        dueOn: row.dueOn ?? null,
        keptWords: Boolean(row.keptWords),
        dateTouched: Boolean(row.dateTouched),
        evening: Boolean(row.evening),
        repeatRule: row.repeatRule ?? null,
      })),
      markDoneIds: Array.isArray(parsed.markDoneIds) ? parsed.markDoneIds : [],
      guestIds: Array.isArray(parsed.guestIds) ? parsed.guestIds : [],
      decisionText: parsed.decisionText ?? "",
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (!draft) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A draft is only a convenience. Saving the meeting still works.
  }
}

function hasContent(draft: Draft, presetName: string): boolean {
  const typedPerson = draft.personText.trim() !== "" && draft.personText.trim() !== presetName;
  return Boolean(
    draft.title.trim() ||
      draft.note.trim() ||
      typedPerson ||
      draft.markDoneIds.length > 0 ||
      draft.guestIds.length > 0 ||
      draft.decisionText.trim() !== "" ||
      draft.rows.some((row) => row.title.trim() || row.dueOn || row.requesterId),
  );
}

function initialDraft(people: Person[], presetPersonId: string | null): { draft: Draft; restored: boolean } {
  const preset = people.find((person) => person.id === presetPersonId) ?? null;
  const saved = readDraft();
  if (saved && hasContent(saved, preset?.name ?? "")) {
    const rows = saved.rows.length > 0 ? saved.rows : [blankRow(), blankRow()];
    return { draft: { ...saved, rows }, restored: true };
  }
  return {
    restored: false,
    draft: {
      personText: preset?.name ?? "",
      personId: preset?.id ?? null,
      title: "",
      meetingDate: todayISO(),
      note: "",
      rows: [blankRow(), blankRow()],
      markDoneIds: [],
      guestIds: [],
      decisionText: "",
    },
  };
}

export function MeetingSheet({ data, presetPersonId, busy, stayOpen, onDirty, onClose, onSave, onSaveTemplate, onDeleteTemplate }: Props) {
  const today = todayISO();
  const starting = initialDraft(data.people, presetPersonId);
  const [draft, setDraft] = useState<Draft>(starting.draft);
  const [restored] = useState(starting.restored);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [templateName, setTemplateName] = useState("");
  const savedRef = useRef(false);
  const titleRefs = useRef<Array<HTMLInputElement | null>>([]);
  const presetName = data.people.find((person) => person.id === presetPersonId)?.name ?? "";

  useEffect(() => {
    if (savedRef.current) return;
    writeDraft(hasContent(draft, presetName) ? draft : null);
    onDirty(hasContent(draft, presetName));
  }, [draft, onDirty, presetName]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resolved =
    findPersonByName(data.people, draft.personText) ??
    data.people.find((person) => person.id === draft.personId) ??
    null;
  const openTasks = resolved ? openTasksForPerson(data.tasks, data.meetings, resolved.id) : [];
  const tomorrow = addDays(today, 1);
  const monday = nextMonday(today);
  const query = draft.personText.trim().toLowerCase();
  const lastId = data.settings.lastPersonId;
  const matches = (query
    ? data.people.filter((person) => person.name.toLowerCase().includes(query))
    : data.people
  )
    .slice()
    .sort((a, b) => {
      if (a.id === lastId) return -1;
      if (b.id === lastId) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 6);
  const exact = findPersonByName(data.people, draft.personText);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function setRow(key: string, partial: Partial<Row>) {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.key === key ? { ...row, ...partial } : row)),
    }));
  }

  function chooseDue(key: string, dueOn: string | null) {
    setRow(key, { dueOn, dateTouched: true });
  }

  function dueSelected(dueOn: string | null, choice: string | null): boolean {
    return dueOn === choice;
  }

  async function save(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    const match = findPersonByName(data.people, draft.personText);
    const id = match?.id ?? null;
    const newName = id ? null : draft.personText.trim();
    if (!id && !newName) {
      setError("Add the person you met with.");
      return;
    }
    if (!draft.title.trim()) {
      setError("Add the meeting name.");
      return;
    }
    if (!draft.meetingDate) {
      setError("Add the meeting date.");
      return;
    }
    const tasks: NewTaskInput[] = draft.rows
      .filter((row) => row.title.trim())
      .map((row) => {
        const reading = !row.keptWords && !row.dateTouched ? readDateInTitle(row.title, today) : null;
        return {
          title: reading ? reading.title : row.title.trim(),
          requesterId: row.requesterId || null,
          dueOn: row.dueOn ?? reading?.date ?? null,
          evening: row.evening || Boolean(reading?.evening),
          repeatRule: row.repeatRule,
        };
      });
    setError("");
    try {
      await onSave({
        personId: id,
        newPersonName: newName,
        title: draft.title,
        meetingDate: draft.meetingDate,
        note: draft.note,
        tasks,
        markDoneIds: draft.markDoneIds.filter((taskId) => openTasks.some((task) => task.id === taskId)),
        guestIds: draft.guestIds,
        decisions: draft.decisionText.split("\n"),
      });
      if (stayOpen) {
        const cleared = {
          ...draft,
          title: "",
          note: "",
          decisionText: "",
          rows: [blankRow(), blankRow()],
          markDoneIds: [],
        };
        setDraft(cleared);
        writeDraft(null);
      } else {
        savedRef.current = true;
        writeDraft(null);
      }
    } catch (caught) {
      setError(explain(caught));
    }
  }

  function discard() {
    savedRef.current = true;
    writeDraft(null);
    onClose();
  }

  function onTaskKey(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (index === draft.rows.length - 1) {
      patch({ rows: [...draft.rows, blankRow()] });
    }
    window.setTimeout(() => titleRefs.current[index + 1]?.focus(), 0);
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form
        className="sheet"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      >
        <h2>New meeting</h2>
        {restored && <p className="hint">Picking up where you left off.</p>}

        <label className="field">
          <span>Person</span>
          <input
            value={draft.personText}
            placeholder="Who did you meet?"
            autoComplete="off"
            autoFocus={!draft.personId}
            aria-expanded={suggesting}
            onFocus={() => setSuggesting(true)}
            onBlur={() => window.setTimeout(() => setSuggesting(false), 120)}
            onChange={(event) => {
              const value = event.target.value;
              const match = findPersonByName(data.people, value);
              patch({ personText: value, personId: match?.id ?? null });
              setSuggesting(true);
            }}
          />
          {suggesting && (matches.length > 0 || (query && !exact)) && (
            <div className="suggestions">
              {matches.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    patch({ personText: person.name, personId: person.id });
                    setSuggesting(false);
                  }}
                >
                  {person.name}
                  {person.id === lastId ? " · last time" : ""}
                </button>
              ))}
              {query && !exact && (
                <button
                  type="button"
                  className="suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    patch({ personText: draft.personText.trim(), personId: null });
                    setSuggesting(false);
                  }}
                >
                  Add {draft.personText.trim()}
                </button>
              )}
            </div>
          )}
        </label>

        <label className="field">
          <span>Meeting</span>
          <input
            value={draft.title}
            placeholder="What did you meet about?"
            autoFocus={Boolean(draft.personId)}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={draft.meetingDate}
            onChange={(event) => patch({ meetingDate: event.target.value })}
          />
        </label>

        {data.templates.length > 0 && (
          <label className="field">
            <span>Template</span>
            <select
              value=""
              onChange={(event) => {
                const template = data.templates.find((item) => item.id === event.target.value);
                if (!template) return;
                patch({
                  rows: template.lines.map((line) => ({ ...blankRow(), title: line })),
                });
              }}
            >
              <option value="">Use a template</option>
              {data.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <div className="chips">
              {data.templates.map((template) => (
                <button key={template.id} type="button" className="text-button" onClick={() => onDeleteTemplate(template.id)}>
                  Remove {template.name}
                </button>
              ))}
            </div>
          </label>
        )}

        {data.people.length > 1 && (
          <fieldset className="field">
            <legend>Also there</legend>
            <div className="chips">
              {data.people
                .filter((person) => person.id !== resolved?.id)
                .map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={draft.guestIds.includes(person.id) ? "chip selected" : "chip"}
                    onClick={() =>
                      patch({
                        guestIds: draft.guestIds.includes(person.id)
                          ? draft.guestIds.filter((id) => id !== person.id)
                          : [...draft.guestIds, person.id],
                      })
                    }
                  >
                    {person.name}
                  </button>
                ))}
            </div>
          </fieldset>
        )}

        <label className="field">
          <span>Note</span>
          <textarea
            value={draft.note}
            placeholder="Anything you want to remember"
            onChange={(event) => patch({ note: event.target.value })}
          />
        </label>

        {openTasks.length > 0 && (
          <section className="open-list">
            <h3 className="section-label">Still open with {resolved?.name}</h3>
            <p className="hint">Mark anything that is finished, then add what was asked today.</p>
            {openTasks.map((task) => (
              <label key={task.id} className="open-item">
                <input
                  type="checkbox"
                  checked={draft.markDoneIds.includes(task.id)}
                  onChange={(event) => {
                    patch({
                      markDoneIds: event.target.checked
                        ? [...draft.markDoneIds, task.id]
                        : draft.markDoneIds.filter((id) => id !== task.id),
                    });
                  }}
                />
                <span>
                  {task.title}
                  <span className="ask">
                    {task.dueOn ? `Due ${formatDay(task.dueOn, today).toLowerCase()}` : "No due date"}
                  </span>
                </span>
              </label>
            ))}
          </section>
        )}

        <label className="field">
          <span>Decisions</span>
          <textarea
            value={draft.decisionText}
            placeholder="One decision per line"
            onChange={(event) => patch({ decisionText: event.target.value })}
          />
        </label>

        <h3 className="section-label">Tasks from this meeting</h3>
        {draft.rows.map((row, index) => {
          const custom =
            row.dueOn !== null &&
            row.dueOn !== today &&
            row.dueOn !== tomorrow &&
            row.dueOn !== monday;
          return (
            <div className="task-draft" key={row.key}>
              <input
                type="text"
                placeholder="What needs doing?"
                value={row.title}
                ref={(node) => {
                  titleRefs.current[index] = node;
                }}
                onChange={(event) => setRow(row.key, { title: event.target.value, keptWords: false })}
                onKeyDown={(event) => onTaskKey(event, index)}
              />
              {(() => {
                const reading = !row.keptWords && !row.dateTouched ? readDateInTitle(row.title, today) : null;
                if (!reading) return null;
                return (
                  <p className="hint">
                    Read as due {formatDay(reading.date, today)}
                    {reading.evening ? ", this evening" : ""}.{" "}
                    <button type="button" className="text-button" onClick={() => setRow(row.key, { keptWords: true })}>
                      Keep the words
                    </button>
                  </p>
                );
              })()}
              <div className="who-row">
                <label>
                  <span className="sr-only">Who asked</span>
                  <select
                    aria-label="Who asked"
                    value={row.requesterId}
                    onChange={(event) => setRow(row.key, { requesterId: event.target.value })}
                  >
                    <option value="">{resolved ? resolved.name : "Person in this meeting"}</option>
                    {data.people
                      .filter((person) => person.id !== resolved?.id)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="chips">
                  <button
                    type="button"
                    className={dueSelected(row.dueOn, today) ? "chip selected" : "chip"}
                    aria-label={`Due today for task ${index + 1}`}
                    onClick={() => chooseDue(row.key, today)}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={dueSelected(row.dueOn, tomorrow) ? "chip selected" : "chip"}
                    aria-label={`Due tomorrow for task ${index + 1}`}
                    onClick={() => chooseDue(row.key, tomorrow)}
                  >
                    Tomorrow
                  </button>
                  {monday !== tomorrow && (
                    <button
                      type="button"
                      className={dueSelected(row.dueOn, monday) ? "chip selected" : "chip"}
                      onClick={() => chooseDue(row.key, monday)}
                    >
                      Next Monday
                    </button>
                  )}
                  <label className={custom ? "chip selected" : "chip"}>
                    Pick a date
                    <input
                      className="sr-only"
                      type="date"
                      value={custom ? row.dueOn ?? "" : ""}
                      onChange={(event) => chooseDue(row.key, event.target.value || null)}
                    />
                  </label>
                  <button
                    type="button"
                    className={row.dueOn === null ? "chip selected" : "chip"}
                    onClick={() => chooseDue(row.key, null)}
                  >
                    No date
                  </button>
                  <select
                    aria-label={`Repeats for task ${index + 1}`}
                    value={row.repeatRule ?? ""}
                    onChange={(event) => setRow(row.key, { repeatRule: (event.target.value || null) as RepeatRule })}
                  >
                    <option value="">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
            </div>
          );
        })}

        <div className="inline-form">
          <input
            aria-label="Template name"
            placeholder="Save these tasks as a template"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          <button
            className="text-button"
            type="button"
            onClick={() => {
              onSaveTemplate(
                templateName,
                draft.rows.map((row) => row.title),
              );
              setTemplateName("");
            }}
          >
            Save template
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="text-button" onClick={discard}>
            Discard
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Save meeting
          </button>
        </div>
      </form>
    </div>
  );
}
