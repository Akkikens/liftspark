import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

/// The Watch side of a Liftspark workout. Runs an HKWorkoutSession (traditional strength training)
/// with a live builder, streams heart rate to the phone over WatchConnectivity, shows the phone's
/// current exercise and set, logs sets from
/// the wrist, and buzzes when rest is over. The Watch saves the one HKWorkout; the phone is told so
/// it doesn't save a second (message "saved").
final class WorkoutModel: NSObject, ObservableObject {
    static let shared = WorkoutModel()

    @Published var running = false
    @Published var bpm: Int?
    @Published var exercise = "Liftspark"
    @Published var setLabel = ""
    @Published var weight: Double = 20
    @Published var reps: Double = 8
    @Published var unit = "kg"
    @Published var restEnd: Date?
    @Published var startedAt: Date?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var restTimer: Timer?

    override init() {
        super.init()
        #if DEBUG
        // App Store screenshots (`-shots`): a set in progress, as the phone would send it.
        if ProcessInfo.processInfo.arguments.contains("-shots") {
            running = true
            exercise = "Barbell Full Squat"
            setLabel = "Set 3 of 4"
            weight = 195
            reps = 8
            unit = "lb"
            bpm = 148
            startedAt = Date().addingTimeInterval(-38 * 60)
            restEnd = ProcessInfo.processInfo.arguments.contains("-rest") ? Date().addingTimeInterval(95) : nil
            return
        }
        #endif
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
    }

    // MARK: workout session

    func requestAuth() {
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.heartRate)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
        store.requestAuthorization(toShare: share, read: read) { _, _ in }
    }

    func start(fromPhone: Bool = false) {
        guard !running else { return }
        let cfg = HKWorkoutConfiguration()
        cfg.activityType = .traditionalStrengthTraining
        cfg.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: cfg)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: cfg)
            s.delegate = self; b.delegate = self
            session = s; builder = b
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            DispatchQueue.main.async { self.running = true; self.startedAt = now }
            if !fromPhone { send(["type": "start", "at": now.timeIntervalSince1970 * 1000]) }
        } catch {
            send(["type": "error", "message": error.localizedDescription])
        }
    }

    func stop(fromPhone: Bool = false) {
        guard let s = session, let b = builder else { return }
        s.end()
        b.endCollection(withEnd: Date()) { [weak self] _, _ in
            b.finishWorkout { workout, _ in
                // The Watch's workout is the one in Health; the phone skips writing its own copy.
                self?.send(["type": "saved", "uuid": workout?.uuid.uuidString ?? "", "fromPhone": fromPhone])
            }
        }
        DispatchQueue.main.async { self.running = false; self.restEnd = nil; self.bpm = nil }
        session = nil; builder = nil
    }

    // MARK: sets and rest

    func logSet() {
        WKInterfaceDevice.current().play(.success)
        send(["type": "set", "weight": weight, "reps": Int(reps)])
    }

    private func startRest(until end: Date) {
        DispatchQueue.main.async {
            self.restEnd = end
            self.restTimer?.invalidate()
            self.restTimer = Timer.scheduledTimer(withTimeInterval: max(0, end.timeIntervalSinceNow), repeats: false) { [weak self] _ in
                WKInterfaceDevice.current().play(.notification)
                self?.restEnd = nil
            }
        }
    }

    // MARK: phone messages

    func send(_ msg: [String: Any]) {
        guard WCSession.default.activationState == .activated else { return }
        if WCSession.default.isReachable { WCSession.default.sendMessage(msg, replyHandler: nil) { _ in WCSession.default.transferUserInfo(msg) } }
        else if msg["type"] as? String != "hr" { WCSession.default.transferUserInfo(msg) }
    }

    fileprivate func handle(_ m: [String: Any]) {
        switch m["type"] as? String {
        case "start": start(fromPhone: true)
        case "stop": stop(fromPhone: true)
        case "state":
            DispatchQueue.main.async {
                self.exercise = m["exercise"] as? String ?? self.exercise
                self.setLabel = m["setLabel"] as? String ?? ""
                if let w = m["weight"] as? Double { self.weight = w }
                if let r = m["reps"] as? Double { self.reps = r }
                if let u = m["unit"] as? String { self.unit = u }
            }
            if let ms = m["restEnd"] as? Double, ms > Date().timeIntervalSince1970 * 1000 { startRest(until: Date(timeIntervalSince1970: ms / 1000)) }
            else { DispatchQueue.main.async { self.restEnd = nil; self.restTimer?.invalidate() } }
        default: break
        }
    }
}

extension WorkoutModel: HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    func workoutSession(_ s: HKWorkoutSession, didChangeTo to: HKWorkoutSessionState, from: HKWorkoutSessionState, date: Date) {}
    func workoutSession(_ s: HKWorkoutSession, didFailWithError error: Error) { send(["type": "error", "message": error.localizedDescription]) }
    func workoutBuilderDidCollectEvent(_ b: HKLiveWorkoutBuilder) {}
    func workoutBuilder(_ b: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        let hr = HKQuantityType(.heartRate)
        guard types.contains(hr), let q = b.statistics(for: hr)?.mostRecentQuantity() else { return }
        let v = Int(q.doubleValue(for: HKUnit.count().unitDivided(by: .minute())).rounded())
        DispatchQueue.main.async { self.bpm = v }
        send(["type": "hr", "bpm": v, "t": Date().timeIntervalSince1970 * 1000])
    }
}

extension WorkoutModel: WCSessionDelegate {
    func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    func session(_ s: WCSession, didReceiveMessage m: [String: Any]) { handle(m) }
    func session(_ s: WCSession, didReceiveUserInfo m: [String: Any] = [:]) { handle(m) }
    func session(_ s: WCSession, didReceiveApplicationContext m: [String: Any]) { handle(m) }
}
