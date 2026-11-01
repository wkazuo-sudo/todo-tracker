import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type CalEvent = { date: string; title: string };

export async function setMenuCount(text: string): Promise<void> {
  try {
    await invoke("set_menu_count", { text });
  } catch {
    // The menu bar icon is a convenience. The window still works.
  }
}

export async function loadCalendar(): Promise<CalEvent[]> {
  try {
    return await invoke<CalEvent[]>("calendar_week");
  } catch {
    return [];
  }
}

export async function backupNow(name: string): Promise<string> {
  return invoke<string>("backup_database", { name });
}

export async function saveTextFile(defaultName: string, contents: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName });
  if (!path) return false;
  await invoke("write_text_file", { path, contents });
  return true;
}

export async function pickAndStoreFile(): Promise<{ name: string; path: string } | null> {
  const picked = await open({ multiple: false, directory: false });
  if (typeof picked !== "string") return null;
  const stored = await invoke<string>("copy_attachment", { source: picked });
  const name = picked.split("/").pop() || "File";
  return { name, path: stored };
}

export async function notifyDue(body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) return;
    sendNotification({ title: "To-Do Tracker", body });
  } catch {
    // A reminder is optional. The task stays on the list either way.
  }
}

export async function onLogMeeting(run: () => void): Promise<UnlistenFn> {
  try {
    return await listen("log-meeting", () => run());
  } catch {
    return () => undefined;
  }
}

export async function onShowPerson(run: (personId: string) => void): Promise<UnlistenFn> {
  try {
    return await listen<string>("show-person", (event) => {
      if (typeof event.payload === "string") run(event.payload);
    });
  } catch {
    return () => undefined;
  }
}

export async function openBeside(personId: string, title: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel("person");
  if (existing) {
    await existing.emit("show-person", personId);
    await existing.setFocus();
    return;
  }
  const created = new WebviewWindow("person", {
    url: `/?person=${encodeURIComponent(personId)}`,
    title,
    width: 760,
    height: 840,
    backgroundColor: "#F3F0EA",
  });
  created.once("tauri://error", () => undefined);
}

export async function watchClose(dirty: () => boolean): Promise<() => void> {
  try {
    const current = getCurrentWindow();
    let allow = false;
    return await current.onCloseRequested(async (event) => {
      if (allow || !dirty()) return;
      event.preventDefault();
      if (!window.confirm("This meeting is not saved yet. Close anyway?")) return;
      allow = true;
      await current.close();
    });
  } catch {
    return () => undefined;
  }
}

export function personFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("person");
}
