import SwiftUI
import WidgetKit
import AppIntents
import ActivityKit

struct Item: Decodable, Identifiable {
    var id: String; var title: String; var subtitle: String
    var thumbnail:String?; var date: String?; var time: String?; var completed: Bool?; var actionable: Bool?
}
struct Day: Decodable, Identifiable {var date:String;var day:Int;var inMonth:Bool;var count:Int;var id:String{date}}
struct FocusInfo:Decodable {var state:String;var title:String;var endAt:Double?;var seconds:Int;var note:String}
struct WaterInfo:Decodable {var enabled:Bool;var nextAt:Double?;var count:Int}
struct Snapshot:Decodable {
    var accountId:String;var epoch:String;var generatedAt:String;var today:String
    var days:[Day];var tasks:[Item];var agenda:[Item];var notes:[Item];var boards:[Item];var focus:FocusInfo;var water:WaterInfo
}
enum Kind:String,AppEnum,CaseIterable {
    case overview,calendar,agenda,tasks,topThree="top-three",whiteboard,notebook,focusNote="focus-note",focus,water,shortcuts
    static var typeDisplayRepresentation:TypeDisplayRepresentation="小工具類型"
    static var caseDisplayRepresentations:[Kind:DisplayRepresentation]=[.overview:"月曆＋今日任務",.calendar:"可視化小月曆",.agenda:"近期行程",.tasks:"任務清單",.topThree:"今天三件事",.whiteboard:"白板",.notebook:"記事本",.focusNote:"專注記事",.focus:"專注計時",.water:"喝水提醒",.shortcuts:"隨手記入口"]
    var title:String {switch self {case .overview:return "月曆＋今日任務";case .calendar:return "可視化小月曆";case .agenda:return "近期行程";case .tasks:return "任務清單";case .topThree:return "今天三件事";case .whiteboard:return "白板";case .notebook:return "記事本";case .focusNote:return "專注記事";case .focus:return "專注計時";case .water:return "喝水提醒";case .shortcuts:return "隨手記入口"}}
}
struct Configuration:WidgetConfigurationIntent {
    static var title:LocalizedStringResource="Huddle 小工具"
    static var description=IntentDescription("選擇日曆、任務或記事，搭配你的主畫面。")
    @Parameter(title:"類型",default:.overview) var kind:Kind
    @Parameter(title:"只顯示分類（任務）") var category:String?
    @Parameter(title:"釘選筆記 ID（留空顯示最近筆記）") var noteID:String?
}
struct CompleteTask:AppIntent {
    static var title:LocalizedStringResource="完成任務"
    @Parameter(title:"任務") var taskId:String
    @Parameter(title:"帳號") var accountId:String
    @Parameter(title:"版本") var epoch:String
    init(){}
    init(_ id:String,_ account:String,_ epoch:String){taskId=id;accountId=account;self.epoch=epoch}
    func perform() async throws -> some IntentResult {try WidgetStore.complete(taskId:taskId,accountId:accountId,epoch:epoch);WidgetCenter.shared.reloadAllTimelines();return .result()}
}
enum EmptyReason {case signedOut,awaitingSync,sharingUnavailable}
struct Entry:TimelineEntry {var date:Date;var configuration:Configuration;var snapshot:Snapshot?;var pending:Set<String>;var emptyReason:EmptyReason = .signedOut}
struct Provider:AppIntentTimelineProvider {
    func placeholder(in context:Context)->Entry {Entry(date:Date(),configuration:Configuration(),snapshot:nil,pending:[])}
    func snapshot(for configuration:Configuration,in context:Context) async -> Entry {read(configuration)}
    func timeline(for configuration:Configuration,in context:Context) async -> Timeline<Entry> {
        Timeline(entries:[read(configuration)],policy:.after(Date().addingTimeInterval(900)))
    }
    func read(_ config:Configuration)->Entry {
        let state=WidgetStore.read()
        let snapshot=(state["snapshot"] as? [String:Any]).flatMap{try? JSONSerialization.data(withJSONObject:$0)}.flatMap{try? JSONDecoder().decode(Snapshot.self,from:$0)}
        let actions=state["actions"] as? [[String:Any]] ?? []
        // Why there is nothing to show: no shared container at all (App Group
        // not provisioned), signed in but the app has not published yet, or
        // simply signed out. Each gets its own hint instead of a blank card.
        let reason:EmptyReason = !WidgetStore.isAvailable ? .sharingUnavailable : ((state["accountId"] as? String ?? "").isEmpty ? .signedOut : .awaitingSync)
        return Entry(date:Date(),configuration:config,snapshot:snapshot,pending:Set(actions.compactMap{$0["taskId"] as? String}),emptyReason:reason)
    }
}
struct WidgetView:View {
    var entry:Entry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) var scheme
    var kind:Kind{entry.configuration.kind}
    var ink:Color{scheme == .dark ? Color(red:0.94,green:0.92,blue:0.86):Color(red:0.23,green:0.23,blue:0.19)}
    var paper:Color{scheme == .dark ? Color(red:0.16,green:0.16,blue:0.14):Color(red:0.99,green:0.98,blue:0.94)}
    let clay=Color(red:0.69,green:0.31,blue:0.22)
    var limit:Int{family == .systemLarge ? 5:family == .systemMedium ? 3:2}
    var emptyTitle:String{switch entry.emptyReason {case .signedOut:"開啟 Huddle 登入";case .awaitingSync:"請開啟 Huddle 同步";case .sharingUnavailable:"小工具暫時無法同步"}}
    var emptyHint:String{switch entry.emptyReason {case .signedOut:"讓今天的安排來到手邊";case .awaitingSync:"打開 App 一次，資料就會出現";case .sharingUnavailable:"此安裝版本未開啟資料共享（App Group）"}}
    func url(_ k:Kind,_ item:Item?=nil)->URL {
        var u=URLComponents();u.scheme="huddle";u.host="widget";u.path="/"+k.rawValue
        var q=[URLQueryItem(name:"accountId",value:entry.snapshot?.accountId),URLQueryItem(name:"epoch",value:entry.snapshot?.epoch)]
        if let item {q.append(URLQueryItem(name:"id",value:item.id));q.append(URLQueryItem(name:"date",value:item.date))};u.queryItems=q
        return u.url!
    }
    var body:some View {
        Group {
            if family == .accessoryCircular {Link(destination:url(kind)){Image(systemName:kind == .focus ? "timer":"square.grid.2x2")}}
            else if family == .accessoryRectangular || family == .accessoryInline {Link(destination:url(kind)){Text("Huddle · \(kind.title)").font(.caption)}}
            else if let s=entry.snapshot {
                VStack(alignment:.leading,spacing:8){
                    HStack{Text(kind.title).font(.caption.weight(.semibold));Spacer();Image("Huddle").resizable().scaledToFit().frame(width:25,height:25)}
                    content(s)
                    Spacer(minLength:0)
                    HStack(spacing:3){Image(systemName:"clock");Text(entry.pending.isEmpty ? "更新 \(String(s.generatedAt.prefix(10)))":"待同步 · 開啟 Huddle")}.font(.system(size:9)).foregroundStyle(ink.opacity(0.7)).lineLimit(1)
                }.foregroundStyle(ink).widgetURL(url(kind)).privacySensitive()
            } else {Link(destination:url(kind)){VStack(spacing:8){Image("Huddle").resizable().scaledToFit().frame(width:55,height:55);Text(emptyTitle).font(.caption).multilineTextAlignment(.center);Text(emptyHint).font(.caption2).multilineTextAlignment(.center).foregroundStyle(ink.opacity(0.7))}.foregroundStyle(ink)}}
        }.containerBackground(paper,for:.widget)
    }
    @ViewBuilder func content(_ s:Snapshot)->some View {
        switch kind {
        case .calendar: calendar(s)
        case .overview:
            if family == .systemMedium {HStack(alignment:.top,spacing:12){calendar(s);VStack(alignment:.leading,spacing:5){Text("今天，慢慢來").font(.caption);rows(Array(s.tasks.prefix(2)),s,true)}}}
            else {calendar(s);if family == .systemLarge {rows(Array(s.tasks.prefix(2)),s,true);shortcuts}}
        case .tasks,.topThree:
            let tasks=s.tasks.filter{(kind != .topThree || $0.completed != true) && (entry.configuration.category?.isEmpty != false || $0.subtitle == entry.configuration.category)}
            rows(Array(tasks.prefix(kind == .topThree ? 3:limit)),s,true)
            Link("＋ 新增任務",destination:url(.tasks,Item(id:"new",title:"",subtitle:""))).font(.caption)
        case .agenda: rows(Array(s.agenda.prefix(limit)),s)
        case .notebook:
            rows(Array(s.notes.filter{entry.configuration.noteID?.isEmpty != false || $0.id == entry.configuration.noteID}.prefix(limit)),s)
            Link("＋ 新筆記",destination:url(.notebook,Item(id:"new",title:"",subtitle:""))).font(.caption)
        case .whiteboard:
            if let raw=s.boards.first?.thumbnail,let data=Data(base64Encoded:raw.replacingOccurrences(of:"data:image/png;base64,",with:"")),let image=UIImage(data:data) {Image(uiImage:image).resizable().scaledToFit().frame(maxHeight:family == .systemLarge ? 130:70).clipShape(RoundedRectangle(cornerRadius:8))}
            rows(Array(s.boards.prefix(1)),s);Link("開啟白板 ↗",destination:url(.whiteboard,s.boards.first)).font(.caption)
        case .focusNote: Text(s.focus.title).font(.subheadline);Text(s.focus.note.isEmpty ? "想法來了，先留下來。":s.focus.note).font(.caption).lineLimit(3);Link("記一筆 ↗",destination:url(.focusNote)).font(.headline).foregroundStyle(clay)
        case .focus:
            Text(s.focus.title).font(.caption).lineLimit(1)
            if s.focus.state == "running",let end=s.focus.endAt,end>Date().timeIntervalSince1970*1000 {Text(timerInterval:Date()...Date(timeIntervalSince1970:end/1000),countsDown:true).font(.system(size:32,weight:.medium,design:.rounded)).monospacedDigit()}
            else {Text(String(format:"%02d:%02d",s.focus.seconds/60,s.focus.seconds%60)).font(.system(size:32,weight:.medium,design:.rounded)).monospacedDigit()}
            Link(s.focus.state == "idle" ? "開始專注 ↗":"開啟計時控制 ↗",destination:url(.focus)).font(.caption).foregroundStyle(clay)
        case .water: Image(systemName:"drop").font(.title2);Text("喝口水，休息一下").font(.subheadline);Text(s.water.enabled ? "開啟記錄或稍後提醒":"提醒尚未開啟").font(.caption);Link("喝了 ／ 稍後 ↗",destination:url(.water)).font(.caption).foregroundStyle(clay)
        case .shortcuts: Text("想法來了，先留下來。").font(.caption);shortcuts
        }
    }
    var shortcuts:some View {HStack{ForEach([Kind.whiteboard,.notebook,.focusNote],id:\.self){k in Link(destination:url(k)){VStack(spacing:5){Image(systemName:k == .whiteboard ? "rectangle.3.group":k == .notebook ? "book":"pencil.line");Text(k.title).font(.system(size:10))}.frame(maxWidth:.infinity).padding(.vertical,8)}}}}
    @ViewBuilder func rows(_ items:[Item],_ s:Snapshot,_ task:Bool=false)->some View {
        if items.isEmpty {Text("這裡還有空間，慢慢安排。").font(.caption).foregroundStyle(.secondary)}
        ForEach(items){item in HStack(spacing:7){
            if task,item.actionable == true,item.completed != true,!entry.pending.contains(item.id){Button(intent:CompleteTask(item.id,s.accountId,s.epoch)){Image(systemName:"square").font(.title3)}.buttonStyle(.plain)}
            else if task {Image(systemName:entry.pending.contains(item.id) ? "clock":item.completed == true ? "checkmark.square":"arrow.up.right.square").foregroundStyle(clay)}
            else if let time=item.time {Text(time).font(.caption).monospacedDigit()}
            Link(destination:url(kind,item)){VStack(alignment:.leading,spacing:2){Text(item.title).font(.caption).lineLimit(1);if family == .systemLarge {Text(item.subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(2)}}};Spacer(minLength:0)
        }.padding(.vertical,3)}
    }
    func calendar(_ s:Snapshot)->some View {
        VStack(spacing:3){Text(String(s.today.prefix(7))).font(.subheadline.weight(.semibold)).frame(maxWidth:.infinity,alignment:.leading)
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:1),count:7),spacing:3){ForEach(["日","一","二","三","四","五","六"],id:\.self){Text($0).font(.system(size:9)).foregroundStyle(.secondary)}
                ForEach(s.days){day in Text("\(day.day)").font(.system(size:family == .systemLarge ? 12:10,weight:day.date == s.today ? .bold:.regular)).frame(maxWidth:.infinity,minHeight:family == .systemLarge ? 21:14).background(day.date == s.today ? clay:Color.clear,in:Circle()).foregroundStyle(day.date == s.today ? Color.white:ink.opacity(day.inMonth ? 1:0.4)).overlay(alignment:.bottom){if day.count>0{Circle().fill(day.date == s.today ? Color.white:clay).frame(width:2,height:2)}}}
            }
        }
    }
}
struct HuddleWidgets:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:"HuddleWidgets",intent:Configuration.self,provider:Provider()){entry in WidgetView(entry:entry)}
            .configurationDisplayName("Huddle · 今天在手邊")
            .description("月曆、任務、白板、記事、專注與喝水。長按編輯可選擇 11 款內容。")
            .supportedFamilies([.systemSmall,.systemMedium,.systemLarge,.accessoryCircular,.accessoryRectangular,.accessoryInline])
    }
}

