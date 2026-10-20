import UIKit
import Capacitor

// Capacitor 7 registers only the plugin classes named in capacitor.config.json's packageClassList,
// which `cap sync` regenerates from npm packages. Plugins that live in the app target itself are
// never on it, so without this they stay unregistered and every JS call fails with "not implemented".
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(HeartRateBLEPlugin())
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(ScannerPlugin())
        bridge?.registerPluginInstance(PrintPlugin())
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(CloudSyncPlugin())
        bridge?.registerPluginInstance(WatchPlugin())
    }
}
