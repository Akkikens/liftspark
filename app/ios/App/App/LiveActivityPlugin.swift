import Foundation
import Capacitor
import ActivityKit
import WidgetKit

/**
 * Live Activity (lock screen + Dynamic Island) for a running workout, and the home-screen widget's
 * data. JS name "LiveActivity":
 *   start({ name, exercise, setLabel, restEnd?, bpm?, zone?, startedAt })
 *   update({ exercise, setLabel, restEnd?, bpm?, zone? })   — restEnd in ms; null clears the rest
 *   end()
 *   widget({ streakWeeks, lastStrain?, kcalLeft?, nextWorkout? })
 */
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widget", returnType: CAPPluginReturnPromise),
    ]

    private var activity: Activity<WorkoutActivityAttributes>?
    private var started = Date()

    private func state(_ call: CAPPluginCall) -> WorkoutActivityAttributes.ContentState {
        let rest = call.getDouble("restEnd").map { Date(timeIntervalSince1970: $0 / 1000) }
        return .init(exercise: call.getString("exercise") ?? "Workout", setLabel: call.getString("setLabel") ?? "",
                     restEnd: rest, bpm: call.getInt("bpm"), zone: call.getInt("zone"), startedAt: started)
    }

    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["started": false]); return }
        started = call.getDouble("startedAt").map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        // One workout at a time: an activity left from a crash is ended first.
        for a in Activity<WorkoutActivityAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } }
        do {
            activity = try Activity.request(attributes: WorkoutActivityAttributes(workoutName: call.getString("name") ?? "Workout"),
                                            content: .init(state: state(call), staleDate: nil))
            call.resolve(["started": true])
        } catch {
            call.resolve(["started": false, "error": error.localizedDescription])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let a = activity ?? Activity<WorkoutActivityAttributes>.activities.first else { call.resolve(); return }
        activity = a
        let s = state(call)
        Task { await a.update(.init(state: s, staleDate: nil)); call.resolve() }
    }

    @objc func end(_ call: CAPPluginCall) {
        let all = Activity<WorkoutActivityAttributes>.activities
        activity = nil
        Task { for a in all { await a.end(nil, dismissalPolicy: .immediate) }; call.resolve() }
    }

    @objc func widget(_ call: CAPPluginCall) {
        WidgetStore.write(.init(streakWeeks: call.getInt("streakWeeks") ?? 0, lastStrain: call.getDouble("lastStrain"),
                                kcalLeft: call.getInt("kcalLeft"), nextWorkout: call.getString("nextWorkout"), updated: Date()))
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
