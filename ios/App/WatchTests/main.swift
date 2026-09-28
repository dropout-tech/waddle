import Foundation

// Plain-Swift tests for WatchShared/WatchModels.swift (no XCTest target needed).
// Run: ios/App/WatchTests/run.sh
var failures = 0, passed = 0
func check(_ ok: @autoclosure () -> Bool, _ name: String, line: Int = #line) {
    if ok() { passed += 1 } else { failures += 1; print("FAIL [\(line)] \(name)") }
}

let account = "11111111-2222-3333-4444-555555555555", epoch = "EPOCH-A"
func widget(_ extra: [String: Any] = [:]) -> [String: Any] {
    var s: [String: Any] = [
        "schemaVersion": 1, "accountId": account, "epoch": epoch, "generatedAt": "2026-09-26T01:00:00.000Z", "today": "2026-09-26",
        "tasks": [
            ["id": "t-done", "title": "Done", "subtitle": "Work", "completed": true, "actionable": true, "revision": "r1"],
            ["id": "t-late", "title": "Late", "subtitle": "Work", "time": "15:00", "completed": false, "actionable": true, "revision": "r2"],
            ["id": "t-early", "title": "Early", "subtitle": "Home", "time": "09:00", "completed": false, "actionable": true, "revision": "r3"],
            ["id": "t-untimed", "title": String(repeating: "長", count: 120), "subtitle": "Home", "completed": false, "actionable": false],
            ["id": "t-pending", "title": "Pending", "subtitle": "Home", "time": "08:00", "completed": false, "actionable": true],
        ],
        "focus": ["mode": "pomodoro", "state": "running", "title": "Write", "endAt": 1_790_000_000_000.0, "seconds": 900, "note": "secret note"],
        "checkIn": ["date": "2026-09-26", "checkedIn": true, "points": 12],
        "notes": [["id": "n1", "title": "Private", "subtitle": "never to watch"]],
    ]
    for (k, v) in extra { s[k] = v }
    return s
}

// 1. Conversion + ordering + trimming
let snap = WatchSnapshot.make(fromWidget: widget(), accountId: account, epoch: epoch, pendingTaskIds: ["t-pending"])!
check(snap.tasks.map(\.id) == ["t-early", "t-late", "t-untimed", "t-pending", "t-done"], "open timed first, then untimed, then pending/done")
check(snap.tasks.first { $0.id == "t-untimed" }!.title.count == 80, "title trimmed to 80")
check(snap.tasks.first { $0.id == "t-pending" }!.pending, "pending flag from action queue")
check(!snap.tasks.first { $0.id == "t-pending" }!.canComplete, "pending task cannot be completed again")
check(!snap.tasks.first { $0.id == "t-untimed" }!.canComplete, "non-actionable (recurring/meeting) cannot be completed")
check(snap.nextTask?.id == "t-early", "next task is earliest open")
check(snap.checkIn == WatchCheckIn(date: "2026-09-26", checkedIn: true, points: 12), "check-in copied")
check(snap.focus.endAt == Date(timeIntervalSince1970: 1_790_000_000), "endAt ms -> Date")

// 2. Account / epoch isolation
check(WatchSnapshot.make(fromWidget: widget(), accountId: account, epoch: "OTHER", pendingTaskIds: []) == nil, "epoch mismatch rejected")
check(WatchSnapshot.make(fromWidget: widget(), accountId: "someone-else", epoch: epoch, pendingTaskIds: []) == nil, "account mismatch rejected")
check(WatchSnapshot.make(fromWidget: widget(), accountId: "", epoch: epoch, pendingTaskIds: []) == nil, "empty account rejected")
check(WatchSnapshot.make(fromWidget: widget(["schemaVersion": 2]), accountId: account, epoch: epoch, pendingTaskIds: []) == nil, "unknown schema rejected")
check(WatchSnapshot.make(fromWidget: widget(["checkIn": NSNull()]), accountId: account, epoch: epoch, pendingTaskIds: [])?.checkIn == nil, "missing check-in ok")

// 3. Task cap
let many = (0..<30).map { ["id": "t\($0)", "title": "T\($0)", "subtitle": "", "completed": false, "actionable": true] as [String: Any] }
check(WatchSnapshot.make(fromWidget: widget(["tasks": many]), accountId: account, epoch: epoch, pendingTaskIds: [])!.tasks.count == WatchSnapshot.maxTasks, "cap at 12 tasks")

// 4. Envelope round trip, no private widget fields leak
let env = WatchEnvelope.snapshot(snap).encode()
check(WatchEnvelope(env) == .snapshot(snap), "snapshot envelope round trip")
let json = String(data: env["payload"] as! Data, encoding: .utf8)!
check(!json.contains("secret note") && !json.contains("never to watch") && !json.contains("revision"), "notes, focus note and revisions are not sent")
check(WatchEnvelope(WatchEnvelope.signedOut.encode()) == .signedOut, "signed out round trip")
check(WatchEnvelope(WatchEnvelope.waiting(accountId: account, epoch: epoch).encode()) == .waiting(accountId: account, epoch: epoch), "waiting round trip")
check(WatchEnvelope(["state": "signedOut"]) == nil, "envelope without marker rejected")

// 5. Commands
let c = WatchCommand.complete(taskId: "t-early", accountId: account, epoch: epoch)
check(WatchCommand(c.encode()) == c, "complete round trip")
let f = WatchCommand.focus(action: .pause, accountId: account, epoch: epoch)
check(WatchCommand(f.encode()) == f, "focus round trip")
check(WatchCommand(["type": "complete", "taskId": "../x", "accountId": account, "epoch": epoch]) == nil, "unsafe task id rejected")
check(WatchCommand(["type": "complete", "taskId": "任務", "accountId": account, "epoch": epoch]) == nil, "non-ascii id rejected")
check(WatchCommand(["type": "focus", "action": "delete", "accountId": account, "epoch": epoch]) == nil, "unknown focus action rejected")
check(WatchCommand(["type": "complete", "taskId": "t1", "accountId": "", "epoch": epoch]) == nil, "missing account rejected")

// 6. Timer math
let gen = Date(timeIntervalSince1970: 1_000_000)
let pomo = WatchFocus(mode: "pomodoro", state: "running", title: "", endAt: gen.addingTimeInterval(600), seconds: 600)
check(pomo.displaySeconds(at: gen.addingTimeInterval(100), generatedAt: gen) == 500, "countdown from endAt")
check(pomo.displaySeconds(at: gen.addingTimeInterval(9999), generatedAt: gen) == 0, "countdown floors at 0")
let sw = WatchFocus(mode: "stopwatch", state: "running", title: "", endAt: nil, seconds: 120)
check(sw.displaySeconds(at: gen.addingTimeInterval(30), generatedAt: gen) == 150, "stopwatch continues")
let paused = WatchFocus(mode: "pomodoro", state: "paused", title: "", endAt: nil, seconds: 321)
check(paused.displaySeconds(at: gen.addingTimeInterval(500), generatedAt: gen) == 321, "paused is frozen")
check(WatchFocus.format(65) == "01:05" && WatchFocus.format(3725) == "1:02:05", "format")

// 7. Staleness
var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "Asia/Taipei")!
let s2 = WatchSnapshot(accountId: account, epoch: epoch, generatedAt: gen, today: WatchSnapshot.dayString(gen, calendar: cal), tasks: [], focus: paused, checkIn: nil)
check(!s2.isStale(at: gen.addingTimeInterval(60), calendar: cal), "fresh")
check(s2.isStale(at: gen.addingTimeInterval(7 * 3600), calendar: cal), "stale after 6h")

print("WatchShared tests: \(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
