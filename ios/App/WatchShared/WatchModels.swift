import Foundation

// Shared by the iPhone app (WatchBridge), the watch app, the watch complication
// and the plain-Swift tests. Foundation only: no UIKit, WatchConnectivity or tokens.
//
// The watch never talks to Supabase. It only receives a trimmed copy of the widget
// snapshot the iPhone already published to the App Group, and sends commands back
// that the iPhone validates against the same account + epoch rules as the widgets.

struct WatchTask: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var category: String
    var date: String?
    var time: String?
    var completed: Bool
    var actionable: Bool
    var pending: Bool
    /// The watch may tick a box only for a task the iPhone would also accept.
    var canComplete: Bool { actionable && !completed && !pending }
}

struct WatchFocus: Codable, Equatable {
    var mode: String?          // "pomodoro" | "stopwatch" | nil
    var state: String          // "idle" | "running" | "paused" | "completed"
    var title: String
    var endAt: Date?           // pomodoro running only
    var seconds: Int           // value shown on the iPhone at generatedAt

    var isRunning: Bool { state == "running" }
    var isPaused: Bool { state == "paused" }
    var isCountdown: Bool { mode != "stopwatch" }

    /// Seconds to show at `now`. Countdown uses the absolute end time; a running
    /// stopwatch continues from the value captured at `generatedAt`.
    func displaySeconds(at now: Date, generatedAt: Date) -> Int {
        if isRunning, isCountdown, let endAt { return max(0, Int(endAt.timeIntervalSince(now).rounded(.up))) }
        if isRunning, !isCountdown { return max(0, seconds + max(0, Int(now.timeIntervalSince(generatedAt)))) }
        return max(0, seconds)
    }

    static func format(_ total: Int) -> String {
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }
}

struct WatchCheckIn: Codable, Equatable {
    var date: String
    var checkedIn: Bool
    var points: Int
}

struct WatchSnapshot: Codable, Equatable {
    static let schemaVersion = 1
    static let maxTasks = 12

    var version: Int = WatchSnapshot.schemaVersion
    var accountId: String
    var epoch: String
    var generatedAt: Date
    var today: String
    var tasks: [WatchTask]
    var focus: WatchFocus
    var checkIn: WatchCheckIn?

    var openTasks: [WatchTask] { tasks.filter { !$0.completed && !$0.pending } }
    var nextTask: WatchTask? { openTasks.first }

    /// Older than 6 hours, or taken on a different calendar day than `now`.
    func isStale(at now: Date, calendar: Calendar = .current) -> Bool {
        now.timeIntervalSince(generatedAt) > 6 * 3600 || today != WatchSnapshot.dayString(now, calendar: calendar)
    }

