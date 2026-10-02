import SwiftUI
import WidgetKit
import AppIntents
import ActivityKit

struct Item: Decodable, Identifiable {
    var id: String; var title: String; var subtitle: String
    var thumbnail:String?; var date: String?; var time: String?; var completed: Bool?; var actionable: Bool?
}
struct Day: Decodable, Identifiable {var date:String;var day:Int;var inMonth:Bool;var count:Int;var id:String{date}}
struct FocusInfo:Decodable {var mode:String?;var state:String;var title:String;var endAt:Double?;var seconds:Int;var note:String
    /// Session length in seconds (for the lock-screen progress ring). Optional: older app builds don't send it.
    var total:Int?}
struct WaterInfo:Decodable {var enabled:Bool;var nextAt:Double?;var count:Int}
/// One scheduled slot for the 本週時間表 widget (today + 6 days, "HH:mm", "#rrggbb").
struct Slot:Decodable {var date:String;var start:String;var end:String;var title:String;var color:String}
struct Snapshot:Decodable {
    var accountId:String;var epoch:String;var generatedAt:String;var today:String
    var days:[Day];var tasks:[Item];var agenda:[Item];var notes:[Item];var boards:[Item];var focus:FocusInfo;var water:WaterInfo
    /// Optional: snapshots written by older app builds don't have it.
    var week:[Slot]?
    /// 「我的 Huddle」 (lib/widgets/pet.ts). Optional for the same reason.
    var pet:PetInfo?
    /// "zh-TW" | "en" — the app's language (pet.lang wins when present). Optional.
    var locale:String?
    /// 大型月曆: 21 days from this week's Monday (HuddleMonthSticky.swift). Optional.
    var span:[SpanDay]?
    /// 便條紙: newest sticky notes as plain text. Optional.
    var stickies:[StickyInfo]?
}
struct PetInfo:Decodable {var adopted:Bool;var name:String;var color:String;var accessory:String;var lang:String;var overdue:Int;var overdueLine:String;var lines:[String]}
enum Kind:String,AppEnum,CaseIterable {
    case overview,calendar,agenda,week,tasks,topThree="top-three",whiteboard,notebook,focusNote="focus-note",focus,shortcuts,pet,month,sticky
    static var typeDisplayRepresentation:TypeDisplayRepresentation="小工具類型"
    static var caseDisplayRepresentations:[Kind:DisplayRepresentation]=[.overview:"月曆＋今日任務",.calendar:"可視化小月曆",.agenda:"近期行程",.week:"本週時間表",.tasks:"任務清單",.topThree:"今天三件事",.whiteboard:"白板",.notebook:"記事本",.focusNote:"專注記事",.focus:"專注計時",.shortcuts:"隨手記入口",.pet:"我的 Huddle",.month:"大型月曆",.sticky:"便條紙"]
    var title:String {switch self {case .overview:return "月曆＋今日任務";case .calendar:return "可視化小月曆";case .agenda:return "近期行程";case .week:return "本週時間表";case .tasks:return "任務清單";case .topThree:return "今天三件事";case .whiteboard:return "白板";case .notebook:return "記事本";case .focusNote:return "專注記事";case .focus:return "專注計時";case .shortcuts:return "隨手記入口";case .pet:return "我的 Huddle";case .month:return "大型月曆";case .sticky:return "便條紙"}}
    /// Gallery blurb (「新增小工具」畫面每款各自的說明).
    var blurb:String {switch self {
        case .overview:return "本月月曆，加上今天要做的事，直接打勾。"
        case .calendar:return "一眼看完這個月，點日期打開當天。"
        case .agenda:return "接下來七天排了哪些行程。"
        case .week:return "七天 × 全天時間表；大尺寸可切換上午／下午／晚上。"
        case .tasks:return "今天的任務，在主畫面直接打勾。長按編輯可只看某個分類。"
        case .topThree:return "只放今天最重要的三件事，直接打勾。"
        case .whiteboard:return "最近的白板縮圖，點一下接著畫。"
        case .notebook:return "最近的筆記；長按編輯可釘選一篇。"
        case .focusNote:return "專注時冒出的想法，先記下來。"
        case .focus:return "在主畫面直接開始、暫停、結束專注。"
        case .shortcuts:return "白板、記事本、專注記事，一鍵打開。"
        case .pet:return "你領養的企鵝：提醒你接下來的事，點牠會呱一聲。"
        case .month:return "三週大月曆：任務、行程一格一格看清楚。"
        case .sticky:return "最近的便條紙，像備忘錄一樣放在手邊。"
    }}
    /// Each split-out widget's own identifier. The legacy configurable widget
    /// keeps "HuddleWidgets" so copies already on a home screen survive.
    var widgetKind:String {"HuddleWidget.\(rawValue)"}
    var families:[WidgetFamily] {switch self {
        case .overview:return [.systemMedium,.systemLarge]
        case .calendar:return [.systemSmall,.systemLarge]
        case .week:return [.systemMedium,.systemLarge]
        case .focusNote:return [.systemSmall,.systemMedium]
        // Lock Screen versions (HuddleLockScreen.swift) ride on the same kinds.
        case .topThree:return [.systemSmall,.systemMedium,.accessoryCircular,.accessoryRectangular,.accessoryInline]
        case .shortcuts:return [.systemMedium]
        case .pet:return [.systemSmall,.systemMedium,.systemLarge,.accessoryCircular,.accessoryRectangular,.accessoryInline]
        case .focus:return [.systemSmall,.systemMedium,.accessoryCircular,.accessoryRectangular,.accessoryInline]
        case .month:return [.systemLarge,.systemExtraLarge]
        case .sticky:return [.systemSmall,.systemMedium,.accessoryCircular,.accessoryRectangular,.accessoryInline]
        case .agenda,.tasks,.whiteboard,.notebook:return [.systemSmall,.systemMedium,.systemLarge]
    }}
}
/// What an entry needs from its configuration, whichever intent (if any) backs it.
protocol HuddleIntent:WidgetConfigurationIntent {var entryKind:Kind? {get};var entryCategory:String? {get};var entryNoteID:String? {get}}
struct Configuration:HuddleIntent {
    static var title:LocalizedStringResource="Huddle 小工具（可自訂）"
    static var description=IntentDescription("選擇日曆、任務或記事，搭配你的主畫面。")
    @Parameter(title:"類型",default:.overview) var kind:Kind
    @Parameter(title:"只顯示分類（任務）") var category:String?
    @Parameter(title:"釘選筆記 ID（留空顯示最近筆記）") var noteID:String?
    var entryKind:Kind? {kind};var entryCategory:String? {category};var entryNoteID:String? {noteID}
}
struct TaskFilter:HuddleIntent {
    static var title:LocalizedStringResource="任務篩選"
    static var description=IntentDescription("只顯示某個分類的任務。")
    @Parameter(title:"只顯示分類（留空＝全部）") var category:String?
    var entryKind:Kind? {nil};var entryCategory:String? {category};var entryNoteID:String? {nil}
}
struct NotePick:HuddleIntent {
    static var title:LocalizedStringResource="釘選筆記"
    static var description=IntentDescription("留空顯示最近的筆記。")
    @Parameter(title:"釘選筆記 ID（留空顯示最近筆記）") var noteID:String?
    var entryKind:Kind? {nil};var entryCategory:String? {nil};var entryNoteID:String? {noteID}
}
// MARK: Interactive buttons (iOS 17 Button(intent:)). They only ever write the
// App Group queue (WidgetStore); the app replays it against the server.
/// Name kept from the complete-only version; now ticks *and* unticks.
struct CompleteTask:AppIntent {
    static var title:LocalizedStringResource="完成／取消完成任務"
    static var isDiscoverable=false
    @Parameter(title:"任務") var taskId:String
    @Parameter(title:"帳號") var accountId:String
    @Parameter(title:"版本") var epoch:String
    init(){}
    init(_ id:String,_ account:String,_ epoch:String){taskId=id;accountId=account;self.epoch=epoch}
    func perform() async throws -> some IntentResult {try WidgetStore.toggleTask(taskId:taskId,accountId:accountId,epoch:epoch);WidgetCenter.shared.reloadAllTimelines();return .result()}
}
struct FocusControl:AppIntent {
    static var title:LocalizedStringResource="專注計時控制"
    static var isDiscoverable=false
    @Parameter(title:"動作") var op:String
    @Parameter(title:"帳號") var accountId:String
    @Parameter(title:"版本") var epoch:String
    init(){}
    init(_ op:String,_ account:String,_ epoch:String){self.op=op;accountId=account;self.epoch=epoch}
    func perform() async throws -> some IntentResult {try WidgetStore.queueFocus(op:op,accountId:accountId,epoch:epoch);WidgetCenter.shared.reloadAllTimelines();return .result()}
}
/// 本週時間表 time window. `all` is the compressed whole day; the other three
/// partition it, so nothing scheduled can fall between windows.
enum WeekWindow:String,CaseIterable {
    case all,morning,afternoon,evening
    var label:String {switch self {case .all:return "全天";case .morning:return "上午";case .afternoon:return "下午";case .evening:return "晚上"}}
}
struct SetWeekWindow:AppIntent {
    static var title:LocalizedStringResource="切換時段"
    static var isDiscoverable=false
    @Parameter(title:"時段") var window:String
    init(){}
    init(_ w:WeekWindow){window=w.rawValue}
    func perform() async throws -> some IntentResult {try WidgetStore.setWeekWindow(window);WidgetCenter.shared.reloadAllTimelines();return .result()}
}
struct PokePet:AppIntent {
    static var title:LocalizedStringResource="戳一下企鵝"
    static var isDiscoverable=false
    init(){}
    func perform() async throws -> some IntentResult {try WidgetStore.pokePet();WidgetCenter.shared.reloadAllTimelines();return .result()}
}
/// How long a 「呱」 line stays up after a tap before the bubble goes back to reminders.
let petPokeLifetime:TimeInterval=600
enum EmptyReason {case signedOut,awaitingSync,sharingUnavailable}
/// Local calendar day key ("yyyy-MM-dd"), shared by views, intents and the entry loader (not main-actor bound).
let huddleDayFormat:DateFormatter={let f=DateFormatter();f.calendar=Calendar(identifier:.gregorian);f.locale=Locale(identifier:"en_US_POSIX");f.dateFormat="yyyy-MM-dd";return f}()
struct FocusOp {var op:String;var at:Date}
struct Entry:TimelineEntry {
    var date:Date;var kind:Kind;var category:String?=nil;var noteID:String?=nil
    var snapshot:Snapshot?
    /// Queued-but-unsynced task changes: task id → target completed state (optimistic UI).
    var pendingTasks:[String:Bool]=[:]
    var focusOps:[FocusOp]=[]
    var pendingCount:Int=0
    var window:WeekWindow = .all
    /// Penguin taps so far and when the last one was (「我的 Huddle」).
    var petPokeN:Int=0;var petPokeAt:Date?=nil
    var emptyReason:EmptyReason = .signedOut
    /// Set for the Lock-Screen-only widgets (HuddleLockScreen.swift), plus their chosen styles.
    var lock:LockKind?=nil;var circleStyle:String="";var rectStyle:String=""
}
/// A chosen window falls back to 全天 after an hour, so the widget never sits on 晚上 the next morning.
let weekWindowLifetime:TimeInterval=3600
func loadEntry(kind:Kind,category:String?=nil,noteID:String?=nil,now:Date=Date())->Entry {
    let state=WidgetStore.read()
    let snapshot=(state["snapshot"] as? [String:Any]).flatMap{try? JSONSerialization.data(withJSONObject:$0)}.flatMap{try? JSONDecoder().decode(Snapshot.self,from:$0)}
    let actions=state["actions"] as? [[String:Any]] ?? []
    // Why there is nothing to show: no shared container at all (App Group
    // not provisioned), signed in but the app has not published yet, or
    // simply signed out. Each gets its own hint instead of a blank card.
    let reason:EmptyReason = !WidgetStore.isAvailable ? .sharingUnavailable : ((state["accountId"] as? String ?? "").isEmpty ? .signedOut : .awaitingSync)
    var e=Entry(date:now,kind:kind,category:category,noteID:noteID,snapshot:snapshot,pendingCount:actions.count,emptyReason:reason)
    for a in actions where WidgetStore.isTaskAction(a) {if let id=a["taskId"] as? String {e.pendingTasks[id]=a["completed"] as? Bool ?? true}}
    e.focusOps=actions.filter{$0["type"] as? String == "focus"}.compactMap{a in
        guard let op=a["op"] as? String,let at=a["at"] as? Double else {return nil}
        return FocusOp(op:op,at:Date(timeIntervalSince1970:at/1000))}
    if let w=state["weekWindow"] as? [String:Any],let v=(w["value"] as? String).flatMap(WeekWindow.init(rawValue:)),let at=w["at"] as? Double,
       now.timeIntervalSince1970-at/1000 < weekWindowLifetime {e.window=v}
    if let poke=state["petPoke"] as? [String:Any] {e.petPokeN=poke["n"] as? Int ?? 0;e.petPokeAt=(poke["at"] as? Double).map{Date(timeIntervalSince1970:$0/1000)}}
    return e
}
func makeTimeline(_ e:Entry)->Timeline<Entry> {
    if e.lock != nil || e.kind == .month || e.kind == .sticky {return glanceTimeline(e)}
    guard e.kind == .pet else {return Timeline(entries:[e],policy:.after(e.date.addingTimeInterval(900)))}
    // The penguin's bubble changes on its own: when today's next item starts,
    // when water comes due, when a 「呱」 wears off, and hourly for a fresh line.
    let now=e.date
    var at:[Date]=[]
    if let s=e.snapshot {
        for slot in s.week ?? [] where slot.date == s.today {
            let p=slot.start.split(separator:":").compactMap{Int($0)}
            if p.count == 2,let d=Calendar.current.date(bySettingHour:p[0],minute:p[1],second:0,of:now) {at.append(d.addingTimeInterval(60))}
        }
        if let next=s.water.nextAt {at.append(Date(timeIntervalSince1970:next/1000))}
    }
    if let poke=e.petPokeAt {at.append(poke.addingTimeInterval(petPokeLifetime+1))}
    let hour=Calendar.current.dateInterval(of:.hour,for:now)?.end ?? now.addingTimeInterval(3600)
    for h in 0..<6 {at.append(hour.addingTimeInterval(Double(h)*3600))}
    let future=Array(Set(at.filter{$0 > now && $0 < now.addingTimeInterval(6*3600)})).sorted().prefix(12)
    let entries=[e]+future.map{loadEntry(kind:e.kind,category:e.category,noteID:e.noteID,now:$0)}
    return Timeline(entries:entries,policy:.after(now.addingTimeInterval(1800)))
}
struct IntentProvider<I:HuddleIntent>:AppIntentTimelineProvider {
    var fixed:Kind?=nil
    func entry(_ c:I)->Entry {loadEntry(kind:fixed ?? c.entryKind ?? .overview,category:c.entryCategory,noteID:c.entryNoteID)}
    func placeholder(in context:Context)->Entry {Entry(date:Date(),kind:fixed ?? .overview,snapshot:nil)}
    func snapshot(for configuration:I,in context:Context) async -> Entry {entry(configuration)}
    func timeline(for configuration:I,in context:Context) async -> Timeline<Entry> {makeTimeline(entry(configuration))}
}
struct FixedProvider:TimelineProvider {
    var kind:Kind
    func placeholder(in context:Context)->Entry {Entry(date:Date(),kind:kind,snapshot:nil)}
    func getSnapshot(in context:Context,completion:@escaping(Entry)->Void) {completion(loadEntry(kind:kind))}
    func getTimeline(in context:Context,completion:@escaping(Timeline<Entry>)->Void) {completion(makeTimeline(loadEntry(kind:kind)))}
}
struct WidgetView:View {
    var entry:Entry
    @Environment(\.widgetFamily) var family
    @Environment(\.colorScheme) private var systemScheme
    /// Home Screen widgets stay on the light (cream) look in dark mode — owner's call
    /// (2026-10-02). Lock Screen faces (accessory families) keep the system scheme, which
    /// tints them itself. iOS 18's 著色／透明 icon mode still overrides colours and cannot be blocked.
    var scheme:ColorScheme {(entry.lock != nil || isAccessory) ? systemScheme:.light}
    var kind:Kind{entry.kind}
    var ink:Color{scheme == .dark ? Color(red:0.94,green:0.92,blue:0.86):Color(red:0.23,green:0.23,blue:0.19)}
    var paper:Color{scheme == .dark ? Color(red:0.16,green:0.16,blue:0.14):Color(red:0.99,green:0.98,blue:0.94)}
    let clay=Color(red:0.69,green:0.31,blue:0.22)
    var limit:Int{family == .systemLarge ? 5:family == .systemMedium ? 3:2}
    var emptyTitle:String{switch entry.emptyReason {case .signedOut:"開啟 Huddle 登入";case .awaitingSync:"請開啟 Huddle 同步";case .sharingUnavailable:"小工具暫時無法同步"}}
    var emptyHint:String{switch entry.emptyReason {case .signedOut:"讓今天的安排來到手邊";case .awaitingSync:"打開 App 一次，資料就會出現";case .sharingUnavailable:"此安裝版本未開啟資料共享（App Group）"}}
    // Every tap: huddle://widget/<kind>?accountId=&epoch=[&id=][&date=]. The app
    // maps it to a real screen in one place (lib/widgets/model.ts widgetPath).
    func url(_ k:Kind,_ item:Item?=nil,date:String?=nil)->URL {
        var u=URLComponents();u.scheme="huddle";u.host="widget";u.path="/"+k.rawValue
        var q=[URLQueryItem(name:"accountId",value:entry.snapshot?.accountId),URLQueryItem(name:"epoch",value:entry.snapshot?.epoch)]
        if let item {q.append(URLQueryItem(name:"id",value:item.id))}
        if let d=date ?? item?.date {q.append(URLQueryItem(name:"date",value:d))};u.queryItems=q
        return u.url!
    }
    var body:some View {
        Group {
            // Every Lock Screen face (HuddleLockScreen.swift). Owner chose
            // "always show" for these, so no privacySensitive here.
            if entry.lock != nil || isAccessory {accessoryView}
            else if kind == .pet,let s=entry.snapshot {petPanel(s).foregroundStyle(ink).widgetURL(petLink(s)).privacySensitive()}
            else if let s=entry.snapshot {
                // Calendar-heavy widgets fill the whole frame: drop the title row
                // (the month label + mascot stand in for it) and the "updated"
                // footer unless there's something pending, or the grid overflows
                // and iOS clips the top edge.
                let dense = kind == .overview || kind == .calendar || kind == .week || kind == .month || kind == .sticky
                // Focus is a button panel: no title row or "updated"
                // footer (it'd push the 44pt buttons out of a small widget).
                let panel = kind == .focus
                VStack(alignment:.leading,spacing:dense || panel ? 4:8){
                    if !dense && !panel {HStack{
                        Text(kind.title).font(.caption.weight(.semibold));Spacer()
                        // 「新增任務」 lives in the header so three checkbox rows + the sync footer fit a medium widget
                        // (small widgets ignore inner links, so it's medium/large only).
                        if (kind == .tasks || kind == .topThree) && family != .systemSmall {Link(destination:url(.tasks,Item(id:"new",title:"",subtitle:""))){Label("新增",systemImage:"plus").font(.caption2.weight(.semibold)).padding(.horizontal,8).padding(.vertical,4).background(ink.opacity(0.07),in:Capsule())}}
                        Image("Huddle").resizable().scaledToFit().frame(width:25,height:25)}}
                    content(s)
                    Spacer(minLength:0)
                    if (!dense && !panel) || entry.pendingCount>0 {HStack(spacing:3){Image(systemName:"clock");Text(entry.pendingCount == 0 ? "更新 \(String(s.generatedAt.prefix(10)))":"待同步 · 開啟 Huddle")}.font(.system(size:9)).foregroundStyle(ink.opacity(0.7)).lineLimit(1)}
                }.foregroundStyle(ink).widgetURL(kind == .sticky ? stickyURL(s.stickies?.first):url(kind)).privacySensitive()
            } else {Link(destination:url(kind)){VStack(spacing:8){Image("Huddle").resizable().scaledToFit().frame(width:55,height:55);Text(emptyTitle).font(.caption).multilineTextAlignment(.center);Text(emptyHint).font(.caption2).multilineTextAlignment(.center).foregroundStyle(ink.opacity(0.7))}.foregroundStyle(ink)}}
        }.containerBackground(paper,for:.widget).environment(\.colorScheme,scheme)
    }
    @ViewBuilder func content(_ s:Snapshot)->some View {
        switch kind {
        case .calendar: calendar(s)
        case .overview:
            if family == .systemMedium {HStack(alignment:.top,spacing:12){calendar(s);VStack(alignment:.leading,spacing:5){Text("今天，慢慢來").font(.caption);rows(Array(s.tasks.prefix(2)),s,true)}}}
            else {calendar(s);if family == .systemLarge {rows(Array(s.tasks.prefix(4)),s,true);shortcuts}}
        case .week: week(s)
        case .tasks,.topThree:
            let tasks=s.tasks.filter{(kind != .topThree || $0.completed != true) && (entry.category?.isEmpty != false || $0.subtitle == entry.category)}
            VStack(alignment:.leading,spacing:2){rows(Array(tasks.prefix(kind == .topThree ? 3:limit)),s,true)}
        case .agenda: rows(Array(s.agenda.prefix(limit)),s)
        case .notebook:
            rows(Array(s.notes.filter{entry.noteID?.isEmpty != false || $0.id == entry.noteID}.prefix(limit)),s)
            Link("＋ 新筆記",destination:url(.notebook,Item(id:"new",title:"",subtitle:""))).font(.caption)
        case .whiteboard:
            if let raw=s.boards.first?.thumbnail,let data=Data(base64Encoded:raw.replacingOccurrences(of:"data:image/png;base64,",with:"")),let image=UIImage(data:data) {Image(uiImage:image).resizable().scaledToFit().frame(maxHeight:family == .systemLarge ? 130:70).clipShape(RoundedRectangle(cornerRadius:8))}
            rows(Array(s.boards.prefix(1)),s);Link("開啟白板 ↗",destination:url(.whiteboard,s.boards.first)).font(.caption)
        case .focusNote: Text(s.focus.title).font(.subheadline);Text(s.focus.note.isEmpty ? "想法來了，先留下來。":s.focus.note).font(.caption).lineLimit(3);Link("記一筆 ↗",destination:url(.focusNote)).font(.headline).foregroundStyle(clay)
        case .focus: focusPanel(s)
        case .shortcuts: Text("想法來了，先留下來。").font(.caption);shortcuts
        case .pet: petPanel(s)
        case .month: if family == .systemLarge || family == .systemExtraLarge {bigMonth(s)} else {calendar(s)}
        case .sticky: stickyPanel(s)
        }
    }
    var shortcuts:some View {HStack{ForEach([Kind.whiteboard,.notebook,.focusNote],id:\.self){k in Link(destination:url(k)){VStack(spacing:5){Image(systemName:k == .whiteboard ? "rectangle.3.group":k == .notebook ? "book":"pencil.line");Text(k.title).font(.system(size:10))}.frame(maxWidth:.infinity).padding(.vertical,8)}}}}
    @ViewBuilder func rows(_ items:[Item],_ s:Snapshot,_ task:Bool=false)->some View {
        if items.isEmpty {Text("這裡還有空間，慢慢安排。").font(.caption).foregroundStyle(.secondary)}
        ForEach(items){item in
            // Optimistic: a queued tick/untick shows as done/undone right away;
            // tapping again before the app syncs cancels it.
            let done=entry.pendingTasks[item.id] ?? (item.completed == true)
            HStack(spacing:7){
            if task,item.actionable == true {Button(intent:CompleteTask(item.id,s.accountId,s.epoch)){Image(systemName:done ? "checkmark.square.fill":"square").font(.title3).foregroundStyle(done ? clay:ink).frame(width:30,height:26).contentShape(Rectangle())}.buttonStyle(.plain)}
            else if task {Image(systemName:item.completed == true ? "checkmark.square":"arrow.up.right.square").foregroundStyle(clay)}
            else if let time=item.time {Text(time).font(.caption).monospacedDigit()}
            Link(destination:url(kind,item)){VStack(alignment:.leading,spacing:2){Text(item.title).font(.caption).lineLimit(1).strikethrough(task && done).opacity(task && done ? 0.55:1);if family == .systemLarge && kind != .overview {Text(item.subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(2)}}};Spacer(minLength:0)
            }.padding(.vertical,task ? 0:3)}
    }
    func calendar(_ s:Snapshot)->some View {
        VStack(spacing:2){HStack(spacing:4){Text(String(s.today.prefix(7))).font(.subheadline.weight(.semibold));Spacer(minLength:0);Image("Huddle").resizable().scaledToFit().frame(width:20,height:20)}
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:1),count:7),spacing:family == .systemLarge ? 2:1){ForEach(["日","一","二","三","四","五","六"],id:\.self){Text($0).font(.system(size:9)).foregroundStyle(.secondary)}
                ForEach(s.days){day in
                    let cell=Text("\(day.day)").font(.system(size:family == .systemLarge ? 12:10,weight:day.date == s.today ? .bold:.regular)).frame(maxWidth:.infinity,minHeight:family == .systemLarge ? 19:13).background(day.date == s.today ? clay:Color.clear,in:Circle()).foregroundStyle(day.date == s.today ? Color.white:ink.opacity(day.inMonth ? 1:0.4)).overlay(alignment:.bottom){if day.count>0{Circle().fill(day.date == s.today ? Color.white:clay).frame(width:2,height:2)}}
                    // Tap a date → that day in the app's week view (small widgets only support one tap target).
                    if family == .systemSmall {cell} else {Link(destination:url(.week,date:day.date)){cell}}
                }
            }
        }
    }
    // MARK: 本週時間表 — 7 day columns × the hours that have something scheduled.
    static var dayFormat:DateFormatter {huddleDayFormat}
    func minutes(_ hhmm:String)->Int {let p=hhmm.split(separator:":");return p.count == 2 ? min(1440,(Int(p[0]) ?? 0)*60+(Int(p[1]) ?? 0)):0}
    func color(_ hex:String)->Color {
        var v:UInt64=0
        guard hex.count == 7,hex.hasPrefix("#"),Scanner(string:String(hex.dropFirst())).scanHexInt64(&v) else {return clay}
        return Color(red:Double((v>>16)&0xff)/255,green:Double((v>>8)&0xff)/255,blue:Double(v&0xff)/255)
    }
    /// The whole day, 07–23, stretched to cover anything scheduled earlier or
    /// later. 上午／下午／晚上 split that same span at 12:00 and 18:00, so every
    /// slot is visible in 全天 and in exactly the windows it overlaps.
    func hourRange(_ slots:[Slot],_ window:WeekWindow)->(Int,Int) {
        var lo=7,hi=23
        if let first=slots.map({minutes($0.start)}).min() {lo=min(lo,first/60)}
        if let last=slots.map({minutes($0.end)}).max() {hi=max(hi,min(24,(last+59)/60))}
        switch window {case .all:return (lo,hi);case .morning:return (lo,12);case .afternoon:return (12,18);case .evening:return (18,hi)}
    }
    /// 全天／上午／下午／晚上. Pills look small, but each hit area is a full 44pt tall quarter of the row.
    func windowBar(_ current:WeekWindow)->some View {
        HStack(spacing:4){ForEach(WeekWindow.allCases,id:\.self){w in
            Button(intent:SetWeekWindow(w)){
                Text(w.label).font(.system(size:11,weight:w == current ? .semibold:.regular))
                    .frame(maxWidth:.infinity).frame(height:24)
                    .background(w == current ? clay:ink.opacity(0.07),in:Capsule())
                    .foregroundStyle(w == current ? Color.white:ink)
                    .frame(maxWidth:.infinity,minHeight:44).contentShape(Rectangle())
            }.buttonStyle(.plain)
        }}
    }
    func week(_ s:Snapshot)->some View {
        let cal=Calendar(identifier:.gregorian)
        let start=Self.dayFormat.date(from:s.today) ?? entry.date
        let dates=(0..<7).map{cal.date(byAdding:.day,value:$0,to:start) ?? start}
        let keys=dates.map{Self.dayFormat.string(from:$0)}
        let large=family == .systemLarge
        // Medium has no room for the switcher: it always shows the whole day.
        let window:WeekWindow = large ? entry.window:.all
        let all=(s.week ?? []).filter{keys.contains($0.date)}
        let (lo,hi)=hourRange(all,window)
        let slots=all.filter{minutes($0.end) > lo*60 && minutes($0.start) < hi*60}
        let gutter:CGFloat=14,gap:CGFloat=2
        let step=hi-lo <= 6 ? 1:hi-lo <= 12 ? 2:(large ? 2:4)
        let now=cal.component(.hour,from:entry.date)*60+cal.component(.minute,from:entry.date)
        let nowToday=Self.dayFormat.string(from:entry.date) == s.today && now >= lo*60 && now <= hi*60
        return VStack(spacing:3){
            HStack(spacing:gap){
                Text(large ? "本週":"").font(.system(size:8,weight:.semibold)).frame(width:gutter,alignment:.leading).fixedSize()
                ForEach(0..<7,id:\.self){i in
                    let d=dates[i],today=keys[i] == s.today
                    VStack(spacing:0){Text(["日","一","二","三","四","五","六"][cal.component(.weekday,from:d)-1]).font(.system(size:8));Text("\(cal.component(.day,from:d))").font(.system(size:large ? 12:10,weight:today ? .bold:.regular))}
                        .frame(maxWidth:.infinity).padding(.vertical,1)
                        .background(today ? clay:Color.clear,in:RoundedRectangle(cornerRadius:5))
                        .foregroundStyle(today ? Color.white:ink)
                }
            }
            GeometryReader{geo in
                let h=geo.size.height,colW=(geo.size.width-gutter-gap*7)/7,perMin=h/CGFloat(max(1,hi-lo)*60)
                ZStack(alignment:.topLeading){
                    ForEach(Array(stride(from:lo,through:hi,by:step)),id:\.self){hr in
                        let y=CGFloat((hr-lo)*60)*perMin
                        Rectangle().fill(ink.opacity(0.12)).frame(width:geo.size.width-gutter,height:0.5).offset(x:gutter,y:y)
                        Text("\(hr)").font(.system(size:7)).monospacedDigit().foregroundStyle(ink.opacity(0.55)).frame(width:gutter-2,alignment:.leading).offset(y:min(max(0,y-4),h-9))
                    }
                    ForEach(Array(keys.enumerated()),id:\.offset){i,key in
                        Link(destination:url(.week,date:key)){
                            ZStack(alignment:.topLeading){
                                RoundedRectangle(cornerRadius:4).fill(key == s.today ? clay.opacity(0.10):ink.opacity(0.035))
                                ForEach(Array(slots.filter{$0.date == key}.enumerated()),id:\.offset){_,slot in
                                    let a=max(minutes(slot.start),lo*60),b=min(minutes(slot.end),hi*60)
                                    let bh=max(CGFloat(b-a)*perMin,3),tint=color(slot.color)
                                    HStack(spacing:0){
                                        Rectangle().fill(tint).frame(width:2)
                                        if large && bh >= 11 {Text(slot.title).font(.system(size:8,weight:.medium)).multilineTextAlignment(.leading).lineLimit(bh >= 22 ? 2:1).minimumScaleFactor(0.8).padding(.leading,2).padding(.top,1).frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)}
                                        else {Spacer(minLength:0)}
                                    }
                                    .frame(width:colW-2,height:bh).background(tint.opacity(0.28)).clipShape(RoundedRectangle(cornerRadius:3))
                                    .offset(x:1,y:CGFloat(a-lo*60)*perMin)
                                }
                                if key == s.today && nowToday {
                                    let y=CGFloat(now-lo*60)*perMin
                                    Rectangle().fill(clay).frame(width:colW,height:1.5).offset(y:y-0.75)
                                    Circle().fill(clay).frame(width:5,height:5).offset(x:-2,y:y-2.5)
                                }
                            }.frame(width:colW,height:h)
                        }.offset(x:gutter+gap+CGFloat(i)*(colW+gap))
                    }
                }
            }
            if large {windowBar(window)}
        }
    }
    // MARK: 專注計時 — the app's snapshot, replayed with any queued widget taps on top.
    struct FocusFace {var state:String;var countdown:Bool;var endAt:Date?=nil;var startRef:Date?=nil;var frozen:Int}
    func focusFace(_ s:Snapshot)->FocusFace {
        let countdown=(s.focus.mode ?? "pomodoro") == "pomodoro"
        let generated=ISO8601DateFormatter().date(from:s.generatedAt) ?? entry.date
        var f=FocusFace(state:s.focus.state == "completed" ? "idle":s.focus.state,countdown:countdown,frozen:max(0,s.focus.seconds))
        if f.state == "running" {
            if countdown {f.endAt=s.focus.endAt.map{Date(timeIntervalSince1970:$0/1000)} ?? generated.addingTimeInterval(Double(f.frozen))}
            else {f.startRef=generated.addingTimeInterval(-Double(f.frozen))}
        }
        // Same state machine the app applies (applyWidgetFocus); taps that
        // don't fit the current state are ignored on both sides.
        for o in entry.focusOps {
            switch (o.op,f.state) {
            case ("start","idle"):
                f.state="running";if countdown {f.endAt=o.at.addingTimeInterval(Double(f.frozen))} else {f.startRef=o.at;f.frozen=0}
            case ("pause","running"):
                f.frozen=countdown ? max(0,Int((f.endAt ?? o.at).timeIntervalSince(o.at))):max(0,Int(o.at.timeIntervalSince(f.startRef ?? o.at)));f.state="paused"
            case ("resume","paused"):
                if countdown {f.endAt=o.at.addingTimeInterval(Double(f.frozen))} else {f.startRef=o.at.addingTimeInterval(-Double(f.frozen))};f.state="running"
            case ("stop","running"),("stop","paused"): f.state="stopped"
            default: break
            }
        }
        return f
    }
    func focusButton(_ label:String,_ icon:String,_ op:String,_ s:Snapshot,primary:Bool=false)->some View {
        Button(intent:FocusControl(op,s.accountId,s.epoch)){
            Label(label,systemImage:icon).labelStyle(.titleAndIcon).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth:.infinity,minHeight:44)
                .background(primary ? clay:ink.opacity(0.08),in:RoundedRectangle(cornerRadius:12))
                .foregroundStyle(primary ? Color.white:ink).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
    @ViewBuilder func focusPanel(_ s:Snapshot)->some View {
        let f=focusFace(s)
        let expired=f.state == "running" && f.countdown && (f.endAt ?? .distantFuture) <= entry.date
        let clock=Font.system(size:family == .systemSmall ? 30:34,weight:.medium,design:.rounded)
        let face=VStack(alignment:.leading,spacing:2){
            Text(f.state == "stopped" ? "這段專注結束了":s.focus.title).font(.caption).lineLimit(1)
            Group {
                if f.state == "running",!expired,f.countdown,let end=f.endAt {Text(timerInterval:entry.date...end,countsDown:true)}
                else if f.state == "running",!f.countdown,let ref=f.startRef {Text(ref,style:.timer)}
                else {Text(expired || f.state == "stopped" ? "00:00":String(format:"%02d:%02d",f.frozen/60,f.frozen%60))}
            }.font(clock).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }
        let controls=HStack(spacing:6){
            switch f.state {
            case "idle": focusButton("開始","play.fill","start",s,primary:true)
            case "running" where !expired: focusButton("暫停","pause.fill","pause",s);focusButton("結束","stop.fill","stop",s)
            case "paused": focusButton("繼續","play.fill","resume",s,primary:true);focusButton("結束","stop.fill","stop",s)
            // Finished (or ended from here): the reflection note lives in the app.
            default: Link(destination:url(.focus)){Text("開啟 Huddle 記錄 ↗").font(.caption.weight(.semibold)).frame(maxWidth:.infinity,minHeight:44).background(ink.opacity(0.08),in:RoundedRectangle(cornerRadius:12))}
            }
        }
        if family == .systemMedium {
            HStack(alignment:.center,spacing:12){VStack(alignment:.leading,spacing:4){Image("Huddle").resizable().scaledToFit().frame(width:25,height:25);face}.frame(maxWidth:.infinity,alignment:.leading);controls.frame(width:150)}.frame(maxHeight:.infinity)
        } else {face;Spacer(minLength:0);controls}
    }
    static let clockFormat:DateFormatter={let f=DateFormatter();f.locale=Locale(identifier:"en_US_POSIX");f.dateFormat="HH:mm";return f}()
}
// MARK: 我的 Huddle — the adopted penguin and its speech bubble.
func hexColor(_ hex:String)->Color {
    var v:UInt64=0
    guard hex.count == 7,hex.hasPrefix("#"),Scanner(string:String(hex.dropFirst())).scanHexInt64(&v) else {return .gray}
    return Color(red:Double((v>>16)&0xff)/255,green:Double((v>>8)&0xff)/255,blue:Double(v&0xff)/255)
}
/// The penguin art ("Huddle" asset, the same drawing as the web's
/// public/art/penguin/stand.webp) recoloured, with the accessory drawn on top.
/// Accessory geometry is the web's (components/pet/pet-sprite.tsx, 240×240
/// space) mapped onto this 512px export: x' = 56.1 + 1.665x, y' = 51.5 + 1.665y
/// (fitted on the two eye centres). NO mouth — owner rule; nothing here draws one.
struct PenguinFigure:View {
    var color:String;var accessory:String;var blush:Bool=false
    static let inkLine=hexColor("#292b24")
    /// Body tint (hue/saturation over the art's own shading), brightness lift, accessory colour — lib/pet/types.ts PET_COLOR_STYLES.
    static let palette:[String:(tint:Color?,lift:Double,accent:Color)]=[
        "ink":(nil,0,hexColor("#b8482a")),
        "cocoa":(hexColor("#8a5a3c"),0.06,hexColor("#dca06a")),
        "terracotta":(hexColor("#b24f2e"),0.08,hexColor("#cf5731")),
        "mustard":(hexColor("#d9a91c"),0.24,hexColor("#edc747")),
        "sage":(hexColor("#6f8057"),0.1,hexColor("#cdd3a6")),
    ]
    var body:some View {
        GeometryReader{g in
            let side=min(g.size.width,g.size.height),k=side*1.665/512
            let t=CGAffineTransform(a:k,b:0,c:0,d:k,tx:side*56.1/512,ty:side*51.5/512)
            let look=Self.palette[color] ?? Self.palette["ink"]!
            ZStack(alignment:.topLeading){
                tinted(look.tint,look.lift).frame(width:side,height:side)
                if blush {
                    Path{p in p.addEllipse(in:CGRect(x:44,y:105,width:32,height:18));p.addEllipse(in:CGRect(x:176,y:105,width:32,height:18))}.applying(t).fill(hexColor("#e79a86").opacity(0.9))
                }
                accessoryShapes(t,k,look.accent)
            }.frame(width:side,height:side).position(x:g.size.width/2,y:g.size.height/2)
        }
    }
    @ViewBuilder func tinted(_ tint:Color?,_ lift:Double)->some View {
        let art=Image("Huddle").resizable().scaledToFit()
        if let tint {ZStack{art;tint.blendMode(.color)}.compositingGroup().mask(art).brightness(lift)} else {art}
    }
    @ViewBuilder func accessoryShapes(_ t:CGAffineTransform,_ k:CGFloat,_ accent:Color)->some View {
        let line=StrokeStyle(lineWidth:5*k,lineJoin:.round)
        switch accessory {
        case "scarf":
            let tail=Path{p in p.move(to:CGPoint(x:150,y:124));p.addLine(to:CGPoint(x:170,y:176));p.addLine(to:CGPoint(x:150,y:181));p.addLine(to:CGPoint(x:136,y:128));p.closeSubpath()}.applying(t)
            let band=Path{p in p.move(to:CGPoint(x:38,y:110));p.addQuadCurve(to:CGPoint(x:202,y:110),control:CGPoint(x:120,y:140));p.addLine(to:CGPoint(x:206,y:130));p.addQuadCurve(to:CGPoint(x:34,y:130),control:CGPoint(x:120,y:160));p.closeSubpath()}.applying(t)
            let knit=Path{p in for (a,b) in [((70,124),(74,140)),((100,131),(102,148)),((140,131),(138,148)),((170,124),(166,140))] {p.move(to:CGPoint(x:a.0,y:a.1));p.addLine(to:CGPoint(x:b.0,y:b.1))}}.applying(t)
            ZStack{tail.fill(accent);tail.stroke(Self.inkLine,style:line);band.fill(accent);band.stroke(Self.inkLine,style:line);knit.stroke(Self.inkLine.opacity(0.35),lineWidth:4*k)}
        case "hat":
            let dome=Path{p in p.move(to:CGPoint(x:72,y:40));p.addQuadCurve(to:CGPoint(x:120,y:2),control:CGPoint(x:72,y:2));p.addQuadCurve(to:CGPoint(x:168,y:40),control:CGPoint(x:168,y:2));p.closeSubpath()}.applying(t)
            let brim=Path(roundedRect:CGRect(x:64,y:30,width:112,height:18),cornerRadius:9).applying(t)
            let ribs=Path{p in for x in [84,102,120,138,156] {p.move(to:CGPoint(x:x,y:34));p.addLine(to:CGPoint(x:x,y:46))}}.applying(t)
            let pom=Path(ellipseIn:CGRect(x:109,y:-9,width:22,height:22)).applying(t)
            ZStack{dome.fill(accent);dome.stroke(Self.inkLine,style:line);brim.fill(accent);brim.stroke(Self.inkLine,style:line);ribs.stroke(Self.inkLine.opacity(0.35),lineWidth:4*k);pom.fill(hexColor("#f6f3e9"));pom.stroke(Self.inkLine,style:line)}
        case "glasses":
            let rims=Path{p in p.addEllipse(in:CGRect(x:55.5,y:56,width:54,height:54));p.addEllipse(in:CGRect(x:131,y:56,width:54,height:54))}.applying(t)
            let bridge=Path{p in p.move(to:CGPoint(x:109,y:81));p.addQuadCurve(to:CGPoint(x:131,y:81),control:CGPoint(x:120,y:73))}.applying(t)
            ZStack{rims.fill(accent.opacity(0.14));rims.stroke(accent,lineWidth:7*k);rims.stroke(Self.inkLine,lineWidth:5*k);bridge.stroke(Self.inkLine,lineWidth:6*k)}
        case "headphones":
            let band=Path{p in p.move(to:CGPoint(x:34,y:92));p.addQuadCurve(to:CGPoint(x:120,y:12),control:CGPoint(x:30,y:14));p.addQuadCurve(to:CGPoint(x:206,y:92),control:CGPoint(x:210,y:14))}.applying(t)
            let cups=Path{p in p.addRoundedRect(in:CGRect(x:14,y:72,width:32,height:50),cornerSize:CGSize(width:14,height:14));p.addRoundedRect(in:CGRect(x:194,y:72,width:32,height:50),cornerSize:CGSize(width:14,height:14))}.applying(t)
            ZStack{band.stroke(Self.inkLine,lineWidth:14*k);band.stroke(accent,lineWidth:6*k);cups.fill(accent);cups.stroke(Self.inkLine,style:line)}
        default: EmptyView()
        }
    }
}
struct PetBubble {var text:String;var link:URL}
extension WidgetView {
    var petEN:Bool {entry.snapshot?.pet?.lang == "en"}
    /// Most important thing right now: a fresh 「呱」 > today's next scheduled
    /// item > overdue / unfinished today > water > a fun line (rotates hourly).
    /// `safe` = lock screen: never shows a task title.
    func petBubble(_ s:Snapshot,_ p:PetInfo,safe:Bool=false)->PetBubble {
        let en=p.lang == "en",now=entry.date
        if let at=entry.petPokeAt,now.timeIntervalSince(at) >= 0,now.timeIntervalSince(at) < petPokeLifetime {
            let line=p.lines.isEmpty ? "":p.lines[entry.petPokeN % p.lines.count]
            return PetBubble(text:(en ? "Honk! ":"呱！")+line,link:url(.pet))
        }
        let cal=Calendar.current
        let nowMin=cal.component(.hour,from:now)*60+cal.component(.minute,from:now)
        if huddleDayFormat.string(from:now) == s.today,
           let next=(s.week ?? []).filter({$0.date == s.today && minutes($0.start) >= nowMin}).min(by:{minutes($0.start) < minutes($1.start)}) {
            let title=String(next.title.prefix(14))
            let text=safe ? (en ? "Something at \(next.start). Honk!":"\(next.start) 有安排，呱！")
                          :(en ? "\(next.start) “\(title)”. Honk!":"\(next.start) 要「\(title)」，呱！")
            return PetBubble(text:text,link:url(.week,date:s.today))
        }
        if p.overdue > 0 && !p.overdueLine.isEmpty {return PetBubble(text:p.overdueLine,link:url(.tasks))}
        let open=s.tasks.filter{!(entry.pendingTasks[$0.id] ?? ($0.completed == true))}.count
        if open > 0 {return PetBubble(text:en ? "\(open) left on today's list. Honk.":"今天還有 \(open) 件事，呱。先挑最小的？",link:url(.tasks))}
        let waterDue=s.water.enabled && (s.water.nextAt.map{$0/1000 <= now.timeIntervalSince1970} ?? false)
        if waterDue {return PetBubble(text:en ? "It's been a while since your last sip. Honk.":"好一陣子沒喝水了，喝一口吧，呱。",link:url(.pet))}
        if p.lines.isEmpty {return PetBubble(text:en ? "Honk.":"呱。",link:url(.pet))}
        return PetBubble(text:p.lines[Int(now.timeIntervalSince1970/3600) % p.lines.count],link:url(.pet))
    }
    func petLink(_ s:Snapshot)->URL {
        guard let p=s.pet,p.adopted else {return url(.pet)}
        return petBubble(s,p).link
    }
    var bubbleFill:Color {scheme == .dark ? Color(red:0.24,green:0.24,blue:0.21):Color.white}
    /// Rounded bubble with a small tail pointing at the penguin (down-left, or left in the medium layout).
    func bubble(_ text:String,size:CGFloat,lines:Int,tailLeft:Bool)->some View {
        Text(text).font(.system(size:size,weight:.medium,design:.rounded)).lineLimit(lines).minimumScaleFactor(0.75)
            .multilineTextAlignment(.leading).fixedSize(horizontal:false,vertical:true)
            .padding(.horizontal,10).padding(.vertical,7)
            .frame(maxWidth:.infinity,alignment:.leading)
            .background(RoundedRectangle(cornerRadius:14,style:.continuous).fill(bubbleFill))
            .overlay(RoundedRectangle(cornerRadius:14,style:.continuous).stroke(ink.opacity(0.75),lineWidth:1.2))
            .overlay(alignment:tailLeft ? .leading:.bottomLeading){
                Path{p in
                    if tailLeft {p.move(to:CGPoint(x:1,y:0));p.addLine(to:CGPoint(x:-8,y:6));p.addLine(to:CGPoint(x:1,y:12))}
                    else {p.move(to:CGPoint(x:0,y:-1));p.addLine(to:CGPoint(x:4,y:9));p.addLine(to:CGPoint(x:14,y:-1))}
                }.fill(bubbleFill).overlay(Path{p in
                    if tailLeft {p.move(to:CGPoint(x:0,y:0));p.addLine(to:CGPoint(x:-8,y:6));p.addLine(to:CGPoint(x:0,y:12))}
                    else {p.move(to:CGPoint(x:0,y:0));p.addLine(to:CGPoint(x:4,y:9));p.addLine(to:CGPoint(x:14,y:0))}
                }.stroke(ink.opacity(0.75),lineWidth:1.2))
                .frame(width:tailLeft ? 1:14,height:tailLeft ? 12:1).offset(x:tailLeft ? 0:18)
            }
    }
    func poke(_ p:PetInfo,_ size:CGFloat)->some View {
        let fresh=entry.petPokeAt.map{entry.date.timeIntervalSince($0) < petPokeLifetime} ?? false
        return Button(intent:PokePet()){PenguinFigure(color:p.color,accessory:p.accessory,blush:fresh).frame(width:size,height:size).contentShape(Rectangle())}.buttonStyle(.plain)
    }
    @ViewBuilder func petPanel(_ s:Snapshot)->some View {
        if let p=s.pet,p.adopted {
            let b=petBubble(s,p)
            switch family {
            case .systemMedium:
                HStack(alignment:.center,spacing:14){
                    poke(p,112)
                    VStack(alignment:.leading,spacing:6){
                        Text(p.name).font(.caption.weight(.semibold)).foregroundStyle(ink.opacity(0.75))
                        Link(destination:b.link){bubble(b.text,size:14,lines:4,tailLeft:true)}
                    }
                }.frame(maxWidth:.infinity,maxHeight:.infinity)
            case .systemLarge:
                VStack(spacing:10){
                    Link(destination:b.link){bubble(b.text,size:17,lines:5,tailLeft:false)}
                    poke(p,230).frame(maxHeight:.infinity)
                    HStack{Text(p.name).font(.subheadline.weight(.semibold));Spacer();Text(p.lang == "en" ? "Tap me to honk":"點我呱一聲").font(.caption2).foregroundStyle(ink.opacity(0.6))}
                }
            default:
                // Small: iOS opens widgetURL (the bubble's target) for taps outside the penguin button.
                VStack(alignment:.leading,spacing:6){
                    bubble(b.text,size:12,lines:3,tailLeft:false)
                    HStack(alignment:.bottom){poke(p,76);Spacer(minLength:0);Text(p.name).font(.caption2.weight(.semibold)).foregroundStyle(ink.opacity(0.75)).lineLimit(1)}
                }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
            }
        } else {
            // Not adopted yet (or an app build that doesn't send `pet`).
            let en=s.pet?.lang == "en"
            VStack(spacing:8){
                PenguinFigure(color:"ink",accessory:"none").frame(width:family == .systemSmall ? 64:90,height:family == .systemSmall ? 64:90).opacity(0.55)
                Text(en ? "Open Huddle to adopt your penguin":"打開 Huddle 領養你的企鵝").font(.caption.weight(.semibold)).multilineTextAlignment(.center)
            }.frame(maxWidth:.infinity,maxHeight:.infinity)
        }
    }
}
/// The original all-in-one widget. Its kind string stays "HuddleWidgets" so the
/// copies people already placed keep working (a removed kind turns them blank).
struct HuddleWidgets:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:"HuddleWidgets",intent:Configuration.self,provider:IntentProvider<Configuration>()){entry in WidgetView(entry:entry)}
            .configurationDisplayName("Huddle 小工具（可自訂）")
            .description("一個小工具切換 14 款內容：長按 → 編輯小工具 → 類型。")
            .supportedFamilies([.systemSmall,.systemMedium,.systemLarge,.accessoryCircular,.accessoryRectangular,.accessoryInline])
    }
}
// MARK: One gallery entry per content type (「新增小工具」畫面直接看得到每一款).
func fixedWidget(_ k:Kind)->some WidgetConfiguration {
    StaticConfiguration(kind:k.widgetKind,provider:FixedProvider(kind:k)){entry in WidgetView(entry:entry)}
        .configurationDisplayName(k.title).description(k.blurb).supportedFamilies(k.families)
}
func filteredWidget<I:HuddleIntent>(_ k:Kind,_ intent:I.Type)->some WidgetConfiguration {
    AppIntentConfiguration(kind:k.widgetKind,intent:intent,provider:IntentProvider<I>(fixed:k)){entry in WidgetView(entry:entry)}
        .configurationDisplayName(k.title).description(k.blurb).supportedFamilies(k.families)
}
struct OverviewWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.overview)}}
struct CalendarWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.calendar)}}
struct AgendaWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.agenda)}}
struct WeekWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.week)}}
struct TasksWidget:Widget {var body:some WidgetConfiguration {filteredWidget(.tasks,TaskFilter.self)}}
struct TopThreeWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.topThree)}}
struct WhiteboardWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.whiteboard)}}
struct NotebookWidget:Widget {var body:some WidgetConfiguration {filteredWidget(.notebook,NotePick.self)}}
struct FocusNoteWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.focusNote)}}
struct FocusWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.focus)}}
struct ShortcutsWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.shortcuts)}}
struct PetWidget:Widget {var body:some WidgetConfiguration {fixedWidget(.pet)}}

