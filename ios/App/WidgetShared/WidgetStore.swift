import Foundation
import Darwin

// Shared only by the app and its extension. No tokens or cloud credentials.
enum WidgetStore {
    static let group = "group.com.lazylazy.huddle"
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
    static func complete(taskId: String, accountId: String, epoch: String) throws {
        try transaction { state in
            guard !accountId.isEmpty, state["accountId"] as? String == accountId, state["epoch"] as? String == epoch,
                  let snapshot=state["snapshot"] as? [String:Any], let tasks=snapshot["tasks"] as? [[String:Any]],
                  let task=tasks.first(where: { $0["id"] as? String == taskId }), task["actionable"] as? Bool == true,
                  task["completed"] as? Bool != true, let revision=task["revision"] as? String else {return}
            var actions=state["actions"] as? [[String:Any]] ?? []
            guard !actions.contains(where:{$0["taskId"] as? String == taskId}), actions.count < 50 else {return}
            actions.append(["id":UUID().uuidString,"taskId":taskId,"revision":revision,"accountId":accountId,"epoch":epoch])
            state["actions"]=actions
        }
    }
}
