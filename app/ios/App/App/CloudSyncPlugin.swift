import Foundation
import Capacitor
import CloudKit

/**
 * iCloud sync of Liftspark's own data (workouts, plans, weigh-ins, food, settings) through the
 * user's private CloudKit database — never HealthKit samples. JS name "CloudSync"; lib/ls-icloud.js
 * decides what changed and resolves conflicts (last writer wins, per record, by updatedAt).
 *
 *   status()                      → { available, status }
 *   push({ records: [{ id, kind, updatedAt, json }], deletes: [id] })
 *   pull()                        → { records: [...], deletes: [id], more } — changes since the last pull
 *   reset()                       → forgets the change token, so the next pull fetches everything
 */
@objc(CloudSyncPlugin)
public class CloudSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudSyncPlugin"
    public let jsName = "CloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "push", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pull", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
    ]

    private static let containerId = "iCloud.com.akkikens.liftspark"
    private static let tokenKey = "liftspark.icloud.token"
    private let zone = CKRecordZone(zoneName: "Liftspark")
    private var zoneReady = false
    private lazy var db = CKContainer(identifier: Self.containerId).privateCloudDatabase

    @objc func status(_ call: CAPPluginCall) {
        CKContainer(identifier: Self.containerId).accountStatus { st, err in
            let name: String
            switch st {
            case .available: name = "available"
            case .noAccount: name = "noAccount"
            case .restricted: name = "restricted"
            case .temporarilyUnavailable: name = "temporarilyUnavailable"
            default: name = "unknown"
            }
            call.resolve(["available": st == .available, "status": name, "error": err?.localizedDescription as Any])
        }
    }

    private func ensureZone(_ done: @escaping (Error?) -> Void) {
        if zoneReady { done(nil); return }
        let op = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)
        op.modifyRecordZonesResultBlock = { [weak self] r in
            if case .failure(let e) = r { done(e) } else { self?.zoneReady = true; done(nil) }
        }
        db.add(op)
    }

    @objc func push(_ call: CAPPluginCall) {
        let recs = call.getArray("records", JSObject.self) ?? []
        let dels = call.getArray("deletes", String.self) ?? []
        ensureZone { [weak self] err in
            guard let self else { return }
            if let err { call.reject(err.localizedDescription); return }
            let records: [CKRecord] = recs.compactMap { r in
                guard let id = r["id"] as? String, let json = r["json"] as? String else { return nil }
                let rec = CKRecord(recordType: "Item", recordID: CKRecord.ID(recordName: id, zoneID: self.zone.zoneID))
                rec["kind"] = (r["kind"] as? String ?? "item") as CKRecordValue
                rec["updatedAt"] = ((r["updatedAt"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 * 1000) as CKRecordValue
                rec["json"] = json as CKRecordValue
                return rec
            }
            let ids = dels.map { CKRecord.ID(recordName: $0, zoneID: self.zone.zoneID) }
            // Batches of 300, CloudKit's limit per operation.
            let batches = stride(from: 0, to: max(records.count, ids.count, 1), by: 300).map { i in
                (Array(records[min(i, records.count)..<min(i + 300, records.count)]), Array(ids[min(i, ids.count)..<min(i + 300, ids.count)]))
            }
            var failure: Error?
            let group = DispatchGroup()
            for (save, del) in batches where !save.isEmpty || !del.isEmpty {
                group.enter()
                let op = CKModifyRecordsOperation(recordsToSave: save, recordIDsToDelete: del)
                op.savePolicy = .allKeys        // last writer wins; JS only pushes what is newer
                op.modifyRecordsResultBlock = { r in if case .failure(let e) = r { failure = e }; group.leave() }
                self.db.add(op)
            }
            group.notify(queue: .main) {
                if let failure { call.reject(failure.localizedDescription) } else { call.resolve(["saved": records.count, "deleted": ids.count]) }
            }
        }
    }

    @objc func pull(_ call: CAPPluginCall) {
        ensureZone { [weak self] err in
            guard let self else { return }
            if let err { call.reject(err.localizedDescription); return }
            var token: CKServerChangeToken?
            if let d = UserDefaults.standard.data(forKey: Self.tokenKey) {
                token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: d)
            }
            let cfg = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
            cfg.previousServerChangeToken = token
            let op = CKFetchRecordZoneChangesOperation(recordZoneIDs: [self.zone.zoneID], configurationsByRecordZoneID: [self.zone.zoneID: cfg])
            var out: [JSObject] = [], deletes: [String] = [], more = false
            op.recordWasChangedBlock = { _, r in
                if case .success(let rec) = r, let json = rec["json"] as? String {
                    out.append(["id": rec.recordID.recordName, "kind": rec["kind"] as? String ?? "item",
                                "updatedAt": rec["updatedAt"] as? Double ?? 0, "json": json])
                }
            }
            op.recordWithIDWasDeletedBlock = { id, _ in deletes.append(id.recordName) }
            op.recordZoneFetchResultBlock = { _, r in
                if case .success(let z) = r {
                    more = z.moreComing
                    if let d = try? NSKeyedArchiver.archivedData(withRootObject: z.serverChangeToken, requiringSecureCoding: true) {
                        UserDefaults.standard.set(d, forKey: Self.tokenKey)
                    }
                } else if case .failure(let e) = r, (e as? CKError)?.code == .changeTokenExpired {
                    UserDefaults.standard.removeObject(forKey: Self.tokenKey)
                    more = true
                }
            }
            op.fetchRecordZoneChangesResultBlock = { r in
                if case .failure(let e) = r { call.reject(e.localizedDescription); return }
                call.resolve(["records": out, "deletes": deletes, "more": more])
            }
            self.db.add(op)
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        call.resolve()
    }
}
