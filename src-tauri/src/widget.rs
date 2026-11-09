use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use objc2_foundation::{NSFileManager, NSString};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

#[cfg(target_os = "macos")]
const APP_GROUP_ID: Option<&str> = option_env!("TODO_TRACKER_WIDGET_GROUP_ID");
const WIDGET_EXTENSION_NAME: &str = "ToDoTrackerWidget.appex";
const WIDGET_RELOAD_HELPER_NAME: &str = "todo-widgetctl";
const SNAPSHOT_FILE_NAME: &str = "snapshot.json";
const COMMANDS_DIRECTORY_NAME: &str = "commands";
const MAX_SNAPSHOT_BYTES: usize = 512 * 1024;
const MAX_SNAPSHOT_TASKS: usize = 500;
const MAX_COMMAND_BYTES: usize = 16 * 1024;
const MAX_PENDING_COMMANDS: usize = 500;
const MAX_COMMAND_AGE_SECONDS: i64 = 30 * 24 * 60 * 60;
const MAX_COMMAND_FUTURE_SECONDS: i64 = 5 * 60;
const WIDGET_HELPER_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WidgetSnapshotV1 {
    pub schema_version: u32,
    pub generated_at: String,
    pub time_zone: String,
    pub valid_through: String,
    pub tasks: Vec<WidgetTaskV1>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WidgetTaskV1 {
    pub id: String,
    pub title: String,
    pub due_on: Option<String>,
    pub hide_until: Option<String>,
    pub visible_on: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WidgetCommandV1 {
    pub schema_version: u32,
    pub id: String,
    pub action: String,
    pub task_id: String,
    pub issued_at: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WidgetAvailability {
    Ready,
    NotAvailable,
}

#[derive(Clone, Debug, Serialize)]
pub struct WidgetBridgeStatus {
    pub state: WidgetAvailability,
    pub reason: Option<String>,
    pub pending_command_count: usize,
    pub generated_at: Option<String>,
}

#[cfg(target_os = "macos")]
fn group_id_is_valid(group_id: &str) -> bool {
    let Some((team_id, group_name)) = group_id.split_once('.') else {
        return false;
    };
    team_id.len() == 10
        && team_id
            .bytes()
            .all(|value| value.is_ascii_uppercase() || value.is_ascii_digit())
        && !group_name.is_empty()
        && group_name.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|value| value.is_ascii_alphanumeric() || value == b'-')
        })
}

#[cfg(target_os = "macos")]
fn group_container_path() -> Result<PathBuf, String> {
    let group_id = APP_GROUP_ID
        .filter(|value| group_id_is_valid(value))
        .ok_or_else(|| {
            "The Mac widget needs Apple Developer signing setup and Xcode. It is not available in this build yet.".to_owned()
        })?;
    let group_identifier = NSString::from_str(group_id);
    let root_url = NSFileManager::defaultManager()
        .containerURLForSecurityApplicationGroupIdentifier(&group_identifier)
        .ok_or_else(|| "The signed Apple App Group container is unavailable.".to_owned())?;
    let root = root_url
        .to_file_path()
        .ok_or_else(|| "The signed Apple App Group container is unavailable.".to_owned())?;
    let metadata = fs::symlink_metadata(&root)
        .map_err(|_| "The signed Apple App Group container is unavailable.".to_owned())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The signed Apple App Group container is unavailable.".into());
    }
    Ok(root)
}

#[cfg(not(target_os = "macos"))]
fn group_container_path() -> Result<PathBuf, String> {
    Err("The Mac widget needs Apple Developer signing setup and Xcode. It is not available in this build yet.".into())
}

fn app_bundle_contents() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let macos = executable.parent()?;
    if macos.file_name()?.to_str()? != "MacOS" {
        return None;
    }
    macos.parent().map(Path::to_path_buf)
}

fn embedded_widget_path() -> Option<PathBuf> {
    let path = app_bundle_contents()?
        .join("PlugIns")
        .join(WIDGET_EXTENSION_NAME);
    let metadata = fs::symlink_metadata(&path).ok()?;
    (metadata.is_dir() && !metadata.file_type().is_symlink()).then_some(path)
}

