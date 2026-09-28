import SwiftUI
import WidgetKit

// Watch complications / Smart Stack. Reads only the watch-side cache written by the
// watch app (WatchLocalStore); task titles are marked privacySensitive so they are
// redacted when the wrist is down or the watch is locked.

struct WatchEntry: TimelineEntry {
    var date: Date
    var snapshot: WatchSnapshot?
    var relevance: TimelineEntryRelevance?
}

struct WatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchEntry { WatchEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) { completion(entry(Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
        let now = Date(), e = entry(now)
        var next = now.addingTimeInterval(15 * 60)
        if let s = e.snapshot, s.focus.isRunning, s.focus.isCountdown, let end = s.focus.endAt, end > now, end < next { next = end }
        completion(Timeline(entries: [e], policy: .after(next)))
    }
    private func entry(_ now: Date) -> WatchEntry {
        guard case let .snapshot(s)? = WatchLocalStore.load() else { return WatchEntry(date: now, snapshot: nil) }
        // Smart Stack: surface a running timer first, then an open task.
        let score: Float = s.focus.isRunning ? 100 : (s.nextTask != nil ? 10 : 0)
        return WatchEntry(date: now, snapshot: s, relevance: TimelineEntryRelevance(score: score))
    }
}

struct WatchComplicationView: View {
    @Environment(\.widgetFamily) var family
    var entry: WatchEntry

    private var s: WatchSnapshot? { entry.snapshot }
    private var countdownEnd: Date? {
        guard let f = s?.focus, f.isRunning, f.isCountdown, let end = f.endAt, end > entry.date else { return nil }
        return end
    }
    private var openCount: Int { s?.openTasks.count ?? 0 }

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryCorner: corner
        case .accessoryInline: inline
        default: rectangular
        }
    }

    @ViewBuilder private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let end = countdownEnd {
                VStack(spacing: 0) {
                    Image(systemName: "timer").font(.caption2)
                    Text(timerInterval: entry.date...end, countsDown: true).font(.caption2).monospacedDigit().multilineTextAlignment(.center)
                }
            } else if s != nil {
                VStack(spacing: 0) {
                    Image(systemName: "checklist").font(.caption2)
                    Text("\(openCount)").font(.title3.weight(.semibold))
                }
            } else {
                Image(systemName: "checklist")
            }
        }
        .accessibilityLabel(Text("Huddle"))
    }

    @ViewBuilder private var corner: some View {
        Image(systemName: countdownEnd != nil ? "timer" : "checklist")
            .font(.title3)
            .widgetLabel {
                if let end = countdownEnd { Text(timerInterval: entry.date...end, countsDown: true) }
                else if s != nil { Text("\(openCount) left") }
                else { Text("Huddle") }
            }
    }

    @ViewBuilder private var inline: some View {
        if let end = countdownEnd {
            Text("Focusing \(Text(timerInterval: entry.date...end, countsDown: true))")
        } else if s != nil {
            Text(openCount == 0 ? "All done" : "\(openCount) left")
        } else {
            Text("Huddle")
        }
    }

    @ViewBuilder private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Huddle").font(.headline).widgetAccentable()
            if let end = countdownEnd {
                Text(s?.focus.title ?? "").font(.caption).lineLimit(1).privacySensitive()
                Text(timerInterval: entry.date...end, countsDown: true).font(.body.monospacedDigit())
            } else if let task = s?.nextTask {
                Text(task.title).font(.body).lineLimit(2).privacySensitive()
                Text(task.time.map { "\($0) · " } ?? "").font(.caption) + Text("\(openCount) left").font(.caption)
            } else if s != nil {
                Text("All done").font(.body)
            } else {
                Text("Open Huddle on your iPhone to sync today.").font(.caption).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@main
struct HuddleWatchWidgets: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HuddleWatchToday", provider: WatchProvider()) { entry in
            WatchComplicationView(entry: entry).containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Huddle Today")
        .description("Next task or focus timer.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}
