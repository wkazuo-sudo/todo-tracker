# Meeting composer and Mac widget preparation

9 November 2026. Follows the selected D — Workspace design.

## Meeting page

The meeting composer now keeps person, meeting title and date together above a wide notes editor. Notes wrap and grow vertically, including when an already populated window is resized. Enter adds a bullet, Shift+Enter keeps a line break, and Tab/Shift+Tab changes indentation.

Tasks use compact rows with one owner control and one due date. New meetings start with one empty task entry. Additional scheduling, source, repeat and requester fields stay available inside secondary controls. The save footer remains visible while the content scrolls. Expanded topics, questions and meeting options use the same clean controls.

Draft recovery, unchanged-save retries, date inference and pending-save protection are preserved. Clearing a task title keeps its typing focus. The composer covers the app toolbar and exposes dialog semantics for assistive software.

## Benchmarks

- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh): reduce the weight of supporting controls and keep actions predictable.
- [Things Quick Entry](https://culturedcode.com/things/support/articles/2249437/): prioritize fast entry and consistent keyboard behavior.
- [Granola](https://www.granola.ai/): make notes the main meeting surface and keep follow-up actions distinct.

These are design references. No connection to those services is introduced.

## Mac sidebar widget

The repository includes a native WidgetKit extension for small, medium and large widgets, plus its host bridge and build instructions. The selected scope is your overdue and today tasks, completion buttons, and an Add shortcut to Quick capture.

Only task IDs, titles and dates enter the App Group snapshot. Seven projected local days use the main list's visibility rules, including weekday scheduling, Away mode, sequential lists and hidden-until dates. The main list's person filter does not narrow the widget. An expired snapshot requests an app refresh.

Completions queue atomically and remain marked **Waiting to sync** while the host app is closed. The host rechecks current eligibility and records completion and a durable command receipt in one transaction. Receipts survive Undo and protect recurring tasks against lost acknowledgements. Snapshot publication and acknowledgements request WidgetKit reload; publication failures retry on the host's refresh timer.

An opt-in packaging script now builds the extension and host with the same App Group, embeds the extension and refresh helper, signs nested code before the host, and verifies a review-only bundle. It stops before building when signing or Xcode prerequisites are absent. It never installs, registers or launches the app.

**The widget is not activated in this local release.** This Mac has no Apple Developer signing identity or full Xcode/App Intents metadata toolchain. The normal app build reports this clearly in Settings. Swift source compilation is separate from a signed, registered widget; see [widget prerequisites](../native-widget/README.md). No experimental registration is performed. Quick capture remains available from the menu bar and Command-Shift-N.

## Verification and limits

All interaction checks use fictional data in an isolated browser preview. Native checks use in-memory data and temporary JSON files. No on-disk application database is opened by the development checks. The app is updated without quitting or reopening the user's running copy.

- 64 Node regression tests and 13 Rust tests pass. These include widget filtering, queued completion retries, JSON validation, UTF-8 limits, expiry boundaries and navigation restrictions.
- Headless checks pass for stable task typing/focus, note wrapping, Enter/Shift+Enter/Tab, failed-save recovery, retry, and resizing an already populated editor from 1440px to 390px. Window errors, unhandled rejections and browser page errors are collected; none remain.
- Swift widget/helper source type-checking and linking pass. The Xcode project, property lists, shell syntax, Rust formatting and source whitespace checks pass.
- The widget packaging preflight exits before building and names the missing signing and full Xcode prerequisites. Full signed packaging and registration are not claimed as tested.
- The production dependency audit reports zero known vulnerabilities.
- The production frontend and optimized Mac app bundle build successfully. The installed bundle matches the built executable and passes strict recursive local ad-hoc signature verification. The previous bundle is retained for rollback, and the already running app process was preserved. Reopen the app manually to use this update.

Full signed widget packaging, activation, interactive completion on a registered widget, and live App Group access remain unverified until the missing prerequisites exist. The older full native backup/restore limitation remains; this change does not claim to verify personal-data migrations.
