import Foundation
import UIKit
import WatchConnectivity
import WidgetKit

extension Notification.Name {
    /// Posted after the watch queued something the web layer should process now.
    static let huddleWatchCommand = Notification.Name("HuddleWatchCommand")
}

/// iPhone side of the Apple Watch link. The watch only ever receives a trimmed copy of the
/// widget snapshot that already lives in the App Group (same account + epoch rules), and
/// every watch command is re-validated here before it reaches the existing queues.
final class WatchBridge: NSObject, WCSessionDelegate {
    static let shared = WatchBridge()
    /// Focus commands older than this are dropped instead of applied late.
    static let focusCommandTTL: TimeInterval = 120

    private let queue = DispatchQueue(label: "huddle.watch-bridge")

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Mirrors the App Group state to the watch. Safe to call often: the context is only
    /// sent when a watch app is installed, and identical contexts are coalesced by the OS.
    func push() {
        guard WCSession.isSupported() else { return }
        queue.async {
            let session = WCSession.default
            guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
            let envelope = WatchBridge.currentEnvelope()
            try? session.updateApplicationContext(envelope.encode())
        }
    }

    static func currentEnvelope() -> WatchEnvelope {
        let state = WidgetStore.read()
        guard let account = state["accountId"] as? String, !account.isEmpty, let epoch = state["epoch"] as? String else { return .signedOut }
        let pending = Set((state["actions"] as? [[String: Any]] ?? []).compactMap { $0["taskId"] as? String })
        guard let widget = state["snapshot"] as? [String: Any],
              let snapshot = WatchSnapshot.make(fromWidget: widget, accountId: account, epoch: epoch, pendingTaskIds: pending)
        else { return .waiting(accountId: account, epoch: epoch) }
        return .snapshot(snapshot)
    }

    // MARK: Commands from the watch

    private func handle(_ raw: [String: Any]) -> WatchReply {
        guard let command = WatchCommand(raw) else { return .rejected }
        let state = WidgetStore.read()
        guard state["accountId"] as? String == command.accountId, state["epoch"] as? String == command.epoch else { return .rejected }
        switch command {
        case let .complete(taskId, account, epoch):
            // Same path as the widget checkbox: revision-guarded, set-only, max 50 queued.
            try? WidgetStore.complete(taskId: taskId, accountId: account, epoch: epoch)
            let queued = (WidgetStore.read()["actions"] as? [[String: Any]] ?? []).contains { $0["taskId"] as? String == taskId }
            guard queued else { return .rejected }
        case let .focus(action, account, epoch):
            let stored = (try? WidgetStore.transaction { state -> Bool in
                guard state["accountId"] as? String == account, state["epoch"] as? String == epoch else { return false }
                state["focusCommand"] = ["id": UUID().uuidString, "action": action.rawValue, "accountId": account, "epoch": epoch,
                                         "at": Date().timeIntervalSince1970 * 1000]
                return true
            }) ?? false
            guard stored else { return .rejected }
        }
        WidgetCenter.shared.reloadAllTimelines()
        push()
        var active = false
        DispatchQueue.main.sync {
            active = UIApplication.shared.applicationState == .active
            NotificationCenter.default.post(name: .huddleWatchCommand, object: nil)
        }
        return active ? .applied : .queued
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        queue.async { replyHandler(["result": self.handle(message).rawValue]) }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        queue.async { _ = self.handle(message) }
    }

    /// Offline fallback for task completion (delivered when the phone is reachable again).
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard (userInfo["type"] as? String) == "complete" else { return }
        queue.async { _ = self.handle(userInfo) }
    }

    // MARK: Session lifecycle

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated { push() }
    }
    func sessionWatchStateDidChange(_ session: WCSession) { push() }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }   // watch switched
}
