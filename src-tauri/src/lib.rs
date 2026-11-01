use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

fn up(version: i64, description: &'static str, sql: &'static str) -> Migration {
    Migration {
        version,
        description,
        sql,
        kind: MigrationKind::Up,
    }
}

#[derive(serde::Serialize)]
struct CalEvent {
    date: String,
    title: String,
}

fn parse_events(raw: &str) -> Vec<CalEvent> {
    let mut events: Vec<CalEvent> = Vec::new();
    for line in raw.lines() {
        let Some((date, title)) = line.split_once("||") else {
            continue;
        };
        let mut parts = date.split('-');
        let (Some(year), Some(month), Some(day)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let Ok(year) = year.parse::<i32>() else { continue };
        let Ok(month) = month.parse::<i32>() else { continue };
        let Ok(day) = day.parse::<i32>() else { continue };
        if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
            continue;
        }
        let date = format!("{year:04}-{month:02}-{day:02}");
        let title = title.trim();
        if title.is_empty() {
            continue;
        }
        if events.iter().any(|event| event.date == date && event.title == title) {
            continue;
        }
        events.push(CalEvent {
            date,
            title: title.to_string(),
        });
    }
    events
}

#[tauri::command]
fn set_menu_count(app: tauri::AppHandle, text: String) -> Result<(), String> {
    let Some(tray) = app.tray_by_id("tray") else {
        return Ok(());
    };
    tray.set_tooltip(Some(text)).map_err(|err| err.to_string())
}

#[tauri::command]
fn calendar_week() -> Vec<CalEvent> {
    let script = r#"
set output to ""
set d to current date
set time of d to 0
set endDate to d + (8 * days)
tell application "Calendar"
  repeat with c in calendars
    try
      set evs to (every event of c whose start date >= d and start date < endDate)
      repeat with e in evs
        set sd to start date of e
        set y to year of sd as integer
        set m to month of sd as integer
        set da to day of sd as integer
        set output to output & (y as string) & "-" & (m as string) & "-" & (da as string) & "||" & (summary of e as string) & linefeed
      end repeat
    end try
  end repeat
end tell
return output
"#;
    let Ok(mut child) = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return Vec::new();
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return Vec::new();
                }
                let mut out = String::new();
                if let Some(mut stdout) = child.stdout.take() {
                    let _ = stdout.read_to_string(&mut out);
                }
                return parse_events(&out);
            }
            Ok(None) if started.elapsed() > Duration::from_secs(8) => {
                let _ = child.kill();
                return Vec::new();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(_) => return Vec::new(),
        }
    }
}

#[tauri::command]
fn backup_database(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if safe.is_empty() {
        return Err("Name the backup.".into());
    }
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    let backups = dir.join("Backups");
    std::fs::create_dir_all(&backups).map_err(|err| err.to_string())?;
    let src = dir.join("todo-tracker.db");
    if !src.exists() {
        return Err("Nothing to back up yet.".into());
    }
    let dest = backups.join(&safe);
    std::fs::copy(&src, &dest).map_err(|err| err.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Choose a place to save.".into());
    }
    std::fs::write(path, contents).map_err(|err| err.to_string())
}