fn embedded_reload_helper_path() -> Option<PathBuf> {
    let contents = app_bundle_contents()?;
    let path = contents.join("MacOS").join(WIDGET_RELOAD_HELPER_NAME);
    let metadata = fs::symlink_metadata(&path).ok()?;
    (metadata.is_file() && !metadata.file_type().is_symlink()).then_some(path)
}

fn ensure_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Widget data can only be changed from the main app window.".into())
    }
}

fn validate_day(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, value)| index == 4 || index == 7 || value.is_ascii_digit())
    {
        return false;
    }
    let year = value[0..4].parse::<i32>().ok();
    let month = value[5..7].parse::<u32>().ok();
    let day = value[8..10].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day)) = (year, month, day) else {
        return false;
    };
    if year < 1 || !(1..=12).contains(&month) {
        return false;
    }
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        2 if leap_year => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=days_in_month).contains(&day)
}

fn has_control_characters(value: &str) -> bool {
    value.chars().any(char::is_control)
}

fn validate_snapshot(snapshot: &WidgetSnapshotV1) -> Result<(), String> {
    if snapshot.schema_version != 1 {
        return Err("This app can only publish widget snapshot version 1.".into());
    }
    if snapshot.generated_at.is_empty()
        || snapshot.generated_at.len() > 64
        || parse_rfc3339_unix_seconds(&snapshot.generated_at).is_none()
        || has_control_characters(&snapshot.generated_at)
    {
        return Err("The widget snapshot timestamp is invalid.".into());
    }
    if snapshot.time_zone.is_empty()
        || snapshot.time_zone.len() > 128
        || has_control_characters(&snapshot.time_zone)
    {
        return Err("The widget snapshot timezone is invalid.".into());
    }
    if !validate_day(&snapshot.valid_through) {
        return Err("The widget snapshot validity date is invalid.".into());
    }
    if snapshot.tasks.len() > MAX_SNAPSHOT_TASKS {
        return Err("The widget snapshot contains too many tasks.".into());
    }
    for task in &snapshot.tasks {
        if task.id.is_empty() || task.id.len() > 128 || has_control_characters(&task.id) {
            return Err("A widget task ID is invalid.".into());
        }
        if task.title.trim().is_empty()
            || task.title.len() > 512
            || has_control_characters(&task.title)
        {
            return Err("A widget task title is invalid.".into());
        }
        if task
            .due_on
            .as_deref()
            .is_some_and(|value| !validate_day(value))
            || task
                .hide_until
                .as_deref()
                .is_some_and(|value| !validate_day(value))
        {
            return Err("A widget task date is invalid.".into());
        }
        if task.visible_on.len() > 7
            || task
                .visible_on
                .iter()
                .any(|value| !validate_day(value) || value > &snapshot.valid_through)
        {
            return Err("A widget task visibility date is invalid.".into());
        }
    }
    Ok(())
}

fn existing_commands_directory(root: &Path) -> Result<Option<PathBuf>, String> {
    let directory = root.join(COMMANDS_DIRECTORY_NAME);
    let metadata = match fs::symlink_metadata(&directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Could not access the widget command queue.".into()),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The widget command queue is not a regular folder.".into());
    }
    Ok(Some(directory))
}

