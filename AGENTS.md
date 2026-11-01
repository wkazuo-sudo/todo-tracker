# How to add a to-do

Read this file when someone wants a new to-do, follow-up, or task saved in To-Do Tracker. Do these steps in order. Do not invent another place to store the task.

The app keeps its tasks in one private database on this Mac. The database is not in this git folder. Never commit it, never copy it into the repo, and never print the Google Calendar address stored in its settings.

## 1. Find the database

The file is:

```text
~/Library/Application Support/com.kazuo.todotracker/todo-tracker.db
```

If that file does not exist, stop. Ask the user to open To-Do Tracker once. Do not create an empty database. The app creates the tables itself.

## 2. Decide where the to-do belongs

1. Match the person by name. Comparison is the trimmed name, ignoring capitals. `Gui` and `gui` are the same person.
2. If nobody matches, add a person. Use a new id. Do not add a second person with the same name.
3. If this to-do came from a meeting that is already saved for that person, keep that meeting's id. Match the same person, the same day, and the same meeting title.
4. If there is no meeting, leave the meeting id as an empty string. The to-do still belongs to the person.
5. If an open to-do for that person already has the same title, do not add another one. Add `Asked again YYYY-MM-DD` to its notes instead.

A to-do shows on Home only when all of these are true:

- status is `open` or `in_progress`
- it has no parent
- `unfiled`, `someday`, and `returned` are `0`
- `wake` is empty
- `hide_until` is empty, or is today or earlier
- the person is not paused

## 3. Choose the due day

Use this Mac's local date, `YYYY-MM-DD`. Get it with `date +%Y-%m-%d`. Do not use UTC. Around midnight, UTC is the wrong day.

| Words the user said | Date to store |
| --- | --- |
| EOD, today, no day named | today's local date |
| Tomorrow | one day after today |
| In 2 Days | two days after today |
| EOW | Friday of this week. The week starts on Monday. If that Friday is already past, use next Friday. |
| Next Week | seven days after today |
| No date | SQL `NULL` |

`owner` is `mine` when the user has to do it. `owner` is `theirs` when the other person has to do it. `indent` is `0` for a normal line, or `1` to `6` for a sub-item.

## 4. Write the to-do

Quit nothing. The app can stay open. Use this program, and change only the four values at the top.

```python
import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path

person_name = "PERSON NAME"
title = "What needs doing"
due_on = date.today().isoformat()  # or None when there is no date
meeting_id = ""  # or the existing meeting id

db_path = Path.home() / "Library/Application Support/com.kazuo.todotracker/todo-tracker.db"
db = sqlite3.connect(db_path)
db.execute("PRAGMA busy_timeout = 5000")
today = date.today().isoformat()
now = datetime.now().astimezone().isoformat()

person = db.execute(
    "SELECT id FROM people WHERE lower(trim(name)) = lower(trim(?))",
    (person_name,),
).fetchone()
if person:
    person_id = person[0]
else:
    person_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO people (id, name, note, created_at) VALUES (?, ?, '', ?)",
        (person_id, person_name.strip(), now),
    )

existing = db.execute(
    """
    SELECT id, notes FROM tasks
    WHERE requester_id = ?
      AND lower(trim(title)) = lower(trim(?))
      AND status NOT IN ('done', 'void')
    """,
    (person_id, title),
).fetchone()
if existing:
    notes = existing[1] or ""
    extra = f"Asked again {today}"
    db.execute(
        "UPDATE tasks SET notes = ?, updated_at = ? WHERE id = ?",
        (f"{notes}\n{extra}".strip(), today, existing[0]),
    )
    task_id = existing[0]
else:
    task_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO tasks (
            id, meeting_id, requester_id, title, requested_on, due_on,
            status, completed_at, created_at, notes, updated_at, owner, indent, unfiled
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?, '', ?, 'mine', 0, 0)
        """,
        (task_id, meeting_id, person_id, title.strip(), today, due_on, now, today),
    )
db.commit()
print(task_id)
db.close()
```

Set `owner` to `theirs` in that insert when the other person owns the to-do.

A meeting note is not a to-do. If the user also wants the meeting note saved, add one row to `bullets` with `owner_kind` = `meeting`, `owner_id` = the meeting id, `kind` = `note`, `body` = the line, and `position` = the next number. Also append that line to `meetings.note`. Do not put a note in `tasks` unless it is a follow-up.

## 5. Make the app show it

The window reloads its list when it becomes the front window.

1. Click another app.
2. Click To-Do Tracker again.

While developing, the process is named `tauri-app`. The installed app is named To-Do Tracker.

## 6. Check your work

Run this and confirm the new title is there. Confirm you did not remove any older row.

```sql
SELECT title, due_on, status, meeting_id
FROM tasks
WHERE id = 'THE ID YOU PRINTED';
```

On Home, the line appears under the due day you stored. On the person's page, it appears under that person. If `meeting_id` is set, it appears on that meeting.

## Do not

- Do not commit `todo-tracker.db`, or its `-wal` and `-shm` files.
- Do not delete a person, a meeting, or a to-do to "clean up" a test.
- Do not set `unfiled` to `1` unless the user asked for the catch pile.
- Do not set `someday` to `1` unless the user asked for Someday.
- Do not copy the Google Calendar address out of `settings`.