struct HuddleFocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for:FocusActivity.self) { context in
            HStack {
                Image("Huddle").resizable().scaledToFit().frame(width:42,height:42)
                VStack(alignment:.leading){Text("Huddle · 專注").font(.headline);Text(context.state.paused ? "休息一下，等等繼續":"慢慢來，先專心一件事").font(.caption)}
                Spacer()
                if !context.state.paused && context.state.endAt>Date(){Text(timerInterval:Date()...context.state.endAt,countsDown:true).monospacedDigit().frame(width:72)}
                else {Text(String(format:"%02d:%02d",context.state.seconds/60,context.state.seconds%60)).monospacedDigit()}
            }.padding().activityBackgroundTint(Color(red:0.99,green:0.98,blue:0.94)).widgetURL(URL(string:"huddle://widget/focus"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading){Image("Huddle").resizable().scaledToFit().frame(width:36,height:36)}
                DynamicIslandExpandedRegion(.trailing){Text("專注中")}
                DynamicIslandExpandedRegion(.bottom){if !context.state.paused && context.state.endAt>Date(){Text(timerInterval:Date()...context.state.endAt,countsDown:true).monospacedDigit()}else{Text("暫停中")}}
            } compactLeading: { Image(systemName:"timer") } compactTrailing: { Text(context.state.paused ? "暫停":"專注") } minimal: {Image(systemName:"timer")}
                .widgetURL(URL(string:"huddle://widget/focus"))
        }
    }
}
@main struct HuddleWidgetBundle: WidgetBundle {
    var body: some Widget { HuddleWidgets(); HuddleFocusLiveActivity() }
}
