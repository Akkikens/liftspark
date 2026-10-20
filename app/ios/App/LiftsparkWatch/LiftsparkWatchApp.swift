import SwiftUI

@main
struct LiftsparkWatchApp: App {
    @StateObject private var model = WorkoutModel.shared
    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(model)
        }
    }
}
