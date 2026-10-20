import SwiftUI
import WidgetKit
import ActivityKit

private let spark = LinearGradient(colors: [Color(red: 1, green: 0.416, blue: 0.169), Color(red: 1, green: 0.184, blue: 0.49)], startPoint: .topLeading, endPoint: .bottomTrailing)
private let ink = Color(red: 0.043, green: 0.051, blue: 0.102)
private let chalk = Color(red: 0.953, green: 0.941, blue: 0.91)
private let zoneColors: [Color] = [.init(red: 0.36, green: 0.55, blue: 1), .init(red: 0.24, green: 0.86, blue: 0.59), .init(red: 1, green: 0.83, blue: 0.3), .init(red: 1, green: 0.62, blue: 0.24), .init(red: 1, green: 0.24, blue: 0.43)]

@main
struct LiftsparkWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        WorkoutLiveActivity()
    }
}

// MARK: Home-screen widget: streak, last strain, kcal left

struct TodayEntry: TimelineEntry {
    let date: Date
    let snap: WidgetStore.Snapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snap: .init(streakWeeks: 4, lastStrain: 13.8, kcalLeft: 820, nextWorkout: "Push Day", updated: .now))
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : TodayEntry(date: .now, snap: WidgetStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: [TodayEntry(date: .now, snap: WidgetStore.read())], policy: .after(next)))
    }
}

struct TodayWidgetView: View {
    let entry: TodayEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        let s = entry.snap
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").foregroundStyle(spark)
                Text("Liftspark").font(.caption.weight(.bold)).foregroundStyle(chalk.opacity(0.7))
            }
            if let s {
                Text("\(s.streakWeeks)").font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundStyle(chalk)
                    + Text(" wk streak").font(.caption.weight(.semibold)).foregroundStyle(chalk.opacity(0.6))
                HStack(spacing: 14) {
                    stat(s.lastStrain.map { String(format: "%.1f", $0) } ?? "–", "strain")
                    stat(s.kcalLeft.map { "\($0)" } ?? "–", "kcal left")
                }
                if family != .systemSmall, let n = s.nextWorkout {
                    Text("Next: \(n)").font(.caption.weight(.semibold)).foregroundStyle(chalk.opacity(0.8))
                }
            } else {
                Text("Open Liftspark to start").font(.caption).foregroundStyle(chalk.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(ink, for: .widget)
    }
    private func stat(_ v: String, _ k: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(v).font(.system(size: 18, weight: .bold, design: .rounded)).foregroundStyle(chalk)
            Text(k).font(.system(size: 10, weight: .semibold)).foregroundStyle(chalk.opacity(0.55))
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LiftsparkToday", provider: TodayProvider()) { TodayWidgetView(entry: $0) }
            .configurationDisplayName("Today")
            .description("Your streak, last strain and calories left.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: Live Activity: rest countdown, exercise and set, live heart rate

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { ctx in
            LockScreenView(attrs: ctx.attributes, state: ctx.state)
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(chalk)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.state.exercise).font(.headline).lineLimit(1)
                        Text(ctx.state.setLabel).font(.caption).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) { HeartView(state: ctx.state, big: true) }
                DynamicIslandExpandedRegion(.bottom) { RestView(state: ctx.state) }
            } compactLeading: {
                Image(systemName: "bolt.fill").foregroundStyle(spark)
            } compactTrailing: {
                if let end = ctx.state.restEnd, end > .now {
                    Text(timerInterval: Date.now...end, countsDown: true).monospacedDigit().frame(maxWidth: 44)
                } else { HeartView(state: ctx.state, big: false) }
            } minimal: {
                if let end = ctx.state.restEnd, end > .now {
                    Text(timerInterval: Date.now...end, countsDown: true).monospacedDigit().font(.caption2)
                } else { Image(systemName: "bolt.fill").foregroundStyle(spark) }
            }
        }
    }
}

struct LockScreenView: View {
    let attrs: WorkoutActivityAttributes
    let state: WorkoutActivityAttributes.ContentState
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(attrs.workoutName.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(chalk.opacity(0.6))
                Text(state.exercise).font(.title3.weight(.bold)).foregroundStyle(chalk).lineLimit(1)
                Text(state.setLabel).font(.subheadline).foregroundStyle(chalk.opacity(0.75))
                RestView(state: state)
            }
            Spacer()
            HeartView(state: state, big: true)
        }
        .padding(16)
    }
}

struct RestView: View {
    let state: WorkoutActivityAttributes.ContentState
    var body: some View {
        if let end = state.restEnd, end > .now {
            HStack(spacing: 6) {
                Image(systemName: "timer").foregroundStyle(spark)
                Text("Rest").font(.caption.weight(.semibold)).foregroundStyle(chalk.opacity(0.7))
                Text(timerInterval: Date.now...end, countsDown: true).font(.system(.title3, design: .rounded).weight(.bold)).monospacedDigit().foregroundStyle(chalk)
            }
        } else {
            HStack(spacing: 6) {
                Image(systemName: "clock").foregroundStyle(chalk.opacity(0.6))
                Text(state.startedAt, style: .timer).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(chalk.opacity(0.7))
            }
        }
    }
}

struct HeartView: View {
    let state: WorkoutActivityAttributes.ContentState
    let big: Bool
    var body: some View {
        let color = state.zone.map { zoneColors[max(0, min(4, $0 - 1))] } ?? chalk.opacity(0.5)
        VStack(spacing: 0) {
            HStack(spacing: 3) {
                Image(systemName: "heart.fill").foregroundStyle(color).font(big ? .body : .caption2)
                Text(state.bpm.map { "\($0)" } ?? "–").font(big ? .system(size: 28, weight: .heavy, design: .rounded) : .caption2.weight(.bold)).monospacedDigit()
            }
            if big, let z = state.zone { Text("Zone \(z)").font(.caption2.weight(.semibold)).foregroundStyle(color) }
        }
    }
}