/// Lock screen / Notification Center banner. Ink and background come from the
/// same colour scheme so the text always contrasts its own tile: the system
/// default (white text in dark mode) was near-invisible on the cream tint.
struct FocusLiveActivityView:View {
    let state:FocusActivity.ContentState
    @Environment(\.colorScheme) private var scheme
    private var ink:Color{scheme == .dark ? Color(red:0.96,green:0.94,blue:0.88):hexColor("#292b24")}
    private var paper:Color{scheme == .dark ? hexColor("#292b24"):Color(red:0.99,green:0.98,blue:0.94)}
    var body:some View {
        HStack {
            Image("Huddle").resizable().scaledToFit().frame(width:42,height:42)
            VStack(alignment:.leading){Text("Huddle · 專注").font(.headline);Text(state.paused ? "休息一下，等等繼續":"慢慢來，先專心一件事").font(.caption).foregroundStyle(ink.opacity(0.75))}
            Spacer()
            if !state.paused && state.endAt>Date(){Text(timerInterval:Date()...state.endAt,countsDown:true).monospacedDigit().frame(width:72)}
            else {Text(String(format:"%02d:%02d",state.seconds/60,state.seconds%60)).monospacedDigit()}
        }.padding().foregroundStyle(ink)
        .activityBackgroundTint(paper).activitySystemActionForegroundColor(ink)
        .widgetURL(URL(string:"huddle://widget/focus"))
    }
}
struct HuddleFocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for:FocusActivity.self) { context in
            FocusLiveActivityView(state:context.state)
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
// The iOS 26.5 SDK's WidgetBundleBuilder.buildBlock is variadic (parameter
// packs), but older toolchains stop at 10 children — two nested bundles of
// six or seven keep every level well under that either way.
struct HuddlePlanWidgets:WidgetBundle {
    var body:some Widget {PetWidget();OverviewWidget();CalendarWidget();AgendaWidget();WeekWidget();TasksWidget();TopThreeWidget()}
}
struct HuddleCaptureWidgets:WidgetBundle {
    var body:some Widget {WhiteboardWidget();NotebookWidget();FocusNoteWidget();FocusWidget();ShortcutsWidget()}
}
/// Lock Screen glances + 便條紙 + 大型月曆 (HuddleLockScreen.swift, HuddleMonthSticky.swift).
struct HuddleGlanceWidgets:WidgetBundle {
    var body:some Widget {LockTodayWidget();LockNextWidget();LockWeekWidget();LockMonthWidget();StickyWidget();MonthWidget()}
}
@main struct HuddleWidgetBundle: WidgetBundle {
    var body: some Widget { HuddlePlanWidgets().body; HuddleCaptureWidgets().body; HuddleGlanceWidgets().body; HuddleWidgets(); HuddleFocusLiveActivity() }
}
