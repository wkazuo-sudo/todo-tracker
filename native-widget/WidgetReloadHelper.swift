import Foundation
import WidgetKit

@main
struct ToDoTrackerWidgetReloadHelper {
    static func main() {
        guard CommandLine.arguments.count == 2,
              CommandLine.arguments[1] == "reload" else {
            fputs("Expected the reload action.\n", stderr)
            exit(64)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "com.kazuo.todotracker.my-tasks")
    }
}
