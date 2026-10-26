import SwiftUI

private let spark = LinearGradient(colors: [Color(red: 1, green: 0.416, blue: 0.169), Color(red: 1, green: 0.184, blue: 0.49)], startPoint: .topLeading, endPoint: .bottomTrailing)

struct ContentView: View {
    @EnvironmentObject var m: WorkoutModel
    var body: some View {
        if m.running { WorkoutView() } else { StartView() }
    }
}

struct StartView: View {
    @EnvironmentObject var m: WorkoutModel
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "bolt.fill").font(.title).foregroundStyle(spark)
            Text("Liftspark").font(.headline)
            Button { m.start() } label: { Text("Start workout").bold().frame(maxWidth: .infinity) }
                .tint(Color(red: 1, green: 0.3, blue: 0.35))
            Text("Or start on your iPhone; it shows up here.").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .onAppear { m.requestAuth() }
    }
}

struct WorkoutView: View {
    @EnvironmentObject var m: WorkoutModel
    @State private var editingWeight = true
    var body: some View {
        TabView {
            // Page 1: the set — exercise, weight/reps on the crown, log it.
            VStack(spacing: 4) {
                Text(m.exercise).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
                Text(m.setLabel).font(.caption2).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    value(m.weight.formatted(.number.precision(.fractionLength(0...1))), m.unit, editingWeight) { editingWeight = true }
                    value("\(Int(m.reps))", "reps", !editingWeight) { editingWeight = false }
                }
                .focusable()
                .digitalCrownRotation(editingWeight ? $m.weight : $m.reps, from: 0, through: editingWeight ? 500 : 100,
                                      by: editingWeight ? 2.5 : 1, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
                Button { m.logSet() } label: { Label("Done", systemImage: "checkmark").bold().frame(maxWidth: .infinity) }
                    .tint(Color(red: 1, green: 0.3, blue: 0.35))
            }
            // Page 2: heart rate and rest.
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").foregroundStyle(.red)
                    Text(m.bpm.map { "\($0)" } ?? "-").font(.system(size: 40, weight: .heavy, design: .rounded)).monospacedDigit()
                }
                if let end = m.restEnd, end > .now {
                    Text("Rest").font(.caption).foregroundStyle(.secondary)
                    Text(timerInterval: Date.now...end, countsDown: true).font(.title2.monospacedDigit().bold()).foregroundStyle(spark)
                } else if let s = m.startedAt {
                    Text(s, style: .timer).font(.title3.monospacedDigit()).foregroundStyle(.secondary)
                }
                Button(role: .destructive) { m.stop() } label: { Text("End workout").frame(maxWidth: .infinity) }
            }
        }
        .tabViewStyle(.verticalPage)
    }

    private func value(_ v: String, _ unit: String, _ on: Bool, tap: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Text(v).font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(6).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 10).stroke(on ? Color(red: 1, green: 0.42, blue: 0.17) : .clear, lineWidth: 2))
        .onTapGesture(perform: tap)
    }
}