    static func dayString(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Open first, then timed tasks by time, then the order the iPhone chose.
    static func sorted(_ tasks: [WatchTask]) -> [WatchTask] {
        tasks.enumerated().sorted { a, b in
            let da = a.element.completed || a.element.pending, db = b.element.completed || b.element.pending
            if da != db { return !da }
            switch (a.element.time, b.element.time) {
            case let (x?, y?) where x != y: return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.offset < b.offset
            }
        }.map(\.element)
    }

    /// Builds the watch copy from the widget snapshot dictionary stored in the App Group
    /// (see WidgetStore / lib/widgets/model.ts). Returns nil when the widget snapshot is
    /// missing, malformed, or belongs to another account/epoch.
    static func make(fromWidget s: [String: Any], accountId: String, epoch: String, pendingTaskIds: Set<String>) -> WatchSnapshot? {
        guard !accountId.isEmpty, s["accountId"] as? String == accountId, s["epoch"] as? String == epoch,
              s["schemaVersion"] as? Int == 1, let today = s["today"] as? String else { return nil }
        let generatedAt = (s["generatedAt"] as? String).flatMap(parseISO) ?? Date()
        let rawTasks = s["tasks"] as? [[String: Any]] ?? []
        let tasks: [WatchTask] = rawTasks.compactMap { t in
            guard let id = t["id"] as? String, !id.isEmpty else { return nil }
            return WatchTask(id: id, title: String((t["title"] as? String ?? "").prefix(80)),
                             category: String((t["subtitle"] as? String ?? "").prefix(40)),
                             date: t["date"] as? String, time: t["time"] as? String,
                             completed: t["completed"] as? Bool ?? false, actionable: t["actionable"] as? Bool ?? false,
                             pending: pendingTaskIds.contains(id))
        }
        let f = s["focus"] as? [String: Any] ?? [:]
        let focus = WatchFocus(mode: f["mode"] as? String, state: f["state"] as? String ?? "idle",
                               title: String((f["title"] as? String ?? "").prefix(80)),
                               endAt: number(f["endAt"]).map { Date(timeIntervalSince1970: $0 / 1000) },
                               seconds: Int(number(f["seconds"]) ?? 0))
        var checkIn: WatchCheckIn?
        if let c = s["checkIn"] as? [String: Any], let date = c["date"] as? String, let done = c["checkedIn"] as? Bool {
            checkIn = WatchCheckIn(date: date, checkedIn: done, points: Int(number(c["points"]) ?? 0))
        }
        return WatchSnapshot(accountId: accountId, epoch: epoch, generatedAt: generatedAt, today: today,
                             tasks: Array(sorted(tasks).prefix(maxTasks)), focus: focus, checkIn: checkIn)
    }

    private static func number(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let n = v as? NSNumber { return n.doubleValue }
        return nil
    }
    private static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

/// What the iPhone sends through `updateApplicationContext`. Each context fully
/// replaces the previous one on the watch, so signing out wipes the watch copy.
enum WatchEnvelope: Equatable {
    case signedOut
    case waiting(accountId: String, epoch: String)   // signed in, snapshot not published yet
    case snapshot(WatchSnapshot)

    static let key = "huddle.watch"

    func encode() -> [String: Any] {
        switch self {
        case .signedOut: return [WatchEnvelope.key: 1, "state": "signedOut"]
        case let .waiting(a, e): return [WatchEnvelope.key: 1, "state": "waiting", "accountId": a, "epoch": e]
        case let .snapshot(s):
            let data = (try? WatchEnvelope.encoder.encode(s)) ?? Data()
            return [WatchEnvelope.key: 1, "state": "snapshot", "payload": data]
        }
    }

    init?(_ d: [String: Any]) {
        guard d[WatchEnvelope.key] as? Int == 1 else { return nil }
        switch d["state"] as? String {
        case "signedOut": self = .signedOut
        case "waiting":
            guard let a = d["accountId"] as? String, let e = d["epoch"] as? String else { return nil }
            self = .waiting(accountId: a, epoch: e)
        case "snapshot":
            guard let data = d["payload"] as? Data, let s = try? WatchEnvelope.decoder.decode(WatchSnapshot.self, from: data),
                  s.version == WatchSnapshot.schemaVersion else { return nil }
            self = .snapshot(s)
        default: return nil
        }
    }

    static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .millisecondsSince1970; return e }()
    static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .millisecondsSince1970; return d }()
}

/// Watch -> iPhone. The iPhone re-checks account + epoch before acting.
enum WatchCommand: Equatable {
    case complete(taskId: String, accountId: String, epoch: String)
    case focus(action: FocusAction, accountId: String, epoch: String)

    enum FocusAction: String { case start, pause, resume }

    var accountId: String { switch self { case let .complete(_, a, _), let .focus(_, a, _): return a } }
    var epoch: String { switch self { case let .complete(_, _, e), let .focus(_, _, e): return e } }

    func encode() -> [String: Any] {
        switch self {
        case let .complete(t, a, e): return ["type": "complete", "taskId": t, "accountId": a, "epoch": e]
        case let .focus(x, a, e): return ["type": "focus", "action": x.rawValue, "accountId": a, "epoch": e]
        }
    }

    init?(_ d: [String: Any]) {
        guard let a = d["accountId"] as? String, !a.isEmpty, a.count <= 80,
              let e = d["epoch"] as? String, !e.isEmpty, e.count <= 80 else { return nil }
        switch d["type"] as? String {
        case "complete":
            guard let t = d["taskId"] as? String, WatchCommand.isSafeId(t) else { return nil }
            self = .complete(taskId: t, accountId: a, epoch: e)
        case "focus":
            guard let x = (d["action"] as? String).flatMap(FocusAction.init(rawValue:)) else { return nil }
            self = .focus(action: x, accountId: a, epoch: e)
        default: return nil
        }
    }

    /// Same rule as parseWidgetURL in lib/widgets/model.ts.
    static func isSafeId(_ s: String) -> Bool {
        !s.isEmpty && s.count <= 80 && s.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "-" }
    }
}

/// iPhone -> watch reply to a command.
enum WatchReply: String {
    case queued        // accepted; iPhone app will write it when Huddle is in the foreground
    case applied       // iPhone app is active and will apply it now
    case rejected      // wrong account/epoch, unknown or not actionable task
}