#[tauri::command]
fn copy_attachment(app: tauri::AppHandle, source: String) -> Result<String, String> {
    let src = std::path::PathBuf::from(&source);
    let raw = src
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    let clean: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || ".-_ ".contains(*c))
        .collect();
    let files = app
        .path()
        .app_config_dir()
        .map_err(|err| err.to_string())?
        .join("files");
    std::fs::create_dir_all(&files).map_err(|err| err.to_string())?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let dest = files.join(format!("{millis}-{clean}"));
    std::fs::copy(&src, &dest).map_err(|err| err.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

fn setup_tray(app: &tauri::App) {
    let icon = app.default_window_icon().cloned();
    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip("To-Do Tracker")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }
    if let Err(err) = builder.build(app) {
        eprintln!("menu bar: {err}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        up(
            1,
            "create_people",
            "CREATE TABLE people (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );",
        ),
        up(
            2,
            "create_meetings",
            "CREATE TABLE meetings (
                id TEXT PRIMARY KEY NOT NULL,
                person_id TEXT NOT NULL,
                title TEXT NOT NULL,
                meeting_date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );",
        ),
        up(
            3,
            "create_tasks",
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY NOT NULL,
                meeting_id TEXT NOT NULL,
                requester_id TEXT NOT NULL,
                title TEXT NOT NULL,
                requested_on TEXT NOT NULL,
                due_on TEXT,
                status TEXT NOT NULL,
                completed_at TEXT,
                created_at TEXT NOT NULL
            );",
        ),
        up(4, "index_meetings_person", "CREATE INDEX idx_meetings_person ON meetings(person_id);"),
        up(5, "index_tasks_meeting", "CREATE INDEX idx_tasks_meeting ON tasks(meeting_id);"),
        up(6, "index_tasks_requester", "CREATE INDEX idx_tasks_requester ON tasks(requester_id);"),
        up(7, "people_color", "ALTER TABLE people ADD COLUMN color TEXT NOT NULL DEFAULT '';"),
        up(8, "people_company", "ALTER TABLE people ADD COLUMN company_id TEXT;"),
        up(9, "people_check_in", "ALTER TABLE people ADD COLUMN check_in_on TEXT;"),
        up(10, "people_cadence", "ALTER TABLE people ADD COLUMN cadence_days INTEGER;"),
        up(11, "companies", "CREATE TABLE companies (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);"),
        up(12, "tasks_priority", "ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'none';"),
        up(13, "tasks_pinned", "ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;"),
        up(14, "tasks_evening", "ALTER TABLE tasks ADD COLUMN evening INTEGER NOT NULL DEFAULT 0;"),
        up(15, "tasks_repeat", "ALTER TABLE tasks ADD COLUMN repeat_rule TEXT;"),
        up(16, "tasks_notes", "ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';"),
        up(17, "tasks_moved", "ALTER TABLE tasks ADD COLUMN moved_count INTEGER NOT NULL DEFAULT 0;"),
        up(18, "tasks_parent", "ALTER TABLE tasks ADD COLUMN parent_id TEXT;"),
        up(19, "tasks_remind", "ALTER TABLE tasks ADD COLUMN remind INTEGER NOT NULL DEFAULT 0;"),
        up(20, "tasks_updated", "ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';"),
        up(
            21,
            "meeting_people",
            "CREATE TABLE meeting_people (
                meeting_id TEXT NOT NULL,
                person_id TEXT NOT NULL,
                PRIMARY KEY (meeting_id, person_id)
            );",
        ),
        up(
            22,
            "decisions",
            "CREATE TABLE decisions (
                id TEXT PRIMARY KEY NOT NULL,
                meeting_id TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        ),
        up(
            23,
            "checks",
            "CREATE TABLE checks (
                id TEXT PRIMARY KEY NOT NULL,
                task_id TEXT NOT NULL,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL DEFAULT 0
            );",
        ),
        up(24, "tags", "CREATE TABLE tags (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);"),
        up(
            25,
            "task_tags",
            "CREATE TABLE task_tags (
                task_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (task_id, tag_id)
            );",
        ),
        up(
            26,
            "activity",
            "CREATE TABLE activity (
                id TEXT PRIMARY KEY NOT NULL,
                task_id TEXT,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );",
        ),
        up(
            27,
            "attachments",
            "CREATE TABLE attachments (
                id TEXT PRIMARY KEY NOT NULL,
                task_id TEXT,
                meeting_id TEXT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at TEXT NOT NULL
            );",
        ),
        up(
            28,
            "templates",
            "CREATE TABLE templates (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                lines TEXT NOT NULL
            );",
        ),
        up(
            29,
            "saved_views",
            "CREATE TABLE saved_views (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                stale INTEGER NOT NULL DEFAULT 0,
                tag_id TEXT,
                person_id TEXT
            );",
        ),
        up(30, "settings", "CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);"),
        up(
            31,
            "removed_people",
            "CREATE TABLE removed_people (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                snapshot TEXT NOT NULL,
                removed_at TEXT NOT NULL
            );",
        ),
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:todo-tracker.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            set_menu_count,
            calendar_week,
            backup_database,
            write_text_file,
            copy_attachment
        ])
        .setup(|app| {
            setup_tray(app);
            if let Err(err) = app.global_shortcut().on_shortcut(
                "CommandOrControl+Shift+N",
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("log-meeting", ());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                },
            ) {
                eprintln!("shortcut: {err}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
