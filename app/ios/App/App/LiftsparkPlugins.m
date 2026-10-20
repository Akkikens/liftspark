#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers Liftspark's Swift plugins with Capacitor's Objective-C plugin registry.

CAP_PLUGIN(HealthKitPlugin, "HealthConnect",
           CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(write, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(remove, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(today, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(heartRate, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(activeEnergy, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(saveDietaryEnergy, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startLiveHeartRate, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopLiveHeartRate, CAPPluginReturnPromise);
)

CAP_PLUGIN(HeartRateBLEPlugin, "HeartRateBLE",
           CAP_PLUGIN_METHOD(scan, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopScan, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(connect, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(forget, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
)

CAP_PLUGIN(WebAuthPlugin, "WebAuth",
           CAP_PLUGIN_METHOD(authenticate, CAPPluginReturnPromise);
)

CAP_PLUGIN(ScannerPlugin, "Scanner",
           CAP_PLUGIN_METHOD(scan, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(readImage, CAPPluginReturnPromise);
)
