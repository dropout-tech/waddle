import Foundation
import Darwin

// Shared only by the app and its extension. No tokens or cloud credentials.
enum WidgetStore {
    static let group = "group.com.lazylazy.huddle"
    /// False when the App Group entitlement is missing (e.g. a free Personal
    /// Team signing build) — then neither the app nor the widget can reach
    /// the shared container and the widget can never receive data.
    static var isAvailable: Bool { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil }
    static func transaction<T>(_ body: (inout [String: Any]) throws -> T) throws -> T {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { throw NSError(domain: "HuddleWidgets", code: 1) }
        let lock = open(root.appendingPathComponent("widgets.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard lock >= 0 else { throw NSError(domain: "HuddleWidgets", code: 2) }
        flock(lock, LOCK_EX); defer { flock(lock, LOCK_UN); close(lock) }
        let url = root.appendingPathComponent("widgets.json")
        var state = (try? Data(contentsOf: url)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        let result = try body(&state)
        let data = try JSONSerialization.data(withJSONObject: state)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return result
    }
    static func read() -> [String: Any] { (try? transaction { $0 }) ?? [:] }
    static func setAccount(_ id: String) throws -> String {
        try transaction { state in
            if state["accountId"] as? String != id || state["epoch"] == nil {
                state = ["accountId": id, "epoch": UUID().uuidString, "actions": [[String: Any]]()]
            }
            return state["epoch"] as? String ?? ""
        }
    }
    static func publish(_ snapshot: [String: Any]) throws {
        try transaction { state in
            guard let owner = snapshot["accountId"] as? String, !owner.isEmpty,
                  owner == state["accountId"] as? String,
                  snapshot["epoch"] as? String == state["epoch"] as? String,
                  snapshot["schemaVersion"] as? Int == 1 else { throw NSError(domain:"HuddleWidgets",code:3) }
            state["snapshot"] = snapshot
        }
    }
    // MARK: Widget → app queue. The widget never talks to the server; every
    // write is an entry in state["actions"] that the app replays (and then
    // acknowledges) the next time it runs — components/widgets/widget-sync.tsx
    // via lib/widgets/actions.ts. Shapes:
    //   task:  {type?:"task", taskId, revision, completed?}  (no type/completed = legacy "complete")
    //   water: {type:"water", at}                             (ms since epoch)
    //   focus: {type:"focus", op:"start|pause|resume|stop", at}
    static let queueLimit = 50
    static func isTaskAction(_ a: [String: Any]) -> Bool { (a["type"] as? String ?? "task") == "task" }
    private static func owns(_ state: [String: Any], _ accountId: String, _ epoch: String) -> Bool {
        !accountId.isEmpty && state["accountId"] as? String == accountId && state["epoch"] as? String == epoch
    }
    /// Tick / untick. A second tap on a task that is still waiting to sync just
    /// cancels the queued change; otherwise queue an explicit target value
    /// (never a toggle) so a replay after a crash can't flip it back.
    static func toggleTask(taskId: String, accountId: String, epoch: String) throws {
        try transaction { state in
            guard owns(state, accountId, epoch),
                  let snapshot=state["snapshot"] as? [String:Any], let tasks=snapshot["tasks"] as? [[String:Any]],
                  let task=tasks.first(where: { $0["id"] as? String == taskId }), task["actionable"] as? Bool == true,
                  let revision=task["revision"] as? String else {return}
            var actions=state["actions"] as? [[String:Any]] ?? []
            if let i=actions.firstIndex(where:{isTaskAction($0) && $0["taskId"] as? String == taskId}) {actions.remove(at:i)}
            else {
                guard actions.count < queueLimit else {return}
                actions.append(["id":UUID().uuidString,"type":"task","taskId":taskId,"revision":revision,"completed":task["completed"] as? Bool != true,"accountId":accountId,"epoch":epoch])
            }
            state["actions"]=actions
        }
    }
    /// One glass of water: queue it for the app (which re-arms its reminder)
    /// and keep today's local tally for the widget face.
    static func logWater(accountId: String, epoch: String, day: String, at: Date = Date()) throws {
        try transaction { state in
            guard owns(state, accountId, epoch) else {return}
            var actions=state["actions"] as? [[String:Any]] ?? []
            guard actions.count < queueLimit else {return}
            actions.append(["id":UUID().uuidString,"type":"water","at":(at.timeIntervalSince1970*1000).rounded(),"accountId":accountId,"epoch":epoch])
            state["actions"]=actions
            let log=state["waterLog"] as? [String:Any]
            let count=(log?["day"] as? String == day ? log?["count"] as? Int : nil) ?? 0
            state["waterLog"]=["day":day,"count":count+1,"last":(at.timeIntervalSince1970*1000).rounded()]
        }
    }
    static func queueFocus(op: String, accountId: String, epoch: String, at: Date = Date()) throws {
        try transaction { state in
            guard owns(state, accountId, epoch), ["start","pause","resume","stop"].contains(op) else {return}
            var actions=state["actions"] as? [[String:Any]] ?? []
            guard actions.count < queueLimit else {return}
            actions.append(["id":UUID().uuidString,"type":"focus","op":op,"at":(at.timeIntervalSince1970*1000).rounded(),"accountId":accountId,"epoch":epoch])
            state["actions"]=actions
        }
    }
    /// Which slice of the day the 本週時間表 widget shows. Display-only, never synced.
    static func setWeekWindow(_ window: String, at: Date = Date()) throws {
        try transaction { state in state["weekWindow"]=["value":window,"at":(at.timeIntervalSince1970*1000).rounded()] }
    }
}
