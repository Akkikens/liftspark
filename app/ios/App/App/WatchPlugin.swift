import Foundation
import Capacitor
import WatchConnectivity

/**
 * The phone's side of the Apple Watch app. JS name "LiftsparkWatch".
 *   status()                → { supported, paired, installed, reachable }
 *   start() / stop()        → starts or ends the Watch's workout session
 *   state({ exercise, setLabel, weight, reps, unit, restEnd })   → what the Watch shows
 * Events: "hr" { bpm, t }, "set" { weight, reps }, "start" { at }, "saved" { uuid }, "error" { message }
 */
@objc(WatchPlugin)
public class WatchPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchPlugin"
    public let jsName = "LiftsparkWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
    }

    private func send(_ msg: [String: Any]) {
        let s = WCSession.default
        guard WCSession.isSupported(), s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        if s.isReachable { s.sendMessage(msg, replyHandler: nil) { _ in s.transferUserInfo(msg) } }
        else if msg["type"] as? String == "state" { try? s.updateApplicationContext(msg) }
        else { s.transferUserInfo(msg) }
    }

    @objc func status(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(["supported": false]); return }
        let s = WCSession.default
        call.resolve(["supported": true, "paired": s.isPaired, "installed": s.isWatchAppInstalled, "reachable": s.isReachable])
    }

    @objc func start(_ call: CAPPluginCall) { send(["type": "start"]); call.resolve() }
    @objc func stop(_ call: CAPPluginCall) { send(["type": "stop"]); call.resolve() }

    @objc func state(_ call: CAPPluginCall) {
        var m: [String: Any] = ["type": "state"]
        for k in ["exercise", "setLabel", "unit"] { if let v = call.getString(k) { m[k] = v } }
        for k in ["weight", "reps", "restEnd"] { if let v = call.getDouble(k) { m[k] = v } }
        send(m)
        call.resolve()
    }

    private func forward(_ m: [String: Any]) {
        guard let type = m["type"] as? String else { return }
        var data = m; data.removeValue(forKey: "type")
        DispatchQueue.main.async { self.notifyListeners(type, data: data) }
    }

    public func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    public func sessionDidBecomeInactive(_ s: WCSession) {}
    public func sessionDidDeactivate(_ s: WCSession) { WCSession.default.activate() }
    public func session(_ s: WCSession, didReceiveMessage m: [String: Any]) { forward(m) }
    public func session(_ s: WCSession, didReceiveUserInfo m: [String: Any] = [:]) { forward(m) }
}
