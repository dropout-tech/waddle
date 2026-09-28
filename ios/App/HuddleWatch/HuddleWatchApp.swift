import SwiftUI

@main
struct HuddleWatchApp: App {
    @StateObject private var model = WatchModel()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(model) }
    }
}

struct RootView: View {
    @EnvironmentObject var model: WatchModel

    var body: some View {
        switch model.envelope {
        case .snapshot(let s)?:
            TabView {
                TasksPage(snapshot: s)
                FocusPage(snapshot: s)
                CheckInPage(snapshot: s)
            }
            .tabViewStyle(.verticalPage)
        case .signedOut?:
            MessageView(symbol: "person.crop.circle", title: "Sign in on iPhone", detail: "Open Huddle on your iPhone and sign in.")
        case .waiting?, nil:
            MessageView(symbol: "iphone", title: "Waiting for iPhone", detail: "Open Huddle on your iPhone to sync today.")
        }
    }
}

struct MessageView: View {
    var symbol: String
    var title: LocalizedStringKey
    var detail: LocalizedStringKey
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Image("Huddle").resizable().scaledToFit().frame(width: 56, height: 56).accessibilityHidden(true)
                Label(title, systemImage: symbol).font(.headline).multilineTextAlignment(.center)
                Text(detail).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

/// Stale / notice footer shared by the pages.
struct StatusFooter: View {
    @EnvironmentObject var model: WatchModel
    var snapshot: WatchSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let notice = model.notice {
                Text(notice.text).font(.footnote).foregroundStyle(.tint)
            }
            TimelineView(.periodic(from: .now, by: 300)) { context in
                if snapshot.isStale(at: context.date) {
                    Text("Out of date · open Huddle on iPhone").font(.footnote).foregroundStyle(.orange)
                } else {
                    Text("Updated \(snapshot.generatedAt.formatted(date: .omitted, time: .shortened))")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: Tasks

struct TasksPage: View {
    @EnvironmentObject var model: WatchModel
    var snapshot: WatchSnapshot

    var body: some View {
        NavigationStack {
            List {
                if snapshot.tasks.isEmpty {
                    Text("Nothing left today").foregroundStyle(.secondary)
                }
                ForEach(snapshot.tasks) { task in
                    TaskRow(task: task, today: snapshot.today)
                }
                StatusFooter(snapshot: snapshot).listRowBackground(Color.clear)
            }
            .navigationTitle("Today")
        }
    }
}

struct TaskRow: View {
    @EnvironmentObject var model: WatchModel
    var task: WatchTask
    var today: String

    private var pending: Bool { model.isPending(task) }
    private var detail: String {
        var parts: [String] = []
        if let time = task.time, !time.isEmpty { parts.append(time) }
        else if let date = task.date, date != today { parts.append(String(date.suffix(5))) }
        if !task.category.isEmpty { parts.append(task.category) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button {
            model.complete(task)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                icon.font(.title3).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.title).font(.body).lineLimit(3)
                        .strikethrough(task.completed)
                        .foregroundStyle(task.completed ? .secondary : .primary)
                        .privacySensitive()
                    if !detail.isEmpty { Text(detail).font(.footnote).foregroundStyle(.secondary).lineLimit(1) }
                    if pending { Text("Syncing").font(.footnote).foregroundStyle(.secondary) }
                    else if !task.actionable && !task.completed { Text("Complete on iPhone").font(.footnote).foregroundStyle(.secondary) }
                }
            }
        }
        .disabled(!task.canComplete || pending)
        .accessibilityLabel(Text(task.title))
        .accessibilityValue(task.completed ? Text("Done") : pending ? Text("Syncing") : Text(""))
        .accessibilityHint(task.canComplete && !pending ? Text("Mark complete") : Text(""))
    }

    @ViewBuilder private var icon: some View {
        if task.completed { Image(systemName: "checkmark.circle.fill") }
        else if pending { Image(systemName: "clock") }
        else if task.actionable { Image(systemName: "circle") }
        else { Image(systemName: "iphone") }
    }
}

// MARK: Focus

struct FocusPage: View {
    @EnvironmentObject var model: WatchModel
    var snapshot: WatchSnapshot
    private var focus: WatchFocus { snapshot.focus }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Label("Focus", systemImage: "timer").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                if !focus.title.isEmpty {
                    Text(focus.title).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading).privacySensitive()
                }
                timer.font(.system(.largeTitle, design: .rounded).monospacedDigit()).minimumScaleFactor(0.6).lineLimit(1)
                Text(stateLabel).font(.footnote).foregroundStyle(.secondary)
                controls
                StatusFooter(snapshot: snapshot)
            }
        }
    }

    private var stateLabel: LocalizedStringKey {
        focus.isRunning ? "Focusing" : focus.isPaused ? "Paused" : "Ready"
    }

    @ViewBuilder private var timer: some View {
        if focus.isRunning, focus.isCountdown, let end = focus.endAt, end > Date() {
            Text(timerInterval: Date()...end, countsDown: true)
        } else if focus.isRunning {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(WatchFocus.format(focus.displaySeconds(at: context.date, generatedAt: snapshot.generatedAt)))
            }
        } else {
            Text(WatchFocus.format(focus.seconds))
        }
    }

    @ViewBuilder private var controls: some View {
        if focus.isRunning {
            Button { model.focus(.pause) } label: { Label("Pause", systemImage: "pause.fill") }
        } else if focus.isPaused {
            Button { model.focus(.resume) } label: { Label("Resume", systemImage: "play.fill") }
        } else {
            Button { model.focus(.start) } label: { Label("Start", systemImage: "play.fill") }
        }
    }
}

// MARK: Check-in

struct CheckInPage: View {
    var snapshot: WatchSnapshot

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Label("Check-in", systemImage: "calendar.badge.checkmark").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                if let c = snapshot.checkIn {
                    Image(systemName: c.checkedIn ? "checkmark.seal.fill" : "seal")
                        .font(.system(size: 44)).foregroundStyle(.tint).accessibilityHidden(true)
                    Text(c.checkedIn ? "Checked in today" : "Not checked in yet").font(.body)
                    Text("\(c.points) points").font(.footnote).foregroundStyle(.secondary)
                    if !c.checkedIn { Text("Check in on iPhone").font(.footnote).foregroundStyle(.secondary) }
                } else {
                    Text("Check-in status unavailable").font(.footnote).foregroundStyle(.secondary)
                }
                StatusFooter(snapshot: snapshot)
            }
        }
    }
}
