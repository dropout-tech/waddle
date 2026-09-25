import ActivityKit
import Foundation
@available(iOS 16.2, *)
struct FocusActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable { var endAt:Date; var paused:Bool; var seconds:Int }
    var accountId:String
    var epoch:String
}
