import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPerson,
  deleteMeeting,
  deletePerson,
  loadAll,
  openDatabase,
  saveMeeting,
  setTaskStatus,
  undoSave,
  updateMeeting,
  updatePersonNote,
  updateTaskDue,
  updateTaskTitle,
  type SaveMeetingInput,
  type SaveMeetingResult,
} from "./db";
import { savedLine, todayISO, type Data, type Meeting, type Task } from "./logic";
import { Dashboard } from "./Dashboard";
import { MeetingSheet } from "./MeetingSheet";
import { People } from "./People";
import { PersonPage } from "./PersonPage";
import { SearchResults } from "./SearchResults";
import type Database from "@tauri-apps/plugin-sql";

type Screen =
  | { name: "home" }
  | { name: "people" }
  | { name: "person"; personId: string; meetingId?: string };

type Toast = {
  message: string;
  undo: (() => Promise<void>) | null;
};

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPersonId, setSheetPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [today, setToday] = useState(todayISO);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const refresh = useCallback(async (database: Database) => {
    setData(await loadAll(database));
  }, []);

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
    const update = () => setToday(todayISO());
    window.addEventListener("focus", update);
    const id = window.setInterval(update, 60_000);
    return () => {
      window.removeEventListener("focus", update);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!data || screen.name !== "person") return;
    if (!data.people.some((person) => person.id === screen.personId)) {
      setScreen({ name: "home" });
    }
  }, [data, screen]);

  function showToast(next: Toast, ms: number) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }

  const openSheet = useCallback((personId: string | null) => {
    setSheetPersonId(personId);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        const personId = screen.name === "person" ? screen.personId : null;
        openSheet(personId);
      } else if (key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === "1") {
        event.preventDefault();
        setQuery("");
        setScreen({ name: "home" });
      } else if (key === "2") {
        event.preventDefault();
        setQuery("");
        setScreen({ name: "people" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSheet, screen]);

  async function withDb(work: (database: Database) => Promise<void>) {
    if (!db) return;
    try {
      await work(db);
      await refresh(db);
    } catch (caught) {
      showToast(
        { message: caught instanceof Error ? caught.message : "That did not save.", undo: null },
        5000,
      );
    }
  }

  function openTask(task: Task) {
    const meeting = data?.meetings.find((item) => item.id === task.meetingId);
    if (!meeting) return;
    setQuery("");
    setScreen({ name: "person", personId: meeting.personId, meetingId: meeting.id });
  }

  async function onSave(input: SaveMeetingInput) {
    if (!db) return;
    setBusy(true);
    try {
      const result = await saveMeeting(db, input);
      await refresh(db);
      setSheetOpen(false);
      setQuery("");
      setScreen({ name: "person", personId: result.personId });
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

  const searching = query.trim().length > 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">To-Do Tracker</div>
        <label className="search">
          <span className="sr-only">Search</span>
          <input
            ref={searchRef}
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav className="nav">
          <button
            className={screen.name === "home" && !searching ? "nav-button active" : "nav-button"}
            onClick={() => {
              setQuery("");
              setScreen({ name: "home" });
            }}
          >
            Home
          </button>
          <button
            className={screen.name === "people" && !searching ? "nav-button active" : "nav-button"}
            onClick={() => {
              setQuery("");
              setScreen({ name: "people" });
            }}
          >
            People
          </button>
        </nav>
        <button
          className="primary sidebar-action"
          onClick={() => openSheet(screen.name === "person" ? screen.personId : null)}
        >
          Log a meeting
          <kbd className="kbd">⌘N</kbd>
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
              onPerson={(personId, meetingId) => {
                setQuery("");
                setScreen({ name: "person", personId, meetingId });
              }}
            />
          )}
          {data && !searching && screen.name === "home" && (
            <Dashboard
              data={data}
              today={today}
              onOpenTask={openTask}
              onOpenPerson={(personId) => setScreen({ name: "person", personId })}
              onLog={() => openSheet(null)}
              onDone={(task) => void withDb((database) => setTaskStatus(database, task.id, "done"))}
              onSetAside={(task) => {
                void withDb((database) => setTaskStatus(database, task.id, "set_aside"));
                showToast({ message: "Set aside. It stays on the meeting.", undo: null }, 4000);
              }}
            />
          )}
          {data && !searching && screen.name === "people" && (
            <People
              data={data}
              today={today}
              onOpen={(personId) => setScreen({ name: "person", personId })}
              onAdd={async (name) => {
                if (!db) return;
                const id = await addPerson(db, name);
                await refresh(db);
                setScreen({ name: "person", personId: id });
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
              onDone={(task) => void withDb((database) => setTaskStatus(database, task.id, "done"))}
              onReopen={(task) => void withDb((database) => setTaskStatus(database, task.id, "open"))}
              onSetAside={(task) => void withDb((database) => setTaskStatus(database, task.id, "set_aside"))}
              onTitle={(task, title) => void withDb((database) => updateTaskTitle(database, task.id, title))}
              onDue={(task, dueOn) => void withDb((database) => updateTaskDue(database, task.id, dueOn))}
              onNote={(note) => void withDb((database) => updatePersonNote(database, screen.personId, note))}
              onMeeting={(meeting: Meeting, fields) =>
                void withDb((database) => updateMeeting(database, meeting.id, fields))
              }
              onDeleteMeeting={(meetingId) => void withDb((database) => deleteMeeting(database, meetingId))}
              onDeletePerson={() => {
                const id = screen.personId;
                void withDb(async (database) => {
                  await deletePerson(database, id);
                  setScreen({ name: "home" });
                });
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
          onClose={() => setSheetOpen(false)}
          onSave={onSave}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo;
                if (toastTimer.current) window.clearTimeout(toastTimer.current);
                setToast(null);
                if (undo) void undo();
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
