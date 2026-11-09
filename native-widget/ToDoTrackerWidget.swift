import AppIntents
import Foundation
import SwiftUI
import WidgetKit

private enum WidgetContract {
    static let kind = "com.kazuo.todotracker.my-tasks"
    static let appGroupInfoKey = "TodoTrackerWidgetAppGroupIdentifier"
    static let snapshotFileName = "snapshot.json"
    static let commandDirectoryName = "commands"
    static let maxSnapshotBytes = 512 * 1024
    static let maxCommandBytes = 16 * 1024
    static let maxCommands = 500
    static let captureURL = URL(string: "todotracker://capture")!
    static let todayURL = URL(string: "todotracker://today")!
}

private struct WidgetSnapshot: Decodable {
    let schema_version: Int
    let generated_at: String
    let time_zone: String
    let valid_through: String
    let tasks: [WidgetTask]
}

private struct WidgetTask: Decodable, Identifiable {
    let id: String
    let title: String
    let due_on: String?
    let hide_until: String?
    let visible_on: [String]
}

private struct WidgetCommand: Decodable {
    let schema_version: Int
    let id: String
    let action: String
    let task_id: String
    let issued_at: String
}

private struct TaskLine: Identifiable {
    let task: WidgetTask
    let overdue: Bool
    let waitingToSync: Bool

    var id: String { task.id }
}

private struct MyTasksEntry: TimelineEntry {
    let date: Date
    let overdueTasks: [TaskLine]
    let todayTasks: [TaskLine]
    let pendingCount: Int
    let generatedAt: Date?
    let unavailable: Bool
    let stale: Bool
    let timeZoneIdentifier: String

    static func unavailable(
        at date: Date,
        stale: Bool = false,
        pendingCount: Int = 0,
        timeZoneIdentifier: String = TimeZone.current.identifier
    ) -> MyTasksEntry {
        MyTasksEntry(
            date: date,
            overdueTasks: [],
            todayTasks: [],
            pendingCount: pendingCount,
            generatedAt: nil,
            unavailable: true,
            stale: stale,
            timeZoneIdentifier: timeZoneIdentifier
        )
    }
}

private enum WidgetStore {
    static func readEntry(at now: Date) -> MyTasksEntry {
        do {
            let root = try sharedContainer()
            let snapshotURL = root.appendingPathComponent(WidgetContract.snapshotFileName)
            let metadata = try snapshotURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey])
            guard metadata.isRegularFile == true,
                  metadata.isSymbolicLink != true,
                  let size = metadata.fileSize,
                  size > 0,
                  size <= WidgetContract.maxSnapshotBytes else {
                return .unavailable(at: now)
            }

            let snapshotData = try Data(contentsOf: snapshotURL, options: [.mappedIfSafe])
            let decoder = JSONDecoder()
            let snapshot = try decoder.decode(WidgetSnapshot.self, from: snapshotData)
            guard snapshot.schema_version == 1,
                  snapshot.tasks.count <= WidgetContract.maxCommands,
                  snapshot.time_zone.count <= 128,
                  isValidDay(snapshot.valid_through) else {
                return .unavailable(at: now)
            }

            guard let timeZone = TimeZone(identifier: snapshot.time_zone) else {
                return .unavailable(at: now)
            }
            let today = dayString(for: now, timeZone: timeZone)
            let pendingCommands = readPendingCommands(from: root, now: now)
            guard today <= snapshot.valid_through else {
                return .unavailable(
                    at: now,
                    stale: true,
                    pendingCount: pendingCommands.count,
                    timeZoneIdentifier: timeZone.identifier
                )
            }
            let pendingTaskIDs = Set(
                pendingCommands
                    .filter { $0.action == "complete_task" && $0.schema_version == 1 }
                    .map(\.task_id)
            )

            let visibleTasks = snapshot.tasks.compactMap { task -> TaskLine? in
                guard !task.id.isEmpty,
                      task.id.utf8.count <= 128,
                      !task.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      task.title.utf8.count <= 512,
                      task.visible_on.count <= 7,
                      task.visible_on.allSatisfy(isValidDay),
                      task.visible_on.contains(today),
                      let dueOn = task.due_on,
                      isValidDay(dueOn) else {
                    return nil
                }
                if let hideUntil = task.hide_until,
                   (!isValidDay(hideUntil) || hideUntil > today) {
                    return nil
                }
                guard dueOn <= today else { return nil }
                return TaskLine(task: task, overdue: dueOn < today, waitingToSync: pendingTaskIDs.contains(task.id))
            }

