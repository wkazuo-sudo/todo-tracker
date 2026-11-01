import { useCallback, useEffect, useRef, useState } from "react";
import {
  addCompany,
  addDecision,
  addPerson,
  applyTask,
  deleteDecision,
  deleteMeeting,
  deletePerson,
  deleteTemplate,
  deleteView,
  loadAll,
  openDatabase,
  replaceAll,
  restoreRemoved,
  saveMeeting,
  saveTemplate,
  saveView,
  setManyDue,
  setManyStatus,
  setSetting,
  undoSave,
  updateGuests,
  updateMeeting,
  updatePerson,
  updatePersonNote,
  updateTaskDue,
  updateTaskTitle,
  type SaveMeetingInput,
  type SaveMeetingResult,
  type TaskAction,
} from "./db";
import {
  addDays,
  boardCsv,
  boardText,
  groupOpen,
  meetingText,
  personOpenText,
  savedLine,
  todayISO,
  type Data,
  type Meeting,
  type Task,
} from "./logic";
import { Dashboard } from "./Dashboard";
import { MeetingSheet } from "./MeetingSheet";
import { People } from "./People";
import { PersonPage } from "./PersonPage";
import { ArchivePage, BriefPage, Palette, ReviewPage, SettingsPage } from "./pages";
import { SearchResults } from "./SearchResults";
import {
  backupNow,
  loadCalendar,
  notifyDue,
  onLogMeeting,
  onShowPerson,
  openBeside,
  personFromUrl,
  pickAndStoreFile,
  saveTextFile,
  setMenuCount,
  watchClose,
  type CalEvent,
} from "./native";
import type Database from "@tauri-apps/plugin-sql";

type Screen =
  | { name: "home" }
  | { name: "people" }
  | { name: "person"; personId: string; meetingId?: string }
  | { name: "review" }
  | { name: "archive" }
  | { name: "brief"; personId: string }
  | { name: "settings" };

