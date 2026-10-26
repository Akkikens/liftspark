import Foundation
import Capacitor
import HealthKit
import UIKit

/**
 * Apple Health for Liftspark, under the same JS name and core methods as openGym's Android
 * Health Connect plugin ("HealthConnect": status / requestPermissions / write / remove /
 * openSettings), so lib/health-sync.js drives both. Extra methods cover what only Liftspark does:
 * today's activity, heart-rate history, live heart rate during a workout and dietary energy.
 *
 * Every record Liftspark writes carries HKMetadataKeyExternalUUID = the JS record id
 * ("opengym-w-<id>", "opengym-bw-<day>"), so writing it again replaces it and remove() finds it.
 * Workouts are written as HKWorkout objects; Strava's iOS app imports those from Health.
 */
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthConnect"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "today", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "heartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activeEnergy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveDietaryEnergy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLiveHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLiveHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importQuantity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importSleep", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private var liveQuery: HKAnchoredObjectQuery?
    private var session: AnyObject?   // HKWorkoutSession on iOS 26+, kept untyped for older targets
    private var builder: AnyObject?   // HKLiveWorkoutBuilder

    private var hrType: HKQuantityType { HKQuantityType(.heartRate) }
    private var activeType: HKQuantityType { HKQuantityType(.activeEnergyBurned) }
    private var basalType: HKQuantityType { HKQuantityType(.basalEnergyBurned) }
    private var stepsType: HKQuantityType { HKQuantityType(.stepCount) }
    private var massType: HKQuantityType { HKQuantityType(.bodyMass) }
    private var restingHrType: HKQuantityType { HKQuantityType(.restingHeartRate) }
    private var dietType: HKQuantityType { HKQuantityType(.dietaryEnergyConsumed) }
    private var hrvType: HKQuantityType { HKQuantityType(.heartRateVariabilitySDNN) }
    private var sleepType: HKCategoryType { HKCategoryType(.sleepAnalysis) }
    private let bpm = HKUnit.count().unitDivided(by: .minute())

    private var shareTypes: Set<HKSampleType> {
        [HKObjectType.workoutType(), activeType, massType, hrType, dietType]
    }
    private var readTypes: Set<HKObjectType> {
        // Only what a screen uses: live and post-workout heart rate, today's energy and steps, weight,
        // and for the importer and recovery, workouts, resting heart rate, HRV and sleep.
        [HKObjectType.workoutType(), hrType, activeType, basalType, stepsType, massType, restingHrType, hrvType, sleepType]
    }

    // MARK: openGym-compatible surface

    @objc func status(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["status": "unsupported", "granted": false]); return
        }
        let granted = store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
        call.resolve(["status": "available", "granted": granted])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["granted": false]); return }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { _, _ in
            let granted = self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
            call.resolve(["granted": granted])
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: "x-apple-health://"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            } else if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    /// { sessions: [{ id, start, end, type, title, notes, kcal?, hr?: [[ms, bpm]], strain? }],
    ///   weights: [{ id, time, kg }] }
    @objc func write(_ call: CAPPluginCall) {
        let sessions = call.getArray("sessions", JSObject.self) ?? []
        let weights = call.getArray("weights", JSObject.self) ?? []
        let ids = sessions.compactMap { $0["id"] as? String } + weights.compactMap { $0["id"] as? String }
        deleteExternal(ids) { [weak self] in
            guard let self else { return }
            let group = DispatchGroup()
            var failure: Error?
            var skipped: [String] = []
            for s in sessions {
                group.enter()
                self.overlapsOtherWorkout(s) { overlap in
                    if overlap { DispatchQueue.main.async { if let id = s["id"] as? String { skipped.append(id) }; group.leave() }; return }
                    self.saveWorkout(s) { err in if let err { failure = err }; group.leave() }
                }
            }
            for w in weights {
                guard let id = w["id"] as? String, let kg = (w["kg"] as? NSNumber)?.doubleValue,
                      let time = (w["time"] as? NSNumber)?.doubleValue else { continue }
                let date = Date(timeIntervalSince1970: time / 1000)
                let sample = HKQuantitySample(type: self.massType, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
                                              start: date, end: date, metadata: [HKMetadataKeyExternalUUID: id])
                group.enter()
                self.store.save(sample) { _, err in if let err { failure = err }; group.leave() }
            }
            group.notify(queue: .main) {
                if let failure { call.reject(failure.localizedDescription, "permission") } else { call.resolve(["skipped": skipped]) }
            }
        }
    }

    /// { sessions: [id], weights: [id] }
    @objc func remove(_ call: CAPPluginCall) {
        let ids = (call.getArray("sessions", String.self) ?? []) + (call.getArray("weights", String.self) ?? [])
        deleteExternal(ids) { call.resolve() }
    }

    // MARK: Liftspark extras

    /// Today's totals: { activeKcal, restingKcal, steps, weightKg?, weightAt?, restingHr? }
    @objc func today(_ call: CAPPluginCall) {
        let start = Calendar.current.startOfDay(for: Date())
        let group = DispatchGroup()
        var out: JSObject = [:]
        func sum(_ type: HKQuantityType, _ unit: HKUnit, _ key: String) {
            group.enter()
            let pred = HKQuery.predicateForSamples(withStart: start, end: Date())
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: pred, options: .cumulativeSum) { _, st, _ in
                if let v = st?.sumQuantity()?.doubleValue(for: unit) { out[key] = v }
                group.leave()
            }
            store.execute(q)
        }
        func latest(_ type: HKQuantityType, _ unit: HKUnit, _ key: String, _ atKey: String?) {
            group.enter()
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let q = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, s, _ in
                if let q = s?.first as? HKQuantitySample {
                    out[key] = q.quantity.doubleValue(for: unit)
                    if let atKey { out[atKey] = q.endDate.timeIntervalSince1970 * 1000 }
                }
                group.leave()
            }
            store.execute(q)
        }
        sum(activeType, .kilocalorie(), "activeKcal")
        sum(basalType, .kilocalorie(), "restingKcal")
        sum(stepsType, .count(), "steps")
        sum(dietType, .kilocalorie(), "eatenKcal")
        latest(massType, .gramUnit(with: .kilo), "weightKg", "weightAt")
        latest(restingHrType, bpm, "restingHr", nil)
        group.notify(queue: .main) { call.resolve(out) }
    }

    /// Heart-rate samples between two times: { samples: [[ms, bpm]] }
    @objc func heartRate(_ call: CAPPluginCall) {
        guard let s = call.getDouble("start"), let e = call.getDouble("end") else { call.reject("start and end are required"); return }
        let pred = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: s / 1000), end: Date(timeIntervalSince1970: e / 1000))
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let q = HKSampleQuery(sampleType: hrType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            let rows: [[Double]] = (samples as? [HKQuantitySample] ?? []).map {
                [$0.startDate.timeIntervalSince1970 * 1000, $0.quantity.doubleValue(for: self.bpm)]
            }
            call.resolve(["samples": rows])
        }
        store.execute(q)
    }

    /// Active energy burned between two times (an Apple Watch workout, a Garmin sync): { kcal }
    @objc func activeEnergy(_ call: CAPPluginCall) {
        guard let s = call.getDouble("start"), let e = call.getDouble("end") else { call.reject("start and end are required"); return }
        let pred = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: s / 1000), end: Date(timeIntervalSince1970: e / 1000))
        let q = HKStatisticsQuery(quantityType: activeType, quantitySamplePredicate: pred, options: .cumulativeSum) { _, st, _ in
            call.resolve(["kcal": st?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0])
        }
        store.execute(q)
    }

    /// Food eaten, written as dietary energy: { id, time, kcal }
    @objc func saveDietaryEnergy(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let kcal = call.getDouble("kcal"), let time = call.getDouble("time") else {
            call.reject("id, time and kcal are required"); return
        }
        deleteExternal([id]) {
            guard kcal > 0 else { call.resolve(); return }
            let d = Date(timeIntervalSince1970: time / 1000)
            let s = HKQuantitySample(type: self.dietType, quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                                     start: d, end: d, metadata: [HKMetadataKeyExternalUUID: id])
            self.store.save(s) { _, err in if let err { call.reject(err.localizedDescription) } else { call.resolve() } }
        }
    }

    /// Live heart rate during a workout. On iOS 26+ an iPhone workout session is started (the paired
    /// Apple Watch streams its sensor into it); on older systems, or when the session can't start, new
    /// heart-rate samples arriving in Health (a workout running on the watch) are forwarded as they land.
    /// Emits "heartRate" { bpm, t, source: "watch" }.
    ///
    /// The anchored query always runs: an iPhone workout session only receives heart rate from an
    /// external Bluetooth sensor, not from the Watch, so the session is opt-in ({ session: true }) and
    /// never the only path. The Watch's samples reach Health only while a workout runs on the Watch,
    /// which is why JS says so when they stay sparse.
    @objc func startLiveHeartRate(_ call: CAPPluginCall) {
        stopLive()
        startAnchored()
        if #available(iOS 26.0, *), call.getBool("session", false), startSession() {
            call.resolve(["mode": "session+samples"]); return
        }
        call.resolve(["mode": "samples"])
    }

    @objc func stopLiveHeartRate(_ call: CAPPluginCall) {
        stopLive()
        call.resolve()
    }


    // MARK: Import (history backfill)

    private func range(_ call: CAPPluginCall) -> (Date, Date)? {
        guard let s = call.getDouble("start"), let e = call.getDouble("end"), e > s else { return nil }
        return (Date(timeIntervalSince1970: s / 1000), Date(timeIntervalSince1970: e / 1000))
    }

    private static let dayFmt: DateFormatter = { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()

    /// Past workouts from other apps and devices: { workouts: [{ uuid, type, start, end, kcal, distanceM,
    /// avgHr, maxHr, source, sourceBundle }] }. Liftspark's own workouts are left out.
    @objc func importWorkouts(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { call.reject("start and end are required"); return }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, err in
            guard let self else { return }
            if let err { call.reject(err.localizedDescription); return }
            let mine = Bundle.main.bundleIdentifier ?? ""
            let list = (samples as? [HKWorkout] ?? []).filter {
                $0.sourceRevision.source.bundleIdentifier != mine && $0.metadata?[HKMetadataKeyExternalUUID] == nil
            }
            var out: [JSObject] = []
            for (i, w) in list.enumerated() {
                var o: JSObject = ["uuid": w.uuid.uuidString, "type": Self.typeName(w.workoutActivityType),
                                   "start": w.startDate.timeIntervalSince1970 * 1000, "end": w.endDate.timeIntervalSince1970 * 1000,
                                   "source": w.sourceRevision.source.name, "sourceBundle": w.sourceRevision.source.bundleIdentifier]
                if let k = w.statistics(for: self.activeType)?.sumQuantity()?.doubleValue(for: .kilocalorie()) { o["kcal"] = k }
                if let d = w.totalDistance?.doubleValue(for: .meter()) { o["distanceM"] = d }
                if let st = w.statistics(for: self.hrType) {
                    if let a = st.averageQuantity()?.doubleValue(for: self.bpm) { o["avgHr"] = a }
                    if let m = st.maximumQuantity()?.doubleValue(for: self.bpm) { o["maxHr"] = m }
                }
                out.append(o)
                if i % 50 == 0 { self.notifyListeners("importProgress", data: ["phase": "workouts", "done": i, "total": list.count]) }
            }
            call.resolve(["workouts": out])
        }
        store.execute(q)
    }

    /// Daily values of one quantity: { days: [{ d: "YYYY-MM-DD", v }] } — weight in kg (the day's
    /// average), resting heart rate and HRV (average), active energy and steps (sum).
    @objc func importQuantity(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { call.reject("start and end are required"); return }
        let kinds: [String: (HKQuantityType, HKUnit, HKStatisticsOptions)] = [
            "bodyMass": (massType, .gramUnit(with: .kilo), .discreteAverage),
            "restingHeartRate": (restingHrType, bpm, .discreteAverage),
            "heartRateVariabilitySDNN": (hrvType, .secondUnit(with: .milli), .discreteAverage),
            "activeEnergyBurned": (activeType, .kilocalorie(), .cumulativeSum),
            "stepCount": (stepsType, .count(), .cumulativeSum),
        ]
        guard let name = call.getString("type"), let (type, unit, opt) = kinds[name] else { call.reject("unknown type"); return }
        let cal = Calendar.current
        let anchor = cal.startOfDay(for: start)
        let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: end),
                                            options: opt, anchorDate: anchor, intervalComponents: DateComponents(day: 1))
        q.initialResultsHandler = { _, results, err in
            if let err { call.reject(err.localizedDescription); return }
            var days: [JSObject] = []
            results?.enumerateStatistics(from: anchor, to: end) { st, _ in
                let qty = opt == .cumulativeSum ? st.sumQuantity() : st.averageQuantity()
                guard let v = qty?.doubleValue(for: unit) else { return }
                days.append(["d": Self.dayFmt.string(from: st.startDate), "v": v])
            }
            call.resolve(["days": days])
        }
        store.execute(q)
    }

    /// Nights of sleep, by the day you woke up: { nights: [{ d, asleepMin, inBedMin, start, end }] }.
    @objc func importSleep(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { call.reject("start and end are required"); return }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end)
        let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, err in
            if let err { call.reject(err.localizedDescription); return }
            var by: [String: (asleep: Double, inBed: Double, s: Date, e: Date)] = [:]
            for x in (samples as? [HKCategorySample] ?? []) {
                let d = Self.dayFmt.string(from: x.endDate)
                let mins = x.endDate.timeIntervalSince(x.startDate) / 60
                var r = by[d] ?? (0, 0, x.startDate, x.endDate)
                if x.value == HKCategoryValueSleepAnalysis.inBed.rawValue { r.inBed += mins }
                else if x.value != HKCategoryValueSleepAnalysis.awake.rawValue { r.asleep += mins }
                r.s = min(r.s, x.startDate); r.e = max(r.e, x.endDate)
                by[d] = r
            }
            let nights: [JSObject] = by.keys.sorted().map { d in
                let r = by[d]!
                return ["d": d, "asleepMin": Int(r.asleep.rounded()), "inBedMin": Int(max(r.inBed, r.asleep).rounded()),
                        "start": r.s.timeIntervalSince1970 * 1000, "end": r.e.timeIntervalSince1970 * 1000]
            }
            call.resolve(["nights": nights])
        }
        store.execute(q)
    }

    private static func typeName(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .traditionalStrengthTraining: return "traditionalStrengthTraining"
        case .functionalStrengthTraining: return "functionalStrengthTraining"
        case .coreTraining: return "coreTraining"
        case .crossTraining: return "crossTraining"
        case .highIntensityIntervalTraining: return "hiit"
        case .running: return "running"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .stairClimbing, .stairs: return "stairs"
        case .yoga: return "yoga"
        case .pilates: return "pilates"
        case .mixedCardio: return "mixedCardio"
        case .soccer: return "soccer"
        case .basketball: return "basketball"
        case .tennis: return "tennis"
        case .boxing, .kickboxing, .martialArts: return "combat"
        case .dance, .cardioDance, .socialDance: return "dance"
        case .flexibility, .cooldown: return "mobility"
        default: return "other"
        }
    }

    // MARK: internals

    private func startAnchored() {
        let pred = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-120), end: nil)
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, _, _, _ in
            guard let self, let list = samples as? [HKQuantitySample], !list.isEmpty else { return }
            // Every sample goes into the native buffer (they arrive in batches after the phone unlocks);
            // the newest is also sent live.
            for x in list { HRBuffer.shared.add(x.endDate.timeIntervalSince1970 * 1000, x.quantity.doubleValue(for: self.bpm), "watch") }
            guard let last = list.max(by: { $0.endDate < $1.endDate }) else { return }
            self.notifyListeners("heartRate", data: ["bpm": last.quantity.doubleValue(for: self.bpm),
                                                    "t": last.endDate.timeIntervalSince1970 * 1000, "source": "watch"])
        }
        let q = HKAnchoredObjectQuery(type: hrType, predicate: pred, anchor: nil, limit: HKObjectQueryNoLimit, resultsHandler: handler)
        q.updateHandler = handler
        liveQuery = q
        store.execute(q)
    }

    @available(iOS 26.0, *)
    private func startSession() -> Bool {
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        config.locationType = .indoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            let relay = LiveRelay { [weak self] value, date in
                self?.notifyListeners("heartRate", data: ["bpm": value, "t": date.timeIntervalSince1970 * 1000, "source": "watch"])
            }
            b.delegate = relay
            objc_setAssociatedObject(b, &LiveRelay.key, relay, .OBJC_ASSOCIATION_RETAIN)
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            session = s; builder = b
            return true
        } catch {
            return false
        }
    }

    private func stopLive() {
        if let q = liveQuery { store.stop(q); liveQuery = nil }
        if #available(iOS 26.0, *), let s = session as? HKWorkoutSession, let b = builder as? HKLiveWorkoutBuilder {
            if s.state != .ended && s.state != .stopped { s.end() }
            // Liftspark writes the workout itself (write(), with sets in the notes); the live
            // builder only streamed heart rate, so its own copy is thrown away.
            b.endCollection(withEnd: Date()) { _, _ in b.discardWorkout() }
        }
        session = nil; builder = nil
    }

    private func deleteExternal(_ ids: [String], done: @escaping () -> Void) {
        guard !ids.isEmpty else { done(); return }
        let pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: ids)
        let types: [HKObjectType] = [HKObjectType.workoutType(), massType, dietType]
        let group = DispatchGroup()
        for type in types {
            group.enter()
            store.deleteObjects(of: type, predicate: pred) { _, _, _ in group.leave() }
        }
        group.notify(queue: .global(), execute: done)
    }

    /// True when another app's workout (an Apple Watch or Garmin recording of the same session)
    /// already covers at least half of this one, so Health doesn't count the session twice.
    private func overlapsOtherWorkout(_ s: JSObject, done: @escaping (Bool) -> Void) {
        guard let startMs = (s["start"] as? NSNumber)?.doubleValue, let endMs = (s["end"] as? NSNumber)?.doubleValue, endMs > startMs else { done(false); return }
        let start = Date(timeIntervalSince1970: startMs / 1000), end = Date(timeIntervalSince1970: endMs / 1000)
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: 20, sortDescriptors: nil) { _, samples, _ in
            let mine = Bundle.main.bundleIdentifier ?? ""
            let covered = (samples ?? []).filter { $0.sourceRevision.source.bundleIdentifier != mine }.map {
                max(0, min($0.endDate, end).timeIntervalSince(max($0.startDate, start)))
            }.max() ?? 0
            done(covered >= end.timeIntervalSince(start) * 0.5)
        }
        store.execute(q)
    }

    private func saveWorkout(_ s: JSObject, done: @escaping (Error?) -> Void) {
        guard let id = s["id"] as? String, let startMs = (s["start"] as? NSNumber)?.doubleValue,
              let endMs = (s["end"] as? NSNumber)?.doubleValue, endMs > startMs else { done(nil); return }
        let start = Date(timeIntervalSince1970: startMs / 1000), end = Date(timeIntervalSince1970: endMs / 1000)
        let config = HKWorkoutConfiguration()
        config.activityType = activity(s["type"] as? String)
        config.locationType = .indoor
        var meta: [String: Any] = [HKMetadataKeyExternalUUID: id, HKMetadataKeyIndoorWorkout: true]
        if let title = s["title"] as? String, !title.isEmpty { meta[HKMetadataKeyWorkoutBrandName] = "Liftspark"; meta["LiftsparkTitle"] = title }
        if let strain = (s["strain"] as? NSNumber)?.doubleValue { meta["LiftsparkStrain"] = strain }
        if let notes = s["notes"] as? String, !notes.isEmpty { meta["LiftsparkNotes"] = String(notes.prefix(900)) }

        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
        builder.beginCollection(withStart: start) { [weak self] ok, err in
            guard let self, ok else { done(err); return }
            var samples: [HKSample] = []
            if let kcal = (s["kcal"] as? NSNumber)?.doubleValue, kcal > 0 {
                samples.append(HKQuantitySample(type: self.activeType, quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                                                start: start, end: end))
            }
            for row in (s["hr"] as? [Any]) ?? [] {
                guard let pair = row as? [Any], pair.count >= 2,
                      let t = (pair[0] as? NSNumber)?.doubleValue, let v = (pair[1] as? NSNumber)?.doubleValue, v > 25 else { continue }
                let d = Date(timeIntervalSince1970: t / 1000)
                guard d >= start, d <= end else { continue }
                samples.append(HKQuantitySample(type: self.hrType, quantity: HKQuantity(unit: self.bpm, doubleValue: v), start: d, end: d))
            }
            let finish = {
                builder.addMetadata(meta) { _, _ in
                    builder.endCollection(withEnd: end) { _, err in
                        if let err { done(err); return }
                        builder.finishWorkout { _, err in done(err) }
                    }
                }
            }
            if samples.isEmpty { finish() } else { builder.add(samples) { _, _ in finish() } }
        }
    }

    private func activity(_ type: String?) -> HKWorkoutActivityType {
        switch type {
        case "walking": return .walking
        case "running": return .running
        case "biking_stationary": return .cycling
        case "elliptical": return .elliptical
        case "stair_climbing_machine": return .stairClimbing
        case "other_workout": return .mixedCardio
        default: return .traditionalStrengthTraining
        }
    }
}

/// Forwards the live builder's heart-rate statistics to JS.
@available(iOS 26.0, *)
final class LiveRelay: NSObject, HKLiveWorkoutBuilderDelegate {
    static var key = 0
    let emit: (Double, Date) -> Void
    init(emit: @escaping (Double, Date) -> Void) { self.emit = emit }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let hr = HKQuantityType(.heartRate)
        guard collectedTypes.contains(hr), let st = workoutBuilder.statistics(for: hr),
              let q = st.mostRecentQuantity() else { return }
        emit(q.doubleValue(for: HKUnit.count().unitDivided(by: .minute())), st.mostRecentQuantityDateInterval()?.end ?? Date())
    }
}