            let overdue = visibleTasks
                .filter(\.overdue)
                .sorted { ($0.task.due_on ?? "") == ($1.task.due_on ?? "")
                    ? $0.task.title.localizedStandardCompare($1.task.title) == .orderedAscending
                    : ($0.task.due_on ?? "") < ($1.task.due_on ?? "") }
            let dueToday = visibleTasks
                .filter { !$0.overdue }
                .sorted { $0.task.title.localizedStandardCompare($1.task.title) == .orderedAscending }
            let updated = parseTimestamp(snapshot.generated_at)
            let stale = updated.map { now.timeIntervalSince($0) > 12 * 60 * 60 } ?? true

            return MyTasksEntry(
                date: now,
                overdueTasks: overdue,
                todayTasks: dueToday,
                pendingCount: pendingCommands.count,
                generatedAt: updated,
                unavailable: false,
                stale: stale,
                timeZoneIdentifier: timeZone.identifier
            )
        } catch {
            return .unavailable(at: now)
        }
    }

    static func enqueueCompletion(taskID: String) throws {
        guard !taskID.isEmpty, taskID.utf8.count <= 128 else {
            throw WidgetStoreError.invalidTask
        }
        let root = try sharedContainer()
        let directory = root.appendingPathComponent(WidgetContract.commandDirectoryName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try ensureRegularDirectory(directory)
        let now = Date()
        let pendingCommands = readPendingCommands(from: root, now: now)

        if pendingCommands.contains(where: { $0.action == "complete_task" && $0.task_id == taskID }) {
            return
        }
        guard pendingCommands.count < WidgetContract.maxCommands else {
            throw WidgetStoreError.queueFull
        }

        let command = WidgetCommandPayload(
            schema_version: 1,
            id: UUID().uuidString.lowercased(),
            action: "complete_task",
            task_id: taskID,
            issued_at: timestamp(now)
        )
        let data = try JSONEncoder().encode(command)
        guard data.count <= WidgetContract.maxCommandBytes else { throw WidgetStoreError.commandTooLarge }
        let destination = directory.appendingPathComponent("\(command.id).json")
        try data.write(to: destination, options: [.atomic])
    }

    static func requestReload() {
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetContract.kind)
    }

    private static func sharedContainer() throws -> URL {
        guard let group = Bundle.main.object(forInfoDictionaryKey: WidgetContract.appGroupInfoKey) as? String,
              !group.isEmpty,
              group.utf8.count <= 255,
              !group.contains("/"),
              !group.contains("\\") else {
            throw WidgetStoreError.groupUnavailable
        }
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw WidgetStoreError.groupUnavailable
        }
        try ensureRegularDirectory(root)
        return root
    }

    private static func ensureRegularDirectory(_ url: URL) throws {
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard values.isDirectory == true, values.isSymbolicLink != true else {
            throw WidgetStoreError.groupUnavailable
        }
    }

    private static func readPendingCommands(from root: URL, now: Date) -> [WidgetCommand] {
        let directory = root.appendingPathComponent(WidgetContract.commandDirectoryName, isDirectory: true)
        guard (try? ensureRegularDirectory(directory)) != nil,
              let files = try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey]
              ) else {
            return []
        }

        return files
            .filter { $0.pathExtension == "json" }
            .prefix(WidgetContract.maxCommands)
            .compactMap { url in
                guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .isSymbolicLinkKey]),
                      values.isRegularFile == true,
                      values.isSymbolicLink != true,
                      let size = values.fileSize,
                      size > 0,
                      size <= WidgetContract.maxCommandBytes,
                      let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
                      let command = try? JSONDecoder().decode(WidgetCommand.self, from: data),
                      command.schema_version == 1,
                      command.id == url.deletingPathExtension().lastPathComponent,
                      command.action == "complete_task",
                      !command.task_id.isEmpty,
                      command.task_id.utf8.count <= 128,
                      let issuedAt = parseTimestamp(command.issued_at),
                      issuedAt >= now.addingTimeInterval(-30 * 24 * 60 * 60),
                      issuedAt <= now.addingTimeInterval(5 * 60) else {
                    return nil
                }
                return command
            }
    }

    private static func dayString(for date: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func isValidDay(_ value: String) -> Bool {
        guard value.utf8.count == 10 else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let parsed = formatter.date(from: value) else { return false }
        return formatter.string(from: parsed) == value
    }

    private static func parseTimestamp(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private static func timestamp(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: value)
    }
}

private struct WidgetCommandPayload: Encodable {
    let schema_version: Int
    let id: String
    let action: String
    let task_id: String
    let issued_at: String
}

private enum WidgetStoreError: Error {
    case groupUnavailable
    case invalidTask
    case queueFull
    case commandTooLarge
}

private struct MyTasksProvider: TimelineProvider {
    func placeholder(in context: Context) -> MyTasksEntry {
        .unavailable(at: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (MyTasksEntry) -> Void) {
        completion(WidgetStore.readEntry(at: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MyTasksEntry>) -> Void) {
        let now = Date()
        let entry = WidgetStore.readEntry(at: now)
        let timeZone = TimeZone(identifier: entry.timeZoneIdentifier) ?? .current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now.addingTimeInterval(30 * 60)
        let refreshAt = entry.unavailable ? now.addingTimeInterval(30 * 60) : tomorrow
        completion(Timeline(entries: [entry], policy: .after(refreshAt)))
    }
}

private struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete To-Do Tracker task"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Task ID") var taskID: String

