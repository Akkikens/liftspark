import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// The Live Activity for a running workout: lock screen and Dynamic Island. Shared by the app (which
/// starts and updates it through LiveActivityPlugin) and the widget extension (which draws it).
public struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var exercise: String
        public var setLabel: String          // "Set 2 of 4"
        public var restEnd: Date?            // counting down while resting
        public var bpm: Int?
        public var zone: Int?                // 1–5
        public var startedAt: Date

        public init(exercise: String, setLabel: String, restEnd: Date?, bpm: Int?, zone: Int?, startedAt: Date) {
            self.exercise = exercise; self.setLabel = setLabel; self.restEnd = restEnd
            self.bpm = bpm; self.zone = zone; self.startedAt = startedAt
        }
    }
    public var workoutName: String
    public init(workoutName: String) { self.workoutName = workoutName }
}
#endif

/// What the home-screen widget shows, written by the app into the shared App Group.
public enum WidgetStore {
    public static let group = "group.com.akkikens.liftspark"
    public static let key = "liftspark.widget"

    public struct Snapshot: Codable {
        public var streakWeeks: Int
        public var lastStrain: Double?
        public var kcalLeft: Int?
        public var nextWorkout: String?
        public var updated: Date
    }

    public static func read() -> Snapshot? {
        guard let d = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: d)
    }

    public static func write(_ s: Snapshot) {
        guard let d = try? JSONEncoder().encode(s) else { return }
        UserDefaults(suiteName: group)?.set(d, forKey: key)
    }
}
