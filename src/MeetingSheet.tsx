import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  addDays,
  findPersonByName,
  personInTitle,
  type AgendaEvent,
  formatDay,
  openTasksForPerson,
  readDateInTitle,
  todayISO,
  type Data,
  type Person,
  type RepeatRule,
} from "./logic";
import type { NewTaskInput, SaveMeetingInput } from "./db";
import { BulletList, linesFromText, type Line } from "./ui";
import "./meeting-sheet.css";

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
  indent: number;
  owner: "mine" | "theirs";
  durationMin: number;
  doOn: string | null;
  clockTime: string;
  sourceLine: string;
};

type Draft = {
  saveId: string;
  personText: string;
  personId: string | null;
  title: string;
  meetingDate: string;
  note: string;
  noteLines: Line[];
  topicLines: Line[];
  questionLines: Line[];
  privateNote: string;
  nextOn: string;
  nextFocus: string;
  spanEnd: string;
  sourceUrl: string;
  calendarUid: string;
  rows: Row[];
  markDoneIds: string[];
  guestIds: string[];
  decisionText: string;
  submittedSave?: { fingerprint: string; input: SaveMeetingInput };
};

type Props = {
  data: Data;
  presetPersonId: string | null;
  presetDate?: string | null;
  presetEvent?: AgendaEvent | null;
  agenda?: AgendaEvent[];
  travelDates?: string[];
  busy: boolean;
  stayOpen: boolean;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSave: (input: SaveMeetingInput) => Promise<void>;
  onSaveTemplate: (name: string, lines: string[]) => void;
  onDeleteTemplate: (id: string) => void;
  draftStorageKey?: string;
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
    indent: 0,
    owner: "mine",
    durationMin: 0,
    doOn: null,
    clockTime: "",
    sourceLine: "",
  };
}

function hasTaskRowContent(row: Row): boolean {
  return Boolean(
    row.title.trim() || row.requesterId || row.dueOn || row.keptWords || row.dateTouched || row.evening ||
      row.repeatRule || row.indent > 0 || row.owner === "theirs" || row.durationMin || row.doOn ||
      row.clockTime.trim() || row.sourceLine.trim(),
  );
}

function normalizeTaskRows(rows: Row[], preserveBlankKey?: string): Row[] {
  const blank = rows.find((row) => row.key === preserveBlankKey && !hasTaskRowContent(row)) ??
    rows.find((row) => !hasTaskRowContent(row)) ??
    blankRow();
  const normalized = rows.filter((row) => hasTaskRowContent(row) || row.key === blank.key);
  if (!normalized.some((row) => row.key === blank.key)) normalized.push(blank);
  return normalized;
}

function readDraft(storageKey = DRAFT_KEY): Draft | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return {
      saveId: typeof parsed.saveId === "string" && parsed.saveId ? parsed.saveId : crypto.randomUUID(),
      personText: parsed.personText ?? "",
      personId: parsed.personId ?? null,
      title: parsed.title ?? "",
      meetingDate: parsed.meetingDate || todayISO(),
      note: parsed.note ?? "",
      noteLines: parsed.noteLines?.length ? parsed.noteLines : linesFromText(parsed.note ?? ""),
      topicLines: parsed.topicLines?.length ? parsed.topicLines : [{ key: crypto.randomUUID(), text: "", indent: 0 }],
      questionLines: parsed.questionLines?.length ? parsed.questionLines : [{ key: crypto.randomUUID(), text: "", indent: 0 }],
      privateNote: parsed.privateNote ?? "",
      nextOn: parsed.nextOn ?? "",
      nextFocus: parsed.nextFocus ?? "",
      spanEnd: parsed.spanEnd ?? "",
      sourceUrl: parsed.sourceUrl ?? "",
      calendarUid: parsed.calendarUid ?? "",
      rows: parsed.rows.map((row) => ({
        key: row.key || crypto.randomUUID(),
        title: row.title ?? "",
        requesterId: row.requesterId ?? "",
        dueOn: row.dueOn ?? null,
        keptWords: Boolean(row.keptWords),
        dateTouched: Boolean(row.dateTouched),
        evening: Boolean(row.evening),
        repeatRule: row.repeatRule ?? null,
        indent: row.indent ?? 0,
        owner: row.owner === "theirs" ? "theirs" : "mine",
        durationMin: row.durationMin ?? 0,
        doOn: row.doOn ?? null,
        clockTime: row.clockTime ?? "",
        sourceLine: row.sourceLine ?? "",
      })),
      markDoneIds: Array.isArray(parsed.markDoneIds) ? parsed.markDoneIds : [],
      guestIds: Array.isArray(parsed.guestIds) ? parsed.guestIds : [],
      decisionText: parsed.decisionText ?? "",
      ...(parsed.submittedSave && typeof parsed.submittedSave.fingerprint === "string" && parsed.submittedSave.input && typeof parsed.submittedSave.input === "object"
        ? { submittedSave: parsed.submittedSave as Draft["submittedSave"] }
        : {}),
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null, storageKey = DRAFT_KEY) {
  try {
    if (!draft) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // A draft is only a convenience. Saving the meeting still works.
  }
}