    init() {}

    init(taskID: String) {
        self.taskID = taskID
    }

    func perform() async throws -> some IntentResult {
        try WidgetStore.enqueueCompletion(taskID: taskID)
        WidgetStore.requestReload()
        return .result()
    }
}

private struct MyTasksWidgetView: View {
    let entry: MyTasksEntry

    @Environment(\.widgetFamily) private var family

    private var maximumTaskCount: Int {
        switch family {
        case .systemSmall, .systemMedium: 2
        default: 5
        }
    }

    private var totalTaskCount: Int {
        entry.overdueTasks.count + entry.todayTasks.count
    }

    private var visibleTasks: [TaskLine] {
        Array((entry.overdueTasks + entry.todayTasks).prefix(maximumTaskCount))
    }

    private var omittedTaskCount: Int {
        max(0, totalTaskCount - visibleTasks.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("My Tasks")
                    .font(.headline)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Link(destination: WidgetContract.captureURL) {
                    Label("Add", systemImage: "plus")
                        .labelStyle(.titleAndIcon)
                        .font(.caption.weight(.semibold))
                }
            }

            if entry.unavailable {
                emptyMessage(
                    entry.stale ? "Widget snapshot expired. Open the app to refresh." : "Open To-Do Tracker to load your tasks.",
                    action: "Open app",
                    url: WidgetContract.todayURL
                )
            } else if visibleTasks.isEmpty {
                emptyMessage("Nothing overdue or due today.", action: "Add a task", url: WidgetContract.captureURL)
            } else {
                VStack(alignment: .leading, spacing: family == .systemSmall ? 5 : 8) {
                    ForEach(visibleTasks) { line in
                        taskRow(line)
                    }
                }
            }

            Spacer(minLength: 0)

            if entry.pendingCount > 0 || omittedTaskCount > 0 {
                Link(destination: WidgetContract.todayURL) {
                    Label(syncAndMoreLabel, systemImage: entry.pendingCount > 0 ? "arrow.triangle.2.circlepath" : "ellipsis")
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                }
            } else if entry.stale {
                Link(destination: WidgetContract.todayURL) {
                    Label("Snapshot may be old · Open app", systemImage: "arrow.clockwise")
                        .font(.caption2)
                        .lineLimit(1)
                }
            } else if let generatedAt = entry.generatedAt {
                Text("Updated \(generatedAt, style: .time)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .containerBackground(.regularMaterial, for: .widget)
        .widgetURL(WidgetContract.todayURL)
    }

    @ViewBuilder
    private func taskRow(_ line: TaskLine) -> some View {
        HStack(alignment: .top, spacing: 7) {
            Button(intent: CompleteTaskIntent(taskID: line.task.id)) {
                Image(systemName: line.waitingToSync ? "checkmark.circle.fill" : "circle")
                    .font(.body)
                    .foregroundStyle(line.waitingToSync ? .orange : .secondary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .disabled(line.waitingToSync)
            .accessibilityLabel(line.waitingToSync ? "Waiting to sync completion" : "Complete \(line.task.title)")

            Link(destination: taskURL(for: line.task.id)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(line.task.title)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)
                    Text(line.waitingToSync ? "Waiting to sync" : line.overdue ? "Overdue" : "Due today")
                        .font(.caption2)
                        .foregroundStyle(line.waitingToSync ? .orange : line.overdue ? .red : .secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func emptyMessage(_ message: String, action: String, url: URL) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Link(action, destination: url)
                .font(.caption.weight(.semibold))
        }
    }

    private func taskURL(for taskID: String) -> URL {
        URL(string: "todotracker://task/\(taskID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? taskID)") ?? WidgetContract.todayURL
    }

    private var syncAndMoreLabel: String {
        switch (entry.pendingCount, omittedTaskCount) {
        case let (pending, more) where pending > 0 && more > 0:
            "\(pending) waiting · \(more) more"
        case let (pending, _) where pending > 0:
            "\(pending) waiting to sync · Open app"
        default:
            "\(omittedTaskCount) more · Open app"
        }
    }
}

struct ToDoTrackerMyTasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetContract.kind, provider: MyTasksProvider()) { entry in
            MyTasksWidgetView(entry: entry)
        }
        .configurationDisplayName("My Tasks")
        .description("See overdue tasks and tasks due today.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

@main
struct ToDoTrackerWidgetBundle: WidgetBundle {
    var body: some Widget {
        ToDoTrackerMyTasksWidget()
    }
}