fn write_atomically(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not locate the widget file folder.".to_owned())?;
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The widget file name is invalid.".to_owned())?;
    let temporary = parent.join(format!(".{name}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "Could not create a temporary widget file.".to_owned())?;
        file.write_all(bytes)
            .map_err(|_| "Could not write the widget file.".to_owned())?;
        file.sync_all()
            .map_err(|_| "Could not finish writing the widget file.".to_owned())?;
        fs::rename(&temporary, destination)
            .map_err(|_| "Could not publish the widget file atomically.".to_owned())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn read_bounded_file(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|_| "Could not read the widget file.".to_owned())?;
    let size = usize::try_from(metadata.len()).ok();
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || size.is_none_or(|value| value > limit)
    {
        return Err("The widget file is not valid.".into());
    }
    let file = File::open(path).map_err(|_| "Could not read the widget file.".to_owned())?;
    let mut bytes = Vec::with_capacity(size.unwrap_or_default());
    file.take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read the widget file.".to_owned())?;
    if bytes.len() > limit {
        return Err("The widget file is too large.".into());
    }
    Ok(bytes)
}

fn read_commands_from(root: &Path) -> Result<Vec<WidgetCommandV1>, String> {
    read_commands_at(root, SystemTime::now())
}

fn read_commands_at(root: &Path, now: SystemTime) -> Result<Vec<WidgetCommandV1>, String> {
    let Some(directory) = existing_commands_directory(root)? else {
        return Ok(Vec::new());
    };

    let entries = fs::read_dir(&directory)
        .map_err(|_| "Could not read the widget command queue.".to_owned())?;
    let mut paths = Vec::new();
    for entry in entries.take(MAX_PENDING_COMMANDS + 1) {
        let entry = entry.map_err(|_| "Could not list widget commands.".to_owned())?;
        if entry
            .path()
            .extension()
            .is_some_and(|value| value == "json")
        {
            paths.push(entry.path());
        }
    }
    if paths.len() > MAX_PENDING_COMMANDS {
        return Err("The widget command queue is over its safe size limit.".into());
    }
    paths.sort();

    let mut commands = Vec::with_capacity(paths.len());
    for path in paths {
        let Ok(bytes) = read_bounded_file(&path, MAX_COMMAND_BYTES) else {
            continue;
        };
        let Ok(command) = serde_json::from_slice::<WidgetCommandV1>(&bytes) else {
            continue;
        };
        let expected_id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .and_then(|value| Uuid::parse_str(value).ok())
            .map(|value| value.hyphenated().to_string());
        if command.schema_version != 1
            || command.action != "complete_task"
            || command.task_id.is_empty()
            || command.task_id.len() > 128
            || has_control_characters(&command.task_id)
            || expected_id.as_deref() != Some(command.id.as_str())
        {
            continue;
        }
        if !command_is_fresh(&command.issued_at, now) {
            let _ = fs::remove_file(path);
            continue;
        }
        commands.push(command);
    }
    commands.sort_by(|left, right| {
        left.issued_at
            .cmp(&right.issued_at)
            .then(left.id.cmp(&right.id))
    });
    Ok(commands)
}

fn command_is_fresh(issued_at: &str, now: SystemTime) -> bool {
    let Ok(now) = now.duration_since(UNIX_EPOCH) else {
        return false;
    };
    let Some(issued_at) = parse_rfc3339_unix_seconds(issued_at) else {
        return false;
    };
    let now = now.as_secs().min(i64::MAX as u64) as i64;
    issued_at >= now.saturating_sub(MAX_COMMAND_AGE_SECONDS)
        && issued_at <= now.saturating_add(MAX_COMMAND_FUTURE_SECONDS)
}

fn parse_rfc3339_unix_seconds(value: &str) -> Option<i64> {
    OffsetDateTime::parse(value, &Rfc3339)
        .ok()
        .map(|timestamp| timestamp.unix_timestamp())
}

fn require_widget_ready(_app: &AppHandle) -> Result<PathBuf, String> {
    let root = group_container_path()?;
    if embedded_widget_path().is_none() || embedded_reload_helper_path().is_none() {
        return Err("The signed WidgetKit extension is not embedded in this app build.".into());
    }
    Ok(root)
}

#[tauri::command]
pub fn widget_status(_app: AppHandle) -> WidgetBridgeStatus {
    let unavailable = |reason: String| WidgetBridgeStatus {
        state: WidgetAvailability::NotAvailable,
        reason: Some(reason),
        pending_command_count: 0,
        generated_at: None,
    };
    let root = match group_container_path() {
        Ok(root) => root,
        Err(reason) => return unavailable(reason),
    };
    if embedded_widget_path().is_none() || embedded_reload_helper_path().is_none() {
        return unavailable(
            "The signed WidgetKit extension is not embedded in this app build.".into(),
        );
    }
    let commands = match read_commands_from(&root) {
        Ok(commands) => commands,
        Err(reason) => return unavailable(reason),
    };
    let generated_at = read_bounded_file(&root.join(SNAPSHOT_FILE_NAME), MAX_SNAPSHOT_BYTES)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<WidgetSnapshotV1>(&bytes).ok())
        .map(|snapshot| snapshot.generated_at);
    WidgetBridgeStatus {
        state: WidgetAvailability::Ready,
        reason: None,
        pending_command_count: commands.len(),
        generated_at,
    }
}

#[tauri::command]
pub fn publish_widget_snapshot(
    app: AppHandle,
    window: WebviewWindow,
    snapshot: WidgetSnapshotV1,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    validate_snapshot(&snapshot)?;
    let root = require_widget_ready(&app)?;
    let bytes = serde_json::to_vec(&snapshot)
        .map_err(|_| "Could not encode the widget snapshot.".to_owned())?;
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        return Err("The widget snapshot is too large.".into());
    }
    write_atomically(&root.join(SNAPSHOT_FILE_NAME), &bytes)
}

