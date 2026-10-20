import Foundation
import Capacitor
import CoreBluetooth

/**
 * Live heart rate from any Bluetooth LE sensor that speaks the standard Heart Rate Service
 * (GATT 0x180D, measurement characteristic 0x2A37): chest straps (Polar, Wahoo, Garmin HRM),
 * WHOOP with "Broadcast Heart Rate" on, a Garmin watch with "Broadcast Heart Rate", and others.
 *
 * JS name "HeartRateBLE". The last device is remembered and reconnected automatically, also after
 * it drops out of range, and with the bluetooth-central background mode while the app is in the
 * background mid-workout.
 *
 * Methods: scan(), stopScan(), connect({ id }), disconnect(), forget(), status()
 * Events:  "device" { id, name, rssi }   (during a scan)
 *          "heartRate" { bpm, rr: [ms], contact, t, source: "ble" }
 *          "state" { state: "off" | "unauthorized" | "idle" | "scanning" | "connecting" | "connected", id?, name?, battery? }
 */
@objc(HeartRateBLEPlugin)
public class HeartRateBLEPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "HeartRateBLEPlugin"
    public let jsName = "HeartRateBLE"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    private static let hrService = CBUUID(string: "180D")
    private static let hrMeasurement = CBUUID(string: "2A37")
    private static let batteryService = CBUUID(string: "180F")
    private static let batteryLevel = CBUUID(string: "2A19")
    private static let savedKey = "liftspark.hr.device"
    private static let savedNameKey = "liftspark.hr.deviceName"

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var found: [UUID: CBPeripheral] = [:]
    private var state = "idle"
    private var battery: Int?
    private var wantScan = false

    public override func load() {
        central = CBCentralManager(delegate: self, queue: .main,
                                   options: [CBCentralManagerOptionRestoreIdentifierKey: "liftspark.hr",
                                             CBCentralManagerOptionShowPowerAlertKey: false])
    }

    // MARK: JS methods

    @objc func scan(_ call: CAPPluginCall) {
        wantScan = true
        startScanIfReady()
        call.resolve()
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        wantScan = false
        central?.stopScan()
        if state == "scanning" { setState(peripheral == nil ? "idle" : "connecting") }
        call.resolve()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let idStr = call.getString("id"), let id = UUID(uuidString: idStr) else { call.reject("id is required"); return }
        guard let c = central else { call.reject("Bluetooth is not ready"); return }
        let p = found[id] ?? c.retrievePeripherals(withIdentifiers: [id]).first
        guard let p else { call.reject("Device not found. Scan again.") ; return }
        wantScan = false
        c.stopScan()
        UserDefaults.standard.set(idStr, forKey: Self.savedKey)
        UserDefaults.standard.set(p.name ?? "Heart-rate sensor", forKey: Self.savedNameKey)
        attach(p)
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil
        setState("idle")
        call.resolve()
    }

    @objc func forget(_ call: CAPPluginCall) {
        if let p = peripheral { central?.cancelPeripheralConnection(p) }
        peripheral = nil
        UserDefaults.standard.removeObject(forKey: Self.savedKey)
        UserDefaults.standard.removeObject(forKey: Self.savedNameKey)
        setState("idle")
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(statusObject())
    }

    // MARK: CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if state == "off" || state == "unauthorized" { setState("idle") }
            reconnectSaved()
            startScanIfReady()
        case .unauthorized: setState("unauthorized")
        default: setState("off")
        }
    }

    public func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        if let ps = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral], let p = ps.first {
            peripheral = p
            p.delegate = self
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        found[peripheral.identifier] = peripheral
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "Heart-rate sensor"
        notifyListeners("device", data: ["id": peripheral.identifier.uuidString, "name": name, "rssi": RSSI.intValue])
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([Self.hrService, Self.batteryService])
        setState("connected")
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        retryLater(peripheral)
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        // Out of range, the strap taken off, the watch's broadcast ended: keep trying while it is still
        // the chosen device. A pending connect has no timeout and completes when it comes back.
        if self.peripheral?.identifier == peripheral.identifier { retryLater(peripheral) }
    }

    // MARK: CBPeripheralDelegate

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for s in peripheral.services ?? [] {
            if s.uuid == Self.hrService { peripheral.discoverCharacteristics([Self.hrMeasurement], for: s) }
            if s.uuid == Self.batteryService { peripheral.discoverCharacteristics([Self.batteryLevel], for: s) }
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for c in service.characteristics ?? [] {
            if c.uuid == Self.hrMeasurement { peripheral.setNotifyValue(true, for: c) }
            if c.uuid == Self.batteryLevel { peripheral.readValue(for: c) }
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value, !data.isEmpty else { return }
        if characteristic.uuid == Self.batteryLevel {
            battery = Int(data[0])
            notifyListeners("state", data: statusObject())
            return
        }
        guard characteristic.uuid == Self.hrMeasurement, let m = Self.parse(data) else { return }
        notifyListeners("heartRate", data: ["bpm": m.bpm, "rr": m.rr, "contact": m.contact,
                                            "t": Date().timeIntervalSince1970 * 1000, "source": "ble"])
    }

    // MARK: helpers

    /// Heart Rate Measurement (Bluetooth SIG 0x2A37): flags, HR as UInt8 or UInt16, optional energy
    /// expended, optional RR intervals in 1/1024 s.
    static func parse(_ data: Data) -> (bpm: Int, rr: [Double], contact: Bool)? {
        let b = [UInt8](data)
        guard !b.isEmpty else { return nil }
        let flags = b[0]
        var i = 1
        let wide = flags & 0x01 != 0
        guard b.count >= i + (wide ? 2 : 1) else { return nil }
        let bpm = wide ? Int(UInt16(b[i]) | UInt16(b[i + 1]) << 8) : Int(b[i])
        i += wide ? 2 : 1
        let contactSupported = flags & 0x04 != 0
        let contact = contactSupported ? (flags & 0x02 != 0) : true
        if flags & 0x08 != 0 { i += 2 }
        var rr: [Double] = []
        if flags & 0x10 != 0 {
            while i + 1 < b.count {
                let v = UInt16(b[i]) | UInt16(b[i + 1]) << 8
                rr.append(Double(v) / 1024.0 * 1000.0)
                i += 2
            }
        }
        return bpm > 0 ? (bpm, rr, contact) : nil
    }

    private func attach(_ p: CBPeripheral) {
        peripheral = p
        p.delegate = self
        setState("connecting")
        central?.connect(p, options: nil)
    }

    private func reconnectSaved() {
        guard peripheral == nil || peripheral?.state == .disconnected,
              let idStr = UserDefaults.standard.string(forKey: Self.savedKey), let id = UUID(uuidString: idStr),
              let c = central, let p = c.retrievePeripherals(withIdentifiers: [id]).first else {
            if let p = peripheral, p.state == .disconnected { attach(p) }
            return
        }
        attach(p)
    }

    private func retryLater(_ p: CBPeripheral) {
        setState("connecting")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self, self.peripheral?.identifier == p.identifier, self.central?.state == .poweredOn else { return }
            self.central?.connect(p, options: nil)
        }
    }

    private func startScanIfReady() {
        guard wantScan, let c = central, c.state == .poweredOn else { return }
        found = [:]
        c.scanForPeripherals(withServices: [Self.hrService], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        // Already-connected sensors (a strap another app holds) don't advertise; list them too.
        for p in c.retrieveConnectedPeripherals(withServices: [Self.hrService]) {
            found[p.identifier] = p
            notifyListeners("device", data: ["id": p.identifier.uuidString, "name": p.name ?? "Heart-rate sensor", "rssi": 0])
        }
        setState("scanning")
    }

    private func setState(_ s: String) {
        state = s
        notifyListeners("state", data: statusObject())
    }

    private func statusObject() -> JSObject {
        var o: JSObject = ["state": state]
        if let id = UserDefaults.standard.string(forKey: Self.savedKey) { o["id"] = id }
        if let n = UserDefaults.standard.string(forKey: Self.savedNameKey) { o["name"] = n }
        if let battery { o["battery"] = battery }
        return o
    }
}
