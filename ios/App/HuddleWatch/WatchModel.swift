import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit
import WidgetKit

/// Short status line shown under the content after a watch action.
enum WatchNotice: Equatable {
    case sent, openPhoneToApply, phoneUnreachable, queuedOffline, rejected

    var text: LocalizedStringKey {
        switch self {
        case .sent: return "Sent to iPhone"
        case .openPhoneToApply: return "Open Huddle on iPhone to apply"
        case .phoneUnreachable: return "iPhone not reachable"
        case .queuedOffline: return "Will sync when iPhone is nearby"
        case .rejected: return "Couldn't update. Open Huddle on iPhone."
        }
    }
}

@MainActor
final class WatchModel: NSObject, ObservableObject {
    @Published private(set) var envelope: WatchEnvelope?
    /// Tasks ticked on the watch that the iPhone has not confirmed in a snapshot yet.
    @Published private(set) var localPending: Set<String> = []
    @Published var notice: WatchNotice?

    override init() {
        envelope = WatchLocalStore.load()
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    var snapshot: WatchSnapshot? {
        if case let .snapshot(s) = envelope { return s }
        return nil
    }

    func isPending(_ task: WatchTask) -> Bool { task.pending || localPending.contains(task.id) }

    // MARK: Actions

    func complete(_ task: WatchTask) {
        guard let s = snapshot, task.canComplete, !localPending.contains(task.id) else { return }
        localPending.insert(task.id)
        WKInterfaceDevice.current().play(.success)
        let message = WatchCommand.complete(taskId: task.id, accountId: s.accountId, epoch: s.epoch).encode()
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else {
            // Completion is revision-guarded on the iPhone, so late delivery is safe.
            session.transferUserInfo(message)
            notice = .queuedOffline
            return
        }
        session.sendMessage(message, replyHandler: { reply in
            let result = WatchReply(rawValue: reply["result"] as? String ?? "")
            Task { @MainActor in self.handleCompletionReply(result, taskId: task.id) }
        }, errorHandler: { _ in
            session.transferUserInfo(message)
            Task { @MainActor in self.notice = .queuedOffline }
        })
    }

    private func handleCompletionReply(_ result: WatchReply?, taskId: String) {
        switch result {
        case .applied?, .queued?: notice = .sent
        default:
            localPending.remove(taskId)
            notice = .rejected
            WKInterfaceDevice.current().play(.failure)
        }
    }

    func focus(_ action: WatchCommand.FocusAction) {
        guard let s = snapshot else { return }
        let session = WCSession.default
        // Timer commands are only useful right now, so there is no offline queue for them.
        guard session.activationState == .activated, session.isReachable else { notice = .phoneUnreachable; return }
        WKInterfaceDevice.current().play(.click)
        let message = WatchCommand.focus(action: action, accountId: s.accountId, epoch: s.epoch).encode()
        session.sendMessage(message, replyHandler: { reply in
            let result = WatchReply(rawValue: reply["result"] as? String ?? "")
            Task { @MainActor in
                switch result {
                case .applied?: self.notice = .sent
                case .queued?: self.notice = .openPhoneToApply
                default: self.notice = .rejected
                }
            }
        }, errorHandler: { _ in
            Task { @MainActor in self.notice = .phoneUnreachable }
        })
    }

    // MARK: Incoming context

    fileprivate func apply(_ context: [String: Any]) {
        guard let next = WatchEnvelope(context) else { return }
        envelope = next
        WatchLocalStore.save(next)
        if let s = snapshot {
            // Keep only local ticks the iPhone has not reflected yet.
            let open = Set(s.tasks.filter { !$0.completed && !$0.pending }.map(\.id))
            localPending = localPending.intersection(open)
        } else {
            localPending = []
        }
        WidgetCenter.shared.reloadAllTimelines()
    }
}

extension WatchModel: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        guard !context.isEmpty else { return }
        Task { @MainActor in self.apply(context) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.apply(applicationContext) }
    }
}