type Toast = { message: string; undo: (() => Promise<void>) | null };

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>(() => {
    const personId = personFromUrl();
    return personId ? { name: "person", personId } : { name: "home" };
  });
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPersonId, setSheetPersonId] = useState<string | null>(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [today, setToday] = useState(todayISO);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [palette, setPalette] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const dataRef = useRef(data);
  const dbRef = useRef(db);
  const dirtyRef = useRef(false);
  dataRef.current = data;
  dbRef.current = db;
  dirtyRef.current = sheetOpen && sheetDirty;

  const refresh = useCallback(async (database: Database) => {
    const next = await loadAll(database);
    setData(next);
    return next;
  }, []);

  const showToast = useCallback((next: Toast, ms: number) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const mutate = useCallback(
    async <T,>(work: (database: Database) => Promise<T>): Promise<T | undefined> => {
      const database = dbRef.current;
      const current = dataRef.current;
      if (!database || !current) return;
      const before = JSON.stringify(current);
      try {
        const result = await work(database);
        const after = await loadAll(database);
        const serialized = JSON.stringify(after);
        if (serialized !== before) {
          undoStack.current.push(before);
          if (undoStack.current.length > 40) undoStack.current.shift();
          redoStack.current = [];
        }
        setData(after);
        return result;
      } catch (caught) {
        showToast({ message: caught instanceof Error ? caught.message : "That did not save.", undo: null }, 5000);
      }
    },
    [showToast],
  );

  const undo = useCallback(async () => {
    const database = dbRef.current;
    const current = dataRef.current;
    const snap = undoStack.current.pop();
    if (!database || !current || !snap) return;
    redoStack.current.push(JSON.stringify(current));
    try {
      await replaceAll(database, JSON.parse(snap) as Data);
      setData(await loadAll(database));
    } catch (caught) {
      undoStack.current.push(snap);
      showToast({ message: caught instanceof Error ? caught.message : "Could not undo.", undo: null }, 5000);
    }
  }, [showToast]);

  const redo = useCallback(async () => {
    const database = dbRef.current;
    const current = dataRef.current;
    const snap = redoStack.current.pop();
    if (!database || !current || !snap) return;
    undoStack.current.push(JSON.stringify(current));
    try {
      await replaceAll(database, JSON.parse(snap) as Data);
      setData(await loadAll(database));
    } catch (caught) {
      redoStack.current.push(snap);
      showToast({ message: caught instanceof Error ? caught.message : "Could not redo.", undo: null }, 5000);
    }
  }, [showToast]);

  useEffect(() => {
    let alive = true;
    openDatabase()
      .then(async (database) => {
        const all = await loadAll(database);
        if (!alive) return;
        setDb(database);
        setData(all);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setError(caught instanceof Error ? caught.message : "The app could not open your saved tasks.");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const update = () => {
      setToday(todayISO());
      const database = dbRef.current;
      if (database) void refresh(database);
    };
    window.addEventListener("focus", update);
    const id = window.setInterval(() => setToday(todayISO()), 60_000);
    return () => {
      window.removeEventListener("focus", update);
      window.clearInterval(id);
    };
  }, [refresh]);

  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.dataset.type = data.settings.typeSize;
    const groups = groupOpen(data.tasks, today);
    const text =
      groups.overdue.length === 0 && groups.today.length === 0
        ? "To-Do Tracker · All caught up"
        : `To-Do Tracker · ${groups.overdue.length} overdue, ${groups.today.length} due today`;
    void setMenuCount(text);
  }, [data, today]);

  useEffect(() => {
    void loadCalendar().then(setEvents);
  }, []);

  useEffect(() => {
    const database = db;
    if (!database) return;
    const key = `todo-tracker.backup.${todayISO()}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    void backupNow(`todo-tracker-${todayISO()}.db`)
      .then(async (path) => {
        await setSetting(database, "backupPath", path);
        if (dbRef.current) setData(await loadAll(dbRef.current));
      })
      .catch(() => undefined);
  }, [db]);

  useEffect(() => {
    if (!data) return;
    for (const task of data.tasks) {
      if (!task.remind || task.dueOn !== today) continue;
      if (task.status === "done" || task.status === "set_aside") continue;
      const key = `todo-tracker.reminded.${task.id}.${today}`;
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, "1");
      void notifyDue(`Due today: ${task.title}`);
    }
  }, [data, today]);

  useEffect(() => {
    if (!data || screen.name !== "person") return;
    if (!data.people.some((person) => person.id === screen.personId)) setScreen({ name: "home" });
  }, [data, screen]);

  const openSheet = useCallback((personId: string | null) => {
    setSheetPersonId(personId);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onLogMeeting(() => openSheet(null)).then((fn) => {
      unlisten = fn;
    });
    void onShowPerson((personId) => {
      setQuery("");
      setScreen({ name: "person", personId });
    }).then((fn) => {
      const previous = unlisten;
      unlisten = () => {
        previous?.();
        fn();
      };
    });
    void watchClose(() => dirtyRef.current).then((fn) => {
      const previous = unlisten;
      unlisten = () => {
        previous?.();
        fn();
      };
    });
    return () => unlisten?.();
  }, [openSheet]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      const key = event.key.toLowerCase();
      if (meta && key === "n" && !event.shiftKey) {
        event.preventDefault();
        openSheet(screen.name === "person" ? screen.personId : null);
      } else if (meta && key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (meta && key === "k") {
        event.preventDefault();
        setPalette("");
      } else if (meta && key === "1") {
        event.preventDefault();
        setQuery("");
        setScreen({ name: "home" });
      } else if (meta && key === "2") {
        event.preventDefault();
        setQuery("");
        setScreen({ name: "people" });
      } else if (meta && key === "3") {
        event.preventDefault();
        setQuery("");
        setScreen({ name: "review" });
      } else if (meta && key === "p") {
        event.preventDefault();
        window.print();
      } else if (meta && key === "z") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) void redo();
        else void undo();
      } else if (!meta && !event.altKey && !typing && !sheetOpen && palette === null && event.key.length === 1 && event.key !== " ") {
        if (screen.name === "home" && "jk[]".includes(key)) return;
        setPalette(event.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSheet, redo, screen, sheetOpen, undo]);

  function openTask(task: Task) {
    const meeting = data?.meetings.find((item) => item.id === task.meetingId);
    if (!meeting) return;
    setQuery("");
    setScreen({ name: "person", personId: meeting.personId, meetingId: meeting.id });
  }

  async function onTask(task: Task, action: TaskAction) {
    if (action.type === "attach" && !action.path) {
      const file = await pickAndStoreFile();
      if (!file) return;
      await mutate((database) => applyTask(database, task.id, { type: "attach", name: file.name, path: file.path }));
      return;
    }
    if (action.type === "status" && action.status === "set_aside") {
      showToast({ message: "Set aside. It stays on the meeting.", undo: null }, 4000);
    }
    await mutate((database) => applyTask(database, task.id, action));
  }

  async function onSave(input: SaveMeetingInput) {
    if (!db || !data) return;
    const keep = data.settings.keepSheetOpen;
    setBusy(true);
    try {
      const result = await mutate((database) => saveMeeting(database, input));
      if (!result) return;
      setQuery("");
      if (!keep) {
        setSheetOpen(false);
        setScreen({ name: "person", personId: result.personId });
      }
      showToast(
        {
          message: savedLine(result.taskCount),
          undo: async () => {
            await undoMeeting(result, input.markDoneIds);
          },
        },
        8000,
      );
    } finally {
      setBusy(false);
    }
  }

  async function undoMeeting(result: SaveMeetingResult, markDoneIds: string[]) {
    if (!db) return;
    await undoSave(db, result, markDoneIds);
    await refresh(db);
    if (result.createdPerson) setScreen({ name: "home" });
  }

  async function exportText(contents: string, name: string) {
    try {
      const saved = await saveTextFile(name, contents);
      if (saved) showToast({ message: "Saved the file.", undo: null }, 4000);
    } catch (caught) {
      showToast({ message: caught instanceof Error ? caught.message : "Could not save the file.", undo: null }, 5000);
    }
  }

  function setting(key: string, value: string) {
    void mutate((database) => setSetting(database, key, value));
  }

  const searching = query.trim().length > 0;
  const personId = screen.name === "person" || screen.name === "brief" ? screen.personId : null;

  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">To-Do Tracker</div>
        <label className="search">
          <span className="sr-only">Search</span>
          <input ref={searchRef} placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <nav className="nav">
          {(
            [
              ["home", "Home"],
              ["people", "People"],
              ["review", "Review"],
              ["archive", "Set aside"],
            ] as const
          ).map(([name, label]) => (
            <button
              key={name}
              className={screen.name === name && !searching ? "nav-button active" : "nav-button"}
              onClick={() => {
                setQuery("");
                setScreen({ name } as Screen);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="primary sidebar-action" onClick={() => openSheet(personId)}>
          Log a meeting
          <kbd className="kbd">⌘N</kbd>
        </button>
        <button
          className={screen.name === "settings" ? "nav-button active" : "nav-button"}
          onClick={() => {
            setQuery("");
            setScreen({ name: "settings" });
          }}
        >
          Settings
        </button>
      </aside>
      <main className="main">
        <div className="main-inner">
          {error && <p className="error-banner">The app could not open your saved tasks. {error}</p>}
          {!error && !data && <Skeleton />}
          {data && searching && (
            <SearchResults
              data={data}
              query={query}
              onPerson={(id, meetingId) => {
                setQuery("");
                setScreen({ name: "person", personId: id, meetingId });
              }}
            />
          )}
          {data && !searching && screen.name === "home" && (
            <Dashboard
              data={data}
              today={today}
              events={events}
              onOpenTask={openTask}
              onOpenPerson={(id) => setScreen({ name: "person", personId: id })}
              onLog={(id) => openSheet(id ?? null)}
              onAction={(task, action) => void onTask(task, action)}
              onCheckIn={(id, kind) =>
                void mutate((database) =>
                  updatePerson(database, id, { checkInOn: kind === "snooze" ? addDays(today, 7) : null }),
                )
              }
              onMorning={(keepIds, moveIds) =>
                void mutate(async (database) => {
                  await setManyDue(database, keepIds, today);
                  await setManyDue(database, moveIds, addDays(today, 1));
                  await setSetting(database, "morningDate", today);
                })
              }
              onSaveView={(name, filter) => void mutate((database) => saveView(database, name, filter))}
              onDeleteView={(id) => void mutate((database) => deleteView(database, id))}
              onPrint={() => window.print()}
              onExport={(kind) =>
                void exportText(kind === "csv" ? boardCsv(data) : boardText(data, today), kind === "csv" ? "todo-tracker.csv" : "todo-tracker.txt")
              }
              onBulkDone={(ids) => void mutate((database) => setManyStatus(database, ids, "done"))}
              onBulkDue={(ids, dueOn) => void mutate((database) => setManyDue(database, ids, dueOn))}
            />
          )}
          {data && !searching && screen.name === "people" && (
            <People
              data={data}
              today={today}
              onOpen={(id) => setScreen({ name: "person", personId: id })}
              onAdd={async (name) => {
                const id = await mutate((database) => addPerson(database, name));
                if (id) setScreen({ name: "person", personId: id });
              }}
            />
          )}
          {data && !searching && screen.name === "person" && (
            <PersonPage
              data={data}
              personId={screen.personId}
              today={today}
              focusMeetingId={screen.meetingId}
              onLog={() => openSheet(screen.personId)}
              onDone={(task) => void onTask(task, { type: "status", status: "done" })}
              onReopen={(task) => void onTask(task, { type: "status", status: "open" })}
              onSetAside={(task) => void onTask(task, { type: "status", status: "set_aside" })}
              onTitle={(task, title) => void mutate((database) => updateTaskTitle(database, task.id, title))}
              onDue={(task, dueOn) => void mutate((database) => updateTaskDue(database, task.id, dueOn))}
              onNote={(note) => void mutate((database) => updatePersonNote(database, screen.personId, note))}
              onMeeting={(meeting: Meeting, fields) => void mutate((database) => updateMeeting(database, meeting.id, fields))}
              onDeleteMeeting={(meetingId) => void mutate((database) => deleteMeeting(database, meetingId))}
              onDeletePerson={() => {
                const id = screen.personId;
                void mutate(async (database) => {
                  await deletePerson(database, id);
                  setScreen({ name: "home" });
                });
              }}
              tools={{
                onAction: (task, action) => void onTask(task, action),
                onPerson: (fields) => void mutate((database) => updatePerson(database, screen.personId, fields)),
                onCompany: (name) =>
                  void mutate(async (database) => {
                    const id = await addCompany(database, name);
                    await updatePerson(database, screen.personId, { companyId: id });
                  }),
                onGuests: (meetingId, ids) => void mutate((database) => updateGuests(database, meetingId, ids)),
                onDecision: (meetingId, body) => void mutate((database) => addDecision(database, meetingId, body)),
                onDeleteDecision: (id) => void mutate((database) => deleteDecision(database, id)),
                onBrief: () => setScreen({ name: "brief", personId: screen.personId }),
                onBeside: () => {
                  const person = data.people.find((item) => item.id === screen.personId);
                  void openBeside(screen.personId, person?.name ?? "To-Do Tracker").catch(() =>
                    showToast({ message: "Could not open a second window.", undo: null }, 4000),
                  );
                },
                onExport: () => void exportText(personOpenText(data, screen.personId, today), "open-tasks.txt"),
                onExportMeeting: (meetingId) => void exportText(meetingText(data, meetingId, today), "meeting.txt"),
                onToggleHide: () => setting("hideFinished", data.settings.hideFinished ? "0" : "1"),
                onToggleSort: () => setting("sortClosest", data.settings.sortClosest ? "0" : "1"),
              }}
            />
          )}
          {data && !searching && screen.name === "review" && (
            <ReviewPage
              data={data}
              today={today}
              onStatus={(task, status) => void onTask(task, { type: "status", status })}
            />
          )}
          {data && !searching && screen.name === "archive" && (
            <ArchivePage
              data={data}
              today={today}
              onReopen={(task) => void onTask(task, { type: "status", status: "open" })}
              onOpen={openTask}
            />
          )}
          {data && !searching && screen.name === "brief" && (
            <BriefPage data={data} personId={screen.personId} today={today} onBack={() => setScreen({ name: "person", personId: screen.personId })} />
          )}
          {data && !searching && screen.name === "settings" && (
            <SettingsPage
              data={data}
              onTheme={() => setting("theme", data.settings.theme === "dark" ? "light" : "dark")}
              onType={() => setting("typeSize", data.settings.typeSize === "large" ? "normal" : "large")}
              onKeep={() => setting("keepSheetOpen", data.settings.keepSheetOpen ? "0" : "1")}
              onHide={() => setting("hideFinished", data.settings.hideFinished ? "0" : "1")}
              onSort={() => setting("sortClosest", data.settings.sortClosest ? "0" : "1")}
              onBackup={() =>
                void backupNow(`todo-tracker-${today}.db`)
                  .then((path) => mutate((database) => setSetting(database, "backupPath", path)))
                  .then(() => showToast({ message: "Backup saved on this Mac.", undo: null }, 4000))
                  .catch((caught: unknown) =>
                    showToast({ message: caught instanceof Error ? caught.message : "Could not back up.", undo: null }, 5000),
                  )
              }
              onRestore={(id) => void mutate((database) => restoreRemoved(database, id))}
              onExportText={() => void exportText(boardText(data, today), "todo-tracker.txt")}
              onExportCsv={() => void exportText(boardCsv(data), "todo-tracker.csv")}
              onPrint={() => {
                setScreen({ name: "home" });
                window.setTimeout(() => window.print(), 50);
              }}
            />
          )}
        </div>
      </main>
      {sheetOpen && data && (
        <MeetingSheet
          data={data}
          presetPersonId={sheetPersonId}
          busy={busy}
          stayOpen={data.settings.keepSheetOpen}
          onDirty={setSheetDirty}
          onClose={() => setSheetOpen(false)}
          onSave={onSave}
          onSaveTemplate={(name, lines) => void mutate((database) => saveTemplate(database, name, lines))}
          onDeleteTemplate={(id) => void mutate((database) => deleteTemplate(database, id))}
        />
      )}
      {palette !== null && data && (
        <Palette
          data={data}
          initialQuery={palette}
          onClose={() => setPalette(null)}
          onPerson={(id) => setScreen({ name: "person", personId: id })}
          onTask={openTask}
          onDone={(task) => void onTask(task, { type: "status", status: "done" })}
          onScreen={(name) => setScreen({ name } as Screen)}
          onLog={() => openSheet(null)}
          onPrint={() => window.print()}
          onToggleTheme={() => setting("theme", data.settings.theme === "dark" ? "light" : "dark")}
          onToggleType={() => setting("typeSize", data.settings.typeSize === "large" ? "normal" : "large")}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const run = toast.undo;
                if (toastTimer.current) window.clearTimeout(toastTimer.current);
                setToast(null);
                if (run) void run();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk-line wide" />
      <div className="sk-line" />
      <div className="sk-cards">
        <div />
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}