#[tauri::command]
pub fn read_widget_commands(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<WidgetCommandV1>, String> {
    ensure_main_window(&window)?;
    let root = require_widget_ready(&app)?;
    read_commands_from(&root)
}

#[tauri::command]
pub fn acknowledge_widget_command(
    app: AppHandle,
    window: WebviewWindow,
    command_id: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let root = require_widget_ready(&app)?;
    let id = Uuid::parse_str(&command_id)
        .map_err(|_| "The widget command ID is invalid.".to_owned())?
        .hyphenated()
        .to_string();
    let path = root
        .join(COMMANDS_DIRECTORY_NAME)
        .join(format!("{id}.json"));
    let Some(directory) = existing_commands_directory(&root)? else {
        return Ok(());
    };
    if path.parent() != Some(directory.as_path()) {
        return Err("The widget command location is invalid.".into());
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not acknowledge the widget command.".into()),
    }
}

#[tauri::command]
pub fn reload_widget_timeline(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    ensure_main_window(&window)?;
    let _ = require_widget_ready(&app)?;
    let helper = embedded_reload_helper_path().ok_or_else(|| {
        "The widget timeline helper is not embedded in this app build.".to_owned()
    })?;
    let mut child = Command::new(helper)
        .arg("reload")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Could not request a widget refresh.".to_owned())?;
    let started = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "Could not confirm the widget refresh request.".to_owned())?
        {
            return if status.success() {
                Ok(())
            } else {
                Err("The widget refresh request failed.".into())
            };
        }
        if started.elapsed() >= WIDGET_HELPER_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("The widget refresh request timed out.".into());
        }
        thread::sleep(Duration::from_millis(25));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("todo-widget-test-{}", Uuid::new_v4()));
            fs::create_dir(&path).expect("create isolated test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn valid_snapshot(title: String) -> WidgetSnapshotV1 {
        WidgetSnapshotV1 {
            schema_version: 1,
            generated_at: "2026-11-09T12:00:00Z".into(),
            time_zone: "America/Sao_Paulo".into(),
            valid_through: "2026-11-16".into(),
            tasks: vec![WidgetTaskV1 {
                id: "task-1".into(),
                title,
                due_on: Some("2026-11-09".into()),
                hide_until: None,
                visible_on: vec!["2026-11-09".into()],
            }],
        }
    }

    fn fixed_now() -> SystemTime {
        let timestamp = parse_rfc3339_unix_seconds("2026-11-09T12:00:00Z").unwrap();
        UNIX_EPOCH + Duration::from_secs(timestamp as u64)
    }

    fn issued_at(seconds: i64) -> String {
        let datetime = OffsetDateTime::from_unix_timestamp(seconds).unwrap();
        let month = match datetime.month() {
            time::Month::January => 1,
            time::Month::February => 2,
            time::Month::March => 3,
            time::Month::April => 4,
            time::Month::May => 5,
            time::Month::June => 6,
            time::Month::July => 7,
            time::Month::August => 8,
            time::Month::September => 9,
            time::Month::October => 10,
            time::Month::November => 11,
            time::Month::December => 12,
        };
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
            datetime.year(),
            month,
            datetime.day(),
            datetime.hour(),
            datetime.minute(),
            datetime.second()
        )
    }

    fn command(id: Uuid, task_id: String, issued_at: String) -> WidgetCommandV1 {
        WidgetCommandV1 {
            schema_version: 1,
            id: id.hyphenated().to_string(),
            action: "complete_task".into(),
            task_id,
            issued_at,
        }
    }

    fn write_command(directory: &Path, command: &WidgetCommandV1) -> PathBuf {
        let path = directory.join(format!("{}.json", command.id));
        let bytes = serde_json::to_vec(command).unwrap();
        write_atomically(&path, &bytes).unwrap();
        path
    }

    #[test]
    fn snapshot_json_round_trips_and_rejects_unknown_fields() {
        let snapshot = valid_snapshot("Prepare the follow-up".into());
        let json = serde_json::to_vec(&snapshot).unwrap();
        let decoded: WidgetSnapshotV1 = serde_json::from_slice(&json).unwrap();
        assert_eq!(decoded.tasks[0].title, "Prepare the follow-up");
        assert_eq!(decoded.tasks[0].visible_on[0], "2026-11-09");

        let with_unknown_field = String::from_utf8(json).unwrap().replace(
            "\"schema_version\":1",
            "\"unexpected\":true,\"schema_version\":1",
        );
        assert!(serde_json::from_str::<WidgetSnapshotV1>(&with_unknown_field).is_err());
    }

    #[test]
    fn day_validation_handles_calendar_edges_and_malformed_dates() {
        for valid in ["0001-01-01", "2000-02-29", "2024-02-29", "2026-11-09"] {
            assert!(validate_day(valid), "expected valid day: {valid}");
        }
        for invalid in [
            "0000-01-01",
            "1900-02-29",
            "2026-02-29",
            "2026-04-31",
            "2026-13-01",
            "2026-2-01",
            "２０２６-11-09",
        ] {
            assert!(!validate_day(invalid), "expected invalid day: {invalid}");
        }
    }

    #[test]
    fn snapshot_text_limits_count_utf8_bytes() {
        assert!(validate_snapshot(&valid_snapshot("é".repeat(256))).is_ok());
        assert!(validate_snapshot(&valid_snapshot("é".repeat(257))).is_err());

        let mut snapshot = valid_snapshot("short".into());
        snapshot.tasks[0].id = "é".repeat(64);
        assert!(validate_snapshot(&snapshot).is_ok());
        snapshot.tasks[0].id = "é".repeat(65);
        assert!(validate_snapshot(&snapshot).is_err());
    }

    #[test]
    fn command_json_queue_is_atomic_bounded_and_discards_expired_commands() {
        let root = TestDirectory::new();
        let directory = root.path().join(COMMANDS_DIRECTORY_NAME);
        fs::create_dir(&directory).unwrap();
        let now = fixed_now();
        let now_seconds = now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;

        let good = command(Uuid::new_v4(), "é".repeat(64), issued_at(now_seconds));
        let good_path = write_command(&directory, &good);
        let stale = command(
            Uuid::new_v4(),
            "expired-task".into(),
            issued_at(now_seconds - MAX_COMMAND_AGE_SECONDS - 1),
        );
        let stale_path = write_command(&directory, &stale);
        let too_far_in_future = command(
            Uuid::new_v4(),
            "future-task".into(),
            issued_at(now_seconds + MAX_COMMAND_FUTURE_SECONDS + 1),
        );
        let future_path = write_command(&directory, &too_far_in_future);
        let overlong_id = command(Uuid::new_v4(), "é".repeat(65), issued_at(now_seconds));
        let overlong_path = write_command(&directory, &overlong_id);

        let commands = read_commands_at(root.path(), now).unwrap();
        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].id, good.id);
        assert_eq!(commands[0].task_id, "é".repeat(64));
        assert!(good_path.exists());
        assert!(!stale_path.exists());
        assert!(!future_path.exists());
        assert!(overlong_path.exists());
    }

    #[test]
    fn command_freshness_includes_age_and_future_boundaries() {
        let now = fixed_now();
        let now_seconds = now.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        assert!(command_is_fresh(
            &issued_at(now_seconds - MAX_COMMAND_AGE_SECONDS),
            now
        ));
        assert!(!command_is_fresh(
            &issued_at(now_seconds - MAX_COMMAND_AGE_SECONDS - 1),
            now
        ));
        assert!(command_is_fresh(
            &issued_at(now_seconds + MAX_COMMAND_FUTURE_SECONDS),
            now
        ));
        assert!(!command_is_fresh(
            &issued_at(now_seconds + MAX_COMMAND_FUTURE_SECONDS + 1),
            now
        ));
        assert!(!command_is_fresh("not-a-time", now));
    }
}
