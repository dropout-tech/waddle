import ActivityKit
import Foundation
@available(iOS 16.2, *)
struct FocusActivity: ActivityAttributes {
    /// `onBreak`: the pomodoro break, not a focus session. Optional so a state encoded by an older build still decodes.
    struct ContentState: Codable, Hashable { var endAt:Date; var paused:Bool; var seconds:Int; var onBreak:Bool? = nil }
    var accountId:String
    var epoch:String
}
