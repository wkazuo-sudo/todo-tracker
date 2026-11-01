# To-Do Tracker

A Mac app for the tasks that come out of meetings.

Each person has a page. On that page you log the meeting, the date, and the tasks they asked for. Those tasks also show up on one home screen, sorted by when they are due, with a week view and two simple charts.

Review, Set aside, and Settings are in the sidebar. Press Command-K to jump somewhere, and Command-Shift-N to log a meeting even when the app is in the background.

## Your notes stay on this Mac

People, meetings, and tasks are saved in a private file that belongs to the app. They are not part of this project, and they are not uploaded to GitHub.

Another assistant that needs to add a to-do should follow [AGENTS.md](AGENTS.md). That file is the step-by-step.

## Open it

From this folder:

```bash
npm install
npm run tauri dev
```

That opens the app on your Mac.

To make the copy you can keep in your Applications folder:

```bash
npm run tauri build
```

The first time you open that copy, Mac may ask you to confirm it. Right-click the app and choose Open.
