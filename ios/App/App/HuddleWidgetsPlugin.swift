import Foundation
import Capacitor
import WidgetKit
import ActivityKit

@objc(HuddleWidgetsPlugin)
public class HuddleWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HuddleWidgetsPlugin"
    public let jsName = "HuddleWidgets"
    public let pluginMethods: [CAPPluginMethod] = ["setAccount", "publish", "read", "acknowledge"].map { CAPPluginMethod(name:$0,returnType:CAPPluginReturnPromise) }
    @objc func setAccount(_ call: CAPPluginCall) {
        do { let epoch=try WidgetStore.setAccount(call.getString("accountId") ?? "");if #available(iOS 16.2, *) { Task { for a in Activity<FocusActivity>.activities where a.attributes.epoch != epoch { await a.end(nil,dismissalPolicy:.immediate) } } };WidgetCenter.shared.reloadAllTimelines();call.resolve(["epoch":epoch]) } catch {call.reject("無法開啟小工具共享空間，請檢查 App Group",nil,error)}
    }
    @objc func publish(_ call: CAPPluginCall) {
        guard let snapshot=call.getObject("snapshot") else {call.reject("缺少資料");return}
        do {try WidgetStore.publish(snapshot);updateActivity(snapshot);WidgetCenter.shared.reloadAllTimelines();call.resolve()} catch {call.reject("小工具資料已過期",nil,error)}
    }
    private func updateActivity(_ snapshot: [String:Any]) {
        guard #available(iOS 16.2, *), let focus=snapshot["focus"] as? [String:Any],let owner=snapshot["accountId"] as? String,let epoch=snapshot["epoch"] as? String else{return}
        Task { @MainActor in
            let state=WidgetStore.read()
            guard state["accountId"] as? String == owner,state["epoch"] as? String == epoch else{return}
            let running=focus["state"] as? String == "running",paused=focus["state"] as? String == "paused"
            for activity in Activity<FocusActivity>.activities where activity.attributes.accountId != owner || activity.attributes.epoch != epoch || (!running && !paused) {await activity.end(nil,dismissalPolicy:.immediate)}
            guard running || paused else{return}
            let seconds=focus["seconds"] as? Int ?? 0
            let end=(focus["endAt"] as? Double).map{Date(timeIntervalSince1970:$0/1000)} ?? Date().addingTimeInterval(Double(seconds))
            let content=ActivityContent(state:FocusActivity.ContentState(endAt:end,paused:paused,seconds:seconds),staleDate:end)
            if let activity=Activity<FocusActivity>.activities.first(where:{$0.attributes.accountId == owner && $0.attributes.epoch == epoch}) {await activity.update(content)}
            else if running && ActivityAuthorizationInfo().areActivitiesEnabled { _ = try? Activity.request(attributes:FocusActivity(accountId:owner,epoch:epoch),content:content,pushType:nil) }
        }
    }
    @objc func read(_ call: CAPPluginCall) {call.resolve(WidgetStore.read())}
    @objc func acknowledge(_ call: CAPPluginCall) {
        do {try WidgetStore.transaction { state in
            guard state["accountId"] as? String == call.getString("accountId"),state["epoch"] as? String == call.getString("epoch") else {return}
            let ids=Set(call.getArray("ids",String.self) ?? [])
            state["actions"]=(state["actions"] as? [[String:Any]] ?? []).filter{!ids.contains($0["id"] as? String ?? "")}
        };WidgetCenter.shared.reloadAllTimelines();call.resolve()} catch {call.reject("無法確認同步",nil,error)}
    }
}
class HuddleBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(HuddleWidgetsPlugin()) }
}
