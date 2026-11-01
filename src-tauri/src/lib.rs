use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_people",
            sql: "CREATE TABLE people (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_meetings",
            sql: "CREATE TABLE meetings (
                id TEXT PRIMARY KEY NOT NULL,
                person_id TEXT NOT NULL,
                title TEXT NOT NULL,
                meeting_date TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_tasks",
            sql: "CREATE TABLE tasks (
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
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "index_meetings_person",
            sql: "CREATE INDEX idx_meetings_person ON meetings(person_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "index_tasks_meeting",
            sql: "CREATE INDEX idx_tasks_meeting ON tasks(meeting_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "index_tasks_requester",
            sql: "CREATE INDEX idx_tasks_requester ON tasks(requester_id);",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:todo-tracker.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