function hasContent(draft: Draft, presetName: string): boolean {
  const typedPerson = draft.personText.trim() !== "" && draft.personText.trim() !== presetName;
  return Boolean(
    draft.title.trim() ||
      draft.noteLines.some((line) => line.text.trim()) ||
      draft.note.trim() ||
      draft.topicLines.some((line) => line.text.trim()) ||
      draft.questionLines.some((line) => line.text.trim()) ||
      draft.privateNote.trim() ||
      draft.nextOn.trim() ||
      draft.nextFocus.trim() ||
      draft.spanEnd.trim() ||
      draft.sourceUrl.trim() ||
      typedPerson ||
      draft.markDoneIds.length > 0 ||
      draft.guestIds.length > 0 ||
      draft.decisionText.trim() !== "" ||
      draft.rows.some((row) => row.title.trim() || row.dueOn || row.requesterId),
  );
}

function draftFingerprint(draft: Draft): string {
  const { saveId: _saveId, submittedSave: _submittedSave, ...authored } = draft;
  const withoutLineKeys = (lines: Line[]) => lines
    .filter((line) => line.text.trim())
    .map(({ key: _key, ...line }) => line);
  const rows = authored.rows
    .filter((row) => row.title.trim())
    .map(({ key: _key, ...row }) => row);
  return JSON.stringify({
    ...authored,
    noteLines: withoutLineKeys(authored.noteLines),
    topicLines: withoutLineKeys(authored.topicLines),
    questionLines: withoutLineKeys(authored.questionLines),
    rows,
  });
}

function initialDraft(
  people: Person[],
  presetPersonId: string | null,
  presetDate: string | null,
  travelDates: string[],
  presetEvent: AgendaEvent | null,
  draftStorageKey = DRAFT_KEY,
): { draft: Draft; restored: boolean } {
  const preset = people.find((person) => person.id === presetPersonId) ?? null;
  const saved = readDraft(draftStorageKey);
  if (presetEvent) {
    if (saved && hasContent(saved, preset?.name ?? "")) {
      return { draft: { ...saved, rows: normalizeTaskRows(saved.rows) }, restored: true };
    }
    return {
      restored: false,
      draft: {
        saveId: crypto.randomUUID(),
        personText: preset?.name ?? "",
        personId: preset?.id ?? null,
        title: presetEvent.title,
        meetingDate: presetEvent.date,
        note: "",
        noteLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
        topicLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
        questionLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
        privateNote: "",
        nextOn: "",
        nextFocus: "",
        spanEnd: "",
        sourceUrl: presetEvent.url,
        calendarUid: presetEvent.id,
        rows: [blankRow()],
        markDoneIds: [],
        guestIds: [],
        decisionText: "",
      },
    };
  }
  if (saved && hasContent(saved, preset?.name ?? "")) {
    const rows = normalizeTaskRows(saved.rows);
    return { draft: { ...saved, rows }, restored: true };
  }
  let meetingDate = presetDate || todayISO();
  if (travelDates.includes(meetingDate)) meetingDate = addDays(meetingDate, 1);
  return {
    restored: false,
    draft: {
      saveId: crypto.randomUUID(),
      personText: preset?.name ?? "",
      personId: preset?.id ?? null,
      title: "",
      meetingDate,
      note: "",
      noteLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
      topicLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
      questionLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
      privateNote: "",
      nextOn: "",
      nextFocus: "",
      spanEnd: "",
      sourceUrl: "",
      calendarUid: "",
      rows: [blankRow()],
      markDoneIds: [],
      guestIds: [],
      decisionText: "",
    },
  };
}

