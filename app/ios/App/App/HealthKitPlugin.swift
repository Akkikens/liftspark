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
public class HealthKitPlugin: CAPPlugin {
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
    private let bpm = HKUnit.count().unitDivided(by: .minute())

    private var shareTypes: Set<HKSampleType> {
        [HKObjectType.workoutType(), activeType, massType, hrType, dietType]
    }
    private var readTypes: Set<HKObjectType> {
        [HKObjectType.workoutType(), hrType, activeType, basalType, stepsType, massType, restingHrType, dietType]
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
            for s in sessions {
                group.enter()
                self.saveWorkout(s) { err in if let err { failure = err }; group.leave() }
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
                if let failure { call.reject(failure.localizedDescription, "permission") } else { call.resolve() }
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
    @objc func startLiveHeartRate(_ call: CAPPluginCall) {
        stopLive()
        if #available(iOS 26.0, *), call.getBool("session", true) {
            if startSession() { call.resolve(["mode": "session"]); return }
        }
        startAnchored()
        call.resolve(["mode": "samples"])
    }

    @objc func stopLiveHeartRate(_ call: CAPPluginCall) {
        stopLive()
        call.resolve()
    }

    // MARK: internals

    private func startAnchored() {
        let pred = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-120), end: nil)
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, _, _, _ in
            guard let self, let last = (samples as? [HKQuantitySample])?.max(by: { $0.endDate < $1.endDate }) else { return }
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
            s.end()
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
