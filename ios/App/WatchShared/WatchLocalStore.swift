import Foundation

/// Watch-side cache of the last envelope from the iPhone, shared by the watch app and its
/// complication through the watch's own App Group container (separate from the iPhone's).
/// If the group entitlement is missing it falls back to the app's own defaults, so the app
/// still works and only the complication stays empty.
enum WatchLocalStore {
    static let group = "group.com.lazylazy.huddle"
    private static let key = "huddle.watch.envelope"
    private static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    static func load() -> WatchEnvelope? {
        defaults.dictionary(forKey: key).flatMap(WatchEnvelope.init)
    }

    /// Every save fully replaces the previous envelope (a sign-out wipes task titles).
    static func save(_ envelope: WatchEnvelope) {
        defaults.set(envelope.encode(), forKey: key)
    }
}