export function MeetingSheet({
  data,
  presetPersonId,
  presetDate = null,
  presetEvent = null,
  agenda = [],
  travelDates = [],
  busy,
  stayOpen,
  onDirty,
  onClose,
  onSave,
  onSaveTemplate,
  onDeleteTemplate,
  draftStorageKey = DRAFT_KEY,
}: Props) {
  const today = todayISO();
  const starting = initialDraft(data.people, presetPersonId, presetDate, travelDates, presetEvent, draftStorageKey);
  const [draft, setDraft] = useState<Draft>(starting.draft);
  const [restored, setRestored] = useState(starting.restored);
  const [recoveredFor, setRecoveredFor] = useState(
    starting.restored ? { calendarUid: starting.draft.calendarUid, meetingDate: starting.draft.meetingDate } : null,
  );
  const [speechNote, setSpeechNote] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [recoveryKind, setRecoveryKind] = useState<"payload-mismatch" | "unverifiable-receipt" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const savedRef = useRef(false);
  const savingRef = useRef(false);
  const titleRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusTaskKeyRef = useRef<string | null>(null);
  const presetName = data.people.find((person) => person.id === presetPersonId)?.name ?? "";

  useEffect(() => {
    if (savedRef.current) return;
    const shouldKeepDraft = hasContent(draft, presetName) || Boolean(draft.calendarUid);
    writeDraft(shouldKeepDraft ? draft : null, draftStorageKey);
    onDirty(shouldKeepDraft);
  }, [draft, draftStorageKey, onDirty, presetName]);

  useEffect(() => {
    if (!draft.personId) return;
    if (draft.topicLines.some((line) => line.text.trim())) return;
    const owned = data.bullets.filter(
      (bullet) =>
        bullet.kind === "topic" &&
        !bullet.done &&
        (bullet.ownerId === draft.personId ||
          data.meetings.some((meeting) => meeting.personId === draft.personId && meeting.id === bullet.ownerId)),
    );
    if (owned.length === 0) return;
    patch({
      topicLines: owned.map((bullet) => ({ key: bullet.id, text: bullet.body, indent: bullet.indent })),
    });
  }, [data.bullets, data.meetings, draft.personId, draft.topicLines]);

  useEffect(() => {
    const key = focusTaskKeyRef.current;
    if (!key) return;
    const index = draft.rows.findIndex((row) => row.key === key);
    if (index < 0) return;
    titleRefs.current[index]?.focus();
    focusTaskKeyRef.current = null;
  }, [draft.rows]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy && !savingRef.current) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const resolved =
    findPersonByName(data.people, draft.personText) ??
    data.people.find((person) => person.id === draft.personId) ??
    null;
  const openTasks = resolved ? openTasksForPerson(data.tasks, data.meetings, resolved.id) : [];
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
    setDraft((current) => {
      const rows = current.rows.map((row) => (row.key === key ? { ...row, ...partial } : row));
      return { ...current, rows: normalizeTaskRows(rows, key) };
    });
  }

  function focusNewTask() {
    const blankIndex = draft.rows.findIndex((row) => !hasTaskRowContent(row));
    const index = blankIndex >= 0 ? blankIndex : draft.rows.length;
    if (blankIndex < 0) setDraft((current) => ({ ...current, rows: normalizeTaskRows(current.rows) }));
    window.setTimeout(() => titleRefs.current[index]?.focus(), 0);
  }

  function addTaskFromNote(line: Line) {
    const normalized = normalizeTaskRows(draft.rows);
    const targetIndex = normalized.findIndex((row) => !hasTaskRowContent(row));
    const targetKey = normalized[targetIndex]?.key;
    if (targetKey) focusTaskKeyRef.current = targetKey;
    setDraft((current) => {
      const rows = normalizeTaskRows(current.rows);
      const index = rows.findIndex((row) => row.key === targetKey);
      if (index >= 0) rows[index] = { ...rows[index], title: line.text.trim(), indent: line.indent, sourceLine: line.text.trim() };
      return { ...current, rows: normalizeTaskRows(rows) };
    });
  }

  function chooseDue(key: string, dueOn: string | null) {
    setRow(key, { dueOn, dateTouched: true });
  }

  async function save(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (busy || savingRef.current) return;
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
          indent: row.indent,
          owner: row.owner,
          durationMin: row.durationMin,
          doOn: row.doOn,
          clockTime: row.clockTime,
          sourceLine: row.sourceLine,
        };
      });
    const decisionLines = draft.decisionText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const decisions: string[] = [];
    const decisionWhys: string[] = [];
    for (const line of decisionLines) {
      if (/^why:/i.test(line) && decisions.length > 0) decisionWhys[decisions.length - 1] = line.replace(/^why:\s*/i, "");
      else {
        decisions.push(line);
        decisionWhys.push("");
      }
    }
    const note = draft.noteLines
      .map((line) => `${"  ".repeat(line.indent)}${line.text.trim()}`)
      .filter((line) => line.trim())
      .join("\n");
    const fingerprint = draftFingerprint(draft);
    const cachedInput = draft.submittedSave?.fingerprint === fingerprint ? draft.submittedSave.input : null;
    const input: SaveMeetingInput = cachedInput
      ? { ...cachedInput, saveId: draft.saveId }
      : {
          personId: id,
          newPersonName: newName,
          title: draft.title,
          meetingDate: draft.meetingDate,
          note,
          noteLines: draft.noteLines,
          topics: draft.topicLines,
          questions: draft.questionLines,
          privateNote: draft.privateNote,
          nextOn: draft.nextOn || null,
          nextFocus: draft.nextFocus,
          spanEnd: draft.spanEnd || null,
          sourceUrl: draft.sourceUrl,
          calendarUid: draft.calendarUid,
          saveId: draft.saveId,
          tasks,
          markDoneIds: draft.markDoneIds.filter((taskId) => openTasks.some((task) => task.id === taskId)),
          guestIds: draft.guestIds,
          decisions,
          decisionWhys,
        };
    const submittedDraft = { ...draft, submittedSave: { fingerprint, input } };
    setDraft(submittedDraft);
    writeDraft(submittedDraft, draftStorageKey);
    setError("");
    setRecoveryKind(null);
    savingRef.current = true;
    try {
      await onSave(input);
      setRecoveryKind(null);
      setRestored(false);
      setRecoveredFor(null);
      if (stayOpen) {
        const cleared = {
          ...draft,
          saveId: crypto.randomUUID(),
          submittedSave: undefined,
          title: "",
          note: "",
          noteLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
          topicLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
          questionLines: [{ key: crypto.randomUUID(), text: "", indent: 0 }],
          privateNote: "",
          decisionText: "",
          rows: [blankRow()],
          markDoneIds: [],
        };
        setDraft(cleared);
        writeDraft(null, draftStorageKey);
      } else {
        savedRef.current = true;
        writeDraft(null, draftStorageKey);
      }
    } catch (caught) {
      setError(explain(caught));
      if (caught && typeof caught === "object" && "recoveryKind" in caught) {
        const kind = (caught as { recoveryKind?: unknown }).recoveryKind;
        setRecoveryKind(kind === "payload-mismatch" || kind === "unverifiable-receipt" ? kind : null);
      } else {
        setRecoveryKind(null);
      }
    } finally {
      savingRef.current = false;
    }
  }

  function prepareNewSaveAttempt() {
    setDraft((current) => ({ ...current, saveId: crypto.randomUUID() }));
    setRecoveryKind(null);
    setError("A new save attempt is ready. Select Save meeting to retry.");
  }

  function discard() {
    if (busy || savingRef.current) return;
    savedRef.current = true;
    writeDraft(null, draftStorageKey);
    onClose();
  }

  function onTaskKey(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Tab") {
      event.preventDefault();
      const row = draft.rows[index];
      setRow(row.key, { indent: Math.max(0, Math.min(6, row.indent + (event.shiftKey ? -1 : 1))) });
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!hasTaskRowContent(draft.rows[index])) return;
    let nextIndex = draft.rows.findIndex((row) => !hasTaskRowContent(row));
    if (nextIndex < 0) {
      nextIndex = draft.rows.length;
      setDraft((current) => ({ ...current, rows: normalizeTaskRows(current.rows) }));
    }
    window.setTimeout(() => titleRefs.current[nextIndex]?.focus(), 0);
  }


  return (
    <div
      className="meeting-composer-overlay"
      onMouseDown={() => {
        if (!busy && !savingRef.current) onClose();
      }}
    >
      <form
        className="meeting-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-composer-title"
        inert={busy}
        aria-busy={busy}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void save(event)}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void save();
            return;
          }
          if (event.key !== "Tab") return;
          const root = event.currentTarget;
          const items = Array.from(root.querySelectorAll<HTMLElement>("input, textarea, select, button")).filter(
            (item) => item.tabIndex >= 0 && !item.hasAttribute("disabled"),
          );
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="meeting-composer__header">
          <h2 id="meeting-composer-title">Log a meeting</h2>
          <button
            type="button"
            className="meeting-composer__close"
            aria-label="Close meeting composer"
            disabled={busy || savingRef.current}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="meeting-composer__body">
          {restored && <p className="meeting-composer__notice">Recovered draft · your notes and tasks are still here.</p>}
          {recoveredFor && presetEvent && (recoveredFor.calendarUid !== presetEvent.id || recoveredFor.meetingDate !== presetEvent.date) && (
            <p className="meeting-composer__notice">
              A saved meeting draft is open. Save or discard it before switching to another calendar event.
            </p>
          )}

          <section className="meeting-composer__metadata" aria-label="Meeting details">
            <label className="meeting-composer__field meeting-composer__person">
              <span>With</span>
              <input
                value={draft.personText}
                placeholder="Person's name"
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
                <div className="meeting-composer__suggestions">
                  {matches.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="meeting-composer__suggestion"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        patch({ personText: person.name, personId: person.id });
                        setSuggesting(false);
                      }}
                    >
                      {person.name}
                      {person.id === lastId ? <span>Last meeting</span> : null}
                    </button>
                  ))}
                  {query && !exact && (
                    <button
                      type="button"
                      className="meeting-composer__suggestion"
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

            <label className="meeting-composer__field meeting-composer__meeting-title">
              <span>Meeting</span>
              <input
                value={draft.title}
                placeholder="What was the meeting about?"
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>

            <label className="meeting-composer__field meeting-composer__date">
              <span>Date</span>
              <input
                type="date"
                value={draft.meetingDate}
                onChange={(event) => patch({ meetingDate: event.target.value })}
              />
            </label>
          </section>

          <section className="meeting-composer__notes" aria-labelledby="meeting-notes-title" aria-describedby="meeting-notes-help">
            <div className="meeting-composer__section-heading">
              <h3 id="meeting-notes-title">Notes</h3>
            </div>
            <span className="sr-only" id="meeting-notes-help">Enter adds a bullet. Tab indents it. Shift-Tab pulls it back.</span>
            <div className="meeting-composer__notes-editor">
              <BulletList
                label="Meeting notes"
                placeholder="Start writing…"
                lines={draft.noteLines}
                multiline
                onChange={(noteLines) => patch({ noteLines })}
              />
            </div>
            <div className="meeting-composer__note-toolbar">
              <button
                type="button"
                className="meeting-composer__quiet-button"
                onClick={() => {
                  const Speech = (window as unknown as {
                    webkitSpeechRecognition?: new () => {
                      start: () => void;
                      onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
                    };
                  }).webkitSpeechRecognition;
                  if (!Speech) {
                    setSpeechNote("Dictation is not available here. Type your note, or turn on macOS Dictation.");
                    return;
                  }
                  setSpeechNote("Listening…");
                  const heard = new Speech();
                  heard.onresult = (event) => {
                    const text = event.results[0][0].transcript;
                    patch({ noteLines: [...draft.noteLines, { key: crypto.randomUUID(), text, indent: 0 }] });
                  };
                  heard.start();
                }}
              >
                Speak a note
              </button>
              <button
                type="button"
                className="meeting-composer__quiet-button"
                onClick={() => {
                  const line = [...draft.noteLines].reverse().find((item) => item.text.trim());
                  if (line) addTaskFromNote(line);
                }}
              >
                Add last note to tasks
              </button>
              {speechNote && <span className="meeting-composer__speech-status" role="status">{speechNote}</span>}
            </div>
          </section>

          {openTasks.length > 0 && (
            <details className="meeting-composer__secondary">
              <summary>
                <span>Open tasks with {resolved?.name}</span>
                <span>{openTasks.length} to review</span>
              </summary>
              <p className="meeting-composer__secondary-note">Check anything finished in this meeting.</p>
              <div className="meeting-composer__open-tasks">
                {openTasks.map((task) => (
                  <label key={task.id} className="meeting-composer__open-task">
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
                    <span>{task.title}</span>
                    <small>{task.dueOn ? "Due " + formatDay(task.dueOn, today).toLowerCase() : "No due date"}</small>
                  </label>
                ))}
              </div>
            </details>
          )}

          <section className="meeting-composer__tasks" aria-labelledby="meeting-tasks-title">
            <div className="meeting-composer__section-heading">
              <h3 id="meeting-tasks-title">Tasks</h3>
              <button
                type="button"
                className="meeting-composer__add-task"
                onClick={focusNewTask}
              >
                <span aria-hidden="true">+</span> Add task
              </button>
            </div>
            <div className="meeting-composer__task-list">
              {draft.rows.map((row, index) => {
                const reading = !row.keptWords && !row.dateTouched ? readDateInTitle(row.title, today) : null;
                const hasAdvanced = hasTaskRowContent(row);
                return (
                  <div
                    className="meeting-composer__task-row"
                    key={row.key}
                    draggable={Boolean(row.title.trim())}
                    onDragStart={(event) => {
                      if (!row.title.trim()) return;
                      event.dataTransfer.setData("text/due-preview", reading?.date ?? "");
                      event.dataTransfer.setData("text/task-key", row.key);
                    }}
                  >
                    <div className="meeting-composer__task-main">
                      <span className="meeting-composer__task-bullet" aria-hidden="true">•</span>
                      <input
                        className="meeting-composer__task-title"
                        type="text"
                        placeholder="What needs doing?"
                        aria-label={"Task " + (index + 1) + " title"}
                        value={row.title}
                        ref={(node) => {
                          titleRefs.current[index] = node;
                        }}
                        onChange={(event) => setRow(row.key, { title: event.target.value, keptWords: false })}
                        onKeyDown={(event) => onTaskKey(event, index)}
                      />
                      <label className="meeting-composer__task-owner">
                        <span className="sr-only">Owner</span>
                        <select
                          aria-label={"Owner for task " + (index + 1)}
                          value={row.owner}
                          onChange={(event) => setRow(row.key, { owner: event.target.value === "theirs" ? "theirs" : "mine" })}
                        >
                          <option value="mine">Mine</option>
                          <option value="theirs">Waiting</option>
                        </select>
                      </label>
                      <label className="meeting-composer__task-due">
                        <span className="sr-only">Due date</span>
                        <input
                          type="date"
                          aria-label={"Due date for task " + (index + 1)}
                          value={row.dueOn ?? reading?.date ?? ""}
                          onChange={(event) => chooseDue(row.key, event.target.value || null)}
                        />
                      </label>
                    </div>

                    {reading && (
                      <p className="meeting-composer__date-reading">
                        Due date found in the title: {formatDay(reading.date, today)}
                        {reading.evening ? " · evening" : ""}
                        <button
                          type="button"
                          className="meeting-composer__quiet-button"
                          onClick={() => setRow(row.key, { keptWords: true })}
                        >
                          Keep wording
                        </button>
                      </p>
                    )}

                    {hasAdvanced && (
                      <details className="meeting-composer__task-options">
                        <summary>More options</summary>
                        <div className="meeting-composer__task-options-grid">
                          <label className="meeting-composer__field">
                            <span>Asked by</span>
                            <select
                              value={row.requesterId}
                              onChange={(event) => setRow(row.key, { requesterId: event.target.value })}
                            >
                              <option value="">{resolved ? resolved.name : "Person in this meeting"}</option>
                              {data.people
                                .filter((person) => person.id !== resolved?.id)
                                .map((person) => (
                                  <option key={person.id} value={person.id}>{person.name}</option>
                                ))}
                            </select>
                          </label>
                          <label className="meeting-composer__field">
                            <span>Day to do it</span>
                            <input
                              type="date"
                              value={row.doOn ?? ""}
                              onChange={(event) => setRow(row.key, { doOn: event.target.value || null })}
                            />
                          </label>
                          <label className="meeting-composer__field">
                            <span>Time</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="17:00"
                              value={row.clockTime}
                              onChange={(event) => setRow(row.key, { clockTime: event.target.value })}
                            />
                          </label>
                          <label className="meeting-composer__field">
                            <span>Time needed</span>
                            <select
                              value={String(row.durationMin)}
                              onChange={(event) => setRow(row.key, { durationMin: Number(event.target.value) })}
                            >
                              <option value="0">No estimate</option>
                              <option value="15">15 minutes</option>
                              <option value="30">30 minutes</option>
                              <option value="60">1 hour</option>
                            </select>
                          </label>
                          <label className="meeting-composer__field">
                            <span>Repeats</span>
                            <select
                              value={row.repeatRule ?? ""}
                              onChange={(event) => setRow(row.key, { repeatRule: (event.target.value || null) as RepeatRule })}
                            >
                              <option value="">Once</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </label>
                          <label className="meeting-composer__field">
                            <span>Indent</span>
                            <select
                              value={String(row.indent)}
                              onChange={(event) => setRow(row.key, { indent: Number(event.target.value) })}
                            >
                              {Array.from({ length: 7 }, (_, level) => (
                                <option key={level} value={String(level)}>{level === 0 ? "Top level" : "Subtask " + level}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {row.sourceLine && (
                          <p className="meeting-composer__source-line">From note: {row.sourceLine}</p>
                        )}
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <details className="meeting-composer__secondary">
            <summary>
              <span>Meeting details and options</span>
              <span>Calendar, attendees, topics, decisions</span>
            </summary>
            <div className="meeting-composer__secondary-content">
              {agenda.length > 0 && (
                <div className="meeting-composer__detail-group">
                  <h4>Calendar meetings this week</h4>
                  <div className="meeting-composer__event-list">
                    {agenda.map((event) => {
                      const selected = draft.calendarUid === event.id && draft.meetingDate === event.date;
                      const blocked = Boolean(recoveredFor && (event.id !== recoveredFor.calendarUid || event.date !== recoveredFor.meetingDate));
                      return (
                        <button
                          key={event.id + "-" + event.date}
                          type="button"
                          className={selected ? "meeting-composer__event is-selected" : "meeting-composer__event"}
                          disabled={blocked}
                          aria-pressed={selected}
                          title={blocked ? "Save or discard the recovered draft before switching events" : undefined}
                          onClick={() => {
                            if (blocked) return;
                            const person = personInTitle(data.people, event.title);
                            patch({
                              title: event.title,
                              meetingDate: event.date,
                              sourceUrl: event.url,
                              calendarUid: event.id,
                              ...(person ? { personText: person.name, personId: person.id } : {}),
                            });
                          }}
                        >
                          <span className="meeting-composer__event-date">
                            {event.date === today ? "Today" : formatDay(event.date, today)}
                            {event.time ? " · " + event.time : ""}
                          </span>
                          <span className="meeting-composer__event-title">{event.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.templates.length > 0 && (
                <div className="meeting-composer__detail-group">
                  <h4>Task templates</h4>
                  <label className="meeting-composer__field">
                    <span>Use a template</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const template = data.templates.find((item) => item.id === event.target.value);
                        if (template) patch({ rows: normalizeTaskRows(template.lines.map((line) => ({ ...blankRow(), title: line }))) });
                      }}
                    >
                      <option value="">Choose a template</option>
                      {data.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                  <div className="meeting-composer__template-list">
                    {data.templates.map((template) => (
                      <button key={template.id} type="button" onClick={() => onDeleteTemplate(template.id)}>
                        Remove {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="meeting-composer__detail-group">
                <h4>Save task template</h4>
                <div className="meeting-composer__template-save">
                  <input
                    aria-label="Template name"
                    placeholder="Name this template"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onSaveTemplate(templateName, draft.rows.map((row) => row.title).filter((title) => title.trim()));
                      setTemplateName("");
                    }}
                  >
                    Save template
                  </button>
                </div>
              </div>

              {data.people.length > 1 && (
                <fieldset className="meeting-composer__detail-group meeting-composer__attendees">
                  <legend>Also there</legend>
                  <div className="meeting-composer__people-list">
                    {data.people
                      .filter((person) => person.id !== resolved?.id)
                      .map((person) => (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            checked={draft.guestIds.includes(person.id)}
                            onChange={(event) => patch({
                              guestIds: event.target.checked
                                ? [...draft.guestIds, person.id]
                                : draft.guestIds.filter((id) => id !== person.id),
                            })}
                          />
                          <span>{person.name}</span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}

              <div className="meeting-composer__detail-group">
                <h4>Meeting date shortcuts</h4>
                <p className="meeting-composer__secondary-note">
                  Click a day to set the meeting date, or drag a task here to set its due date.
                </p>
                <div className="meeting-composer__date-targets">
                  {Array.from({ length: 7 }, (_, offset) => addDays(today, offset)).map((date) => (
                    <button
                      key={date}
                      type="button"
                      className={draft.meetingDate === date ? "meeting-composer__date-target is-selected" : "meeting-composer__date-target"}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        const key = event.dataTransfer.getData("text/task-key");
                        if (key) setRow(key, { dueOn: date, dateTouched: true });
                      }}
                      onClick={() => patch({ meetingDate: date })}
                    >
                      {date === today ? "Today" : formatDay(date, today)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="meeting-composer__field">
                <span>Decisions</span>
                <textarea
                  value={draft.decisionText}
                  placeholder="One decision per line. Add “Why:” on the next line if useful."
                  onChange={(event) => patch({ decisionText: event.target.value })}
                />
              </label>

              <div className="meeting-composer__detail-group">
                <h4>Topics to discuss</h4>
                <BulletList label="Topics" placeholder="A topic, not a task" lines={draft.topicLines} onChange={(topicLines) => patch({ topicLines })} />
              </div>

              <div className="meeting-composer__detail-group">
                <h4>Questions still open</h4>
                <BulletList label="Questions" placeholder="Something the meeting did not settle" lines={draft.questionLines} onChange={(questionLines) => patch({ questionLines })} />
              </div>

              <label className="meeting-composer__field">
                <span>Private note</span>
                <textarea value={draft.privateNote} placeholder="Only for you. Excluded from briefs and saved files." onChange={(event) => patch({ privateNote: event.target.value })} />
              </label>

              <div className="meeting-composer__metadata-more">
                <label className="meeting-composer__field">
                  <span>Next meeting</span>
                  {draft.nextOn ? (
                    <input type="date" value={draft.nextOn} onChange={(event) => patch({ nextOn: event.target.value })} />
                  ) : (
                    <button type="button" onClick={() => patch({ nextOn: addDays(today, 7) })}>Set a date</button>
                  )}
                </label>
                <label className="meeting-composer__field">
                  <span>Next meeting focus</span>
                  <input value={draft.nextFocus} placeholder="What should it cover?" onChange={(event) => patch({ nextFocus: event.target.value })} />
                </label>
                <label className="meeting-composer__field">
                  <span>This meeting covers until</span>
                  {draft.spanEnd ? (
                    <input type="date" value={draft.spanEnd} onChange={(event) => patch({ spanEnd: event.target.value })} />
                  ) : (
                    <button type="button" onClick={() => patch({ spanEnd: addDays(draft.meetingDate || today, 1) })}>Set an end date</button>
                  )}
                </label>
                <label className="meeting-composer__field">
                  <span>Source link</span>
                  <input value={draft.sourceUrl} placeholder="https://" onChange={(event) => patch({ sourceUrl: event.target.value })} />
                </label>
              </div>
            </div>
          </details>
        </div>

        <footer className="meeting-composer__footer">
          <div className="meeting-composer__footer-status">
            {error && <p className="meeting-composer__error" role="alert">{error}</p>}
            {recoveryKind && (
              <button type="button" className="meeting-composer__recovery-action" onClick={prepareNewSaveAttempt}>
                Prepare a new save attempt
              </button>
            )}
            {!error && <span>⌘ Return to save</span>}
          </div>
          <div className="meeting-composer__actions">
            <button type="button" className="meeting-composer__discard" disabled={busy} onClick={discard}>Discard</button>
            <button type="submit" className="meeting-composer__save" disabled={busy || savingRef.current}>Save meeting</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
