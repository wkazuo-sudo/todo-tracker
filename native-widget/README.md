# To-Do Tracker macOS Widget

This is a real WidgetKit extension for the macOS Notification Center and desktop. It has small, medium, and large layouts for your overdue tasks and tasks due today. A row opens the task in To-Do Tracker; the plus button opens quick capture. The circle queues a completion action.

## Data and actions

WidgetKit runs in a separate process. The containing app publishes one sanitized JSON snapshot into an Apple App Group container. The extension never opens the SQLite database, contacts the network, or reads meeting notes.

Snapshot file: `snapshot.json`

```json
{
  "schema_version": 1,
  "generated_at": "2026-11-09T12:00:00-03:00",
  "time_zone": "America/Sao_Paulo",
  "valid_through": "2026-11-15",
  "tasks": [
    {
      "id": "task-id",
      "title": "Send the follow-up",
      "due_on": "2026-11-09",
      "hide_until": null,
      "visible_on": ["2026-11-09", "2026-11-10"]
    }
  ]
}
```

The host supplies active, top-level My Tasks that meet the app's visibility rules. `visible_on` lists the next seven local dates when Home would show a task, so weekday, Away, sequential, and hide-until rules continue to work after midnight without putting preferences or people into the widget. `valid_through` is the last projected day; after it, the widget asks the user to open the app and refresh. The widget also checks the task due date and snapshot timezone to show overdue tasks and tasks due today. The snapshot is limited to 500 tasks and 512 KiB; IDs are limited to 128 UTF-8 bytes and titles to 512 UTF-8 bytes.

The extension writes each completion into a unique file at `commands/<uuid>.json` using an atomic write. The app ignores commands older than 30 days or more than five minutes in the future, so a delayed click cannot reapply after a later undo:

```json
{
  "schema_version": 1,
  "id": "00000000-0000-4000-8000-000000000000",
  "action": "complete_task",
  "task_id": "task-id",
  "issued_at": "2026-11-09T12:00:00-03:00"
}
```

The task remains visible with **Waiting to sync** until the host app commits the change and acknowledges the command. Pending commands are not treated as saved completions. The app owns validation, database changes, command receipts, and deep-link routing. The supported links are `todotracker://capture`, `todotracker://today`, and `todotracker://task/<id>`.

The host app should rewrite the snapshot after data changes and invoke `todo-widgetctl reload` after publishing or acknowledging commands. The reload helper runs with a two-second timeout. WidgetKit may defer timeline refreshes; Apple describes reload dates as earliest request times, not exact deadlines.

## Build prerequisites

`check-source.sh` uses `swiftc` and the macOS SDK to type-check and link the widget and helper without launching them. A complete widget build uses the included Xcode extension target so Xcode can generate App Intents metadata. The build script checks that `xcodebuild` and `appintentsmetadataprocessor` are available before proceeding. The Command Line Tools can compile and link the Swift sources, but the installed toolchain here lacks the metadata processor needed to complete a widget build with interactive AppIntent buttons.

A real App Group needs a 10-character Apple Developer Team ID shared by the host app and extension. Set `TODO_TRACKER_WIDGET_GROUP_ID` to a group name prefixed by that Team ID. The host app's merged Info.plist must contain the exact `TodoTrackerWidgetAppGroupIdentifier` key, and the Rust bridge must be compiled with the same `TODO_TRACKER_WIDGET_GROUP_ID` value. The containing app and widget extension must both carry `com.apple.security.application-groups` with the same group ID; the widget extension also uses App Sandbox. No broad file access entitlement is needed. Signing the host, extension, and helper with the matching Apple code-signing identity is required for the system to grant access and offer the widget.

## Full app packaging

Use `package-app.sh` when a signed host app review bundle is needed. It first runs `build.sh --preflight`, so missing signing, Xcode, SDK, or App Intents prerequisites stop the pipeline before any build begins. After preflight it builds the widget and reload helper, copies the host `Info.plist` to a temporary folder and adds the App Group key, compiles the Rust bridge with the same group ID, and uses a temporary Tauri config for the host entitlements and signing identity. It embeds the signed extension and helper, signs nested code before the host app, verifies the complete bundle, and writes a review-only `.app`.

The script does not change the repository's `Info.plist`, install the app, register the widget, or launch any app window. The output defaults to `/tmp/todo-tracker-widget-review`; set `TODO_TRACKER_PACKAGE_OUTPUT_DIR` to choose another folder. The low-level `build.sh` still builds signed widget artifacts only.

Run this from the repository root after replacing the example Team ID and signing identity with values from an Apple Developer account:

```sh
TODO_TRACKER_TEAM_ID="ABCDEFGHIJ" TODO_TRACKER_WIDGET_GROUP_ID="ABCDEFGHIJ.com.kazuo.todotracker" TODO_TRACKER_SIGNING_IDENTITY="Apple Development: Your Name (ABCDEFGHIJ)" ./native-widget/package-app.sh
```

Set these variables when running the low-level `build.sh` directly:

- `TODO_TRACKER_TEAM_ID`: Apple Developer Team ID.
- `TODO_TRACKER_WIDGET_GROUP_ID`: group identifier prefixed with that Team ID, for example `<TEAM_ID>.com.kazuo.todotracker`.
- `TODO_TRACKER_SIGNING_IDENTITY`: valid Apple code-signing identity installed in Keychain.
- `TODO_TRACKER_WIDGET_OUTPUT_DIR` (optional): build output directory; defaults to `/tmp/todo-tracker-widget-build`.

The low-level build output includes `ToDoTrackerWidget.appex`, `todo-widgetctl`, `widget.entitlements`, `Host-Info.plist`, and `Host.entitlements`. `build.sh --preflight` checks its Xcode, SDK, App Intents, and signing prerequisites without starting a build. Signed packaging is unverified on this machine because Xcode, the metadata processor, and a developer signing identity are unavailable.

To-Do Tracker must compile the Rust bridge with the same `TODO_TRACKER_WIDGET_GROUP_ID` value. The bridge deliberately reports the integration as unavailable when that value is absent, the shared group cannot be accessed, or the widget artifacts are not embedded.

## Current machine status

The checked machine has the Command Line Tools SDK, `swiftc`, and WidgetKit/AppIntents frameworks, so source type-checking and linking work without Xcode. It does not have `xcodebuild` or `appintentsmetadataprocessor`, has no valid code-signing identities, and the user has no Apple Developer account. The widget therefore cannot receive a legitimate Team ID/App Group entitlement and must remain unavailable in the installed app. Do not substitute an unsigned widget, point the extension at app-data/SQLite files, or register an experimental extension.

## Apple references

- [WidgetKit widgets and complications](https://developer.apple.com/documentation/widgetkit/widgets-and-complications-collection)
- [Adding interactivity to widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
- [Accessing App Group containers](https://developer.apple.com/documentation/xcode/accessing-app-group-containers)
- [Placing content in a macOS bundle](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)
