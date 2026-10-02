import SwiftUI
import WidgetKit
import AppIntents

// MARK: Lock Screen (accessory) faces.
//
// Four Lock-Screen-only widgets (今日任務／下一個行程／當週日曆／月份) live
// here as their own kinds. 今天三件事、專注計時、我的 Huddle、便條紙 add the
// accessory families to their existing kinds instead. The legacy configurable
// widget ("HuddleWidgets") gets the same faces for the matching 類型.
//
// One look per family since 2026-10-02 (hand-inked glyph + big number, see
// Faces below). The old style switches stay declared on TodayLook / WeekLook /
// MonthLook — their kinds, intents and parameter names are what keeps widgets
// people already placed alive — but they no longer change anything, so their
// parameterSummary is empty and the editor doesn't offer them.
//
// Owner chose 「一直顯示」 for the Lock Screen (2026-10-01): these faces show real
// titles and are NOT privacySensitive. Text follows the app's language
// (snapshot pet.lang / locale); gallery names follow the device language
// (Localizable.xcstrings).

enum LockKind:String {
    case today,next,week,month
    var widgetKind:String {"HuddleWidget.lock-\(rawValue)"}
    /// Where a tap lands (lib/widgets/model.ts widgetPath).
    var link:Kind {switch self {case .today:return .tasks;case .next:return .agenda;case .week:return .week;case .month:return .calendar}}
}

/// Values the old style switches map to (Entry.circleStyle / rectStyle); kept so the
/// intents keep their shape. The faces no longer read them.
enum TodayCircle:String {case ring,count}
enum TodayRect:String {case next,list}
enum WeekRect:String {case dots,twoDays="two-days"}
enum MonthRect:String {case grid,summary}

protocol LockIntent:WidgetConfigurationIntent {static var lockKind:LockKind {get};var circleStyle:String {get};var rectStyle:String {get}}
struct TodayLook:LockIntent {
    static var title:LocalizedStringResource="今日任務樣式"
    static var description=IntentDescription("圓形、長方形各有兩種樣式。")
    static var lockKind:LockKind {.today}
    @Parameter(title:"圓形只顯示剩餘件數",default:false) var circleCount:Bool
    @Parameter(title:"長方形改成前三件清單",default:false) var rectList:Bool
    var circleStyle:String {(circleCount ? TodayCircle.count:.ring).rawValue};var rectStyle:String {(rectList ? TodayRect.list:.next).rawValue}
    static var parameterSummary:some ParameterSummary {
        Summary()
    }
}
struct WeekLook:LockIntent {
    static var title:LocalizedStringResource="當週日曆樣式"
    static var description=IntentDescription("長方形可選七天點點或今明兩天行程。")
    static var lockKind:LockKind {.week}
    @Parameter(title:"長方形改看今明兩天行程",default:false) var twoDays:Bool
    var circleStyle:String {""};var rectStyle:String {(twoDays ? WeekRect.twoDays:.dots).rawValue}
    static var parameterSummary:some ParameterSummary {
        Summary()
    }
}
struct MonthLook:LockIntent {
    static var title:LocalizedStringResource="月份樣式"
    static var description=IntentDescription("長方形可選迷你月格或今天日期＋本月有事天數。")
    static var lockKind:LockKind {.month}
    @Parameter(title:"長方形改看日期＋本月有事天數",default:false) var summary:Bool
    var circleStyle:String {""};var rectStyle:String {(summary ? MonthRect.summary:.grid).rawValue}
    static var parameterSummary:some ParameterSummary {
        Summary()
    }
}
// MARK: Providers
func lockEntry(_ lock:LockKind,circle:String="",rect:String="",now:Date=Date())->Entry {
    var e=loadEntry(kind:lock.link,now:now);e.lock=lock;e.circleStyle=circle;e.rectStyle=rect;return e
}
struct LockProvider<I:LockIntent>:AppIntentTimelineProvider {
    func placeholder(in context:Context)->Entry {var e=Entry(date:Date(),kind:I.lockKind.link,snapshot:nil);e.lock=I.lockKind;return e}
    func snapshot(for c:I,in context:Context) async -> Entry {lockEntry(I.lockKind,circle:c.circleStyle,rect:c.rectStyle)}
    func timeline(for c:I,in context:Context) async -> Timeline<Entry> {makeTimeline(lockEntry(I.lockKind,circle:c.circleStyle,rect:c.rectStyle))}
}
/// 下一個行程 has no style choice.
struct LockFixedProvider:TimelineProvider {
    var lock:LockKind
    func placeholder(in context:Context)->Entry {var e=Entry(date:Date(),kind:lock.link,snapshot:nil);e.lock=lock;return e}
    func getSnapshot(in context:Context,completion:@escaping(Entry)->Void) {completion(lockEntry(lock))}
    func getTimeline(in context:Context,completion:@escaping(Timeline<Entry>)->Void) {completion(makeTimeline(lockEntry(lock)))}
}
/// Glances change on their own: at midnight (today / week / month roll over),
/// a minute after each upcoming plan starts (下一個行程 moves on).
func glanceTimeline(_ e:Entry)->Timeline<Entry> {
    let now=e.date,cal=Calendar.current
    var at:[Date]=[]
    if let midnight=cal.nextDate(after:now,matching:DateComponents(hour:0,minute:0,second:5),matchingPolicy:.nextTime) {at.append(midnight)}
    if let s=e.snapshot {
        for item in s.agenda {
            guard let d=item.date,let t=item.time,let day=huddleDayFormat.date(from:d) else {continue}
            let p=t.split(separator:":").compactMap{Int($0)}
            if p.count >= 2,let start=cal.date(bySettingHour:p[0],minute:p[1],second:0,of:day) {at.append(start.addingTimeInterval(60))}
        }
    }
    let future=Array(Set(at.filter{$0 > now && $0 < now.addingTimeInterval(12*3600)})).sorted().prefix(12)
    let entries=[e]+future.map{d->Entry in
        var n=loadEntry(kind:e.kind,category:e.category,noteID:e.noteID,now:d)
        n.lock=e.lock;n.circleStyle=e.circleStyle;n.rectStyle=e.rectStyle
        return n
    }
    return Timeline(entries:entries,policy:.after(now.addingTimeInterval(1800)))
}

// MARK: Widgets (gallery names / descriptions localised by Localizable.xcstrings)
private let lockFamilies:[WidgetFamily]=[.accessoryCircular,.accessoryRectangular,.accessoryInline]
struct LockTodayWidget:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:LockKind.today.widgetKind,intent:TodayLook.self,provider:LockProvider<TodayLook>()){WidgetView(entry:$0)}
            .configurationDisplayName("今日任務").description("下一件要做的事、還剩幾件。").supportedFamilies(lockFamilies)
    }
}
struct LockNextWidget:Widget {
    var body:some WidgetConfiguration {
        StaticConfiguration(kind:LockKind.next.widgetKind,provider:LockFixedProvider(lock:.next)){WidgetView(entry:$0)}
            .configurationDisplayName("下一個行程").description("接下來最近的一個行程與時間。").supportedFamilies(lockFamilies)
    }
}
struct LockWeekWidget:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:LockKind.week.widgetKind,intent:WeekLook.self,provider:LockProvider<WeekLook>()){WidgetView(entry:$0)}
            .configurationDisplayName("當週日曆").description("這週一到週日，每天有幾件事。").supportedFamilies(lockFamilies)
    }
}
struct LockMonthWidget:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:LockKind.month.widgetKind,intent:MonthLook.self,provider:LockProvider<MonthLook>()){WidgetView(entry:$0)}
            .configurationDisplayName("月份").description("今天幾號、這個月還有幾天有安排。").supportedFamilies(lockFamilies)
    }
}

// MARK: Faces — 手繪圖示＋大數字 (owner's pick 2026-10-02: direction B's hand-inked
// glyphs with direction A's hero number). One look per family:
//   circular     small ink glyph on top, a big number in the middle, a word that
//                says what the number is (剩 2 · 14 件 · 10月 + the date)
//   rectangular  the ink glyph is the subject on the left; on the right a big
//                number or very short word, one small line under it
//   inline       one short system line (custom shapes can't render there)
// The Lock Screen is monochrome (one vibrant tint), so nothing relies on colour.
enum Glance {case today,next,week,month,topThree,focus,sticky,pet,none}
extension WidgetView {
    var isEN:Bool {(entry.snapshot?.pet?.lang ?? entry.snapshot?.locale) == "en"}
    func L(_ zh:String,_ en:String)->String {isEN ? en:zh}
    var isAccessory:Bool {family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline}
    var todayKey:String {huddleDayFormat.string(from:entry.date)}
    var glance:Glance {
        if let l=entry.lock {switch l {case .today:return .today;case .next:return .next;case .week:return .week;case .month:return .month}}
        // The legacy configurable widget maps its 類型 onto the nearest face.
        switch kind {
        case .tasks:return .today
        case .agenda:return .next
        case .week:return .week
        case .calendar,.overview,.month:return .month
        case .topThree:return .topThree
        case .focus:return .focus
        case .sticky:return .sticky
        case .pet:return .pet
        default:return .none
        }
    }
    @ViewBuilder var accessoryView:some View {
        if let s=entry.snapshot {
            if family == .accessoryInline {inlineFace(s)}
            else {
                switch glance {
                case .today: todayFace(s)
                case .next: nextFace(s)
                case .week: weekFace(s)
                case .month: monthFace(s)
                case .topThree: topThreeFace(s)
                case .focus: focusLockFace(s)
                case .sticky: stickyFace(s)
                case .pet: petFace(s)
                case .none:
                    if family == .accessoryCircular {Image(systemName:"square.grid.2x2").widgetURL(url(kind))}
                    else {Text("Huddle · \(kind.title)").font(.caption).widgetURL(url(kind))}
                }
            }
        } else {lockEmpty}
    }
    @ViewBuilder var lockEmpty:some View {
        let msg=entry.emptyReason == .signedOut ? "開啟 Huddle 登入":"開啟 Huddle 同步"
        switch family {
        case .accessoryCircular: ZStack{AccessoryWidgetBackground();Image(systemName:"arrow.triangle.2.circlepath").font(.title3)}.widgetURL(url(kind))
        case .accessoryInline: Label(msg,systemImage:"arrow.triangle.2.circlepath").widgetURL(url(kind))
        default: VStack(alignment:.leading,spacing:2){Text("Huddle").font(.headline);Text(msg).font(.caption)}.frame(maxWidth:.infinity,alignment:.leading).widgetURL(url(kind))
        }
    }

    // MARK: Shared helpers
    func isDone(_ i:Item)->Bool {entry.pendingTasks[i.id] ?? (i.completed == true)}
    func mmss(_ sec:Int)->String {String(format:"%02d:%02d",max(0,sec)/60,max(0,sec)%60)}
    func weekdayName(_ d:Date)->String {
        let w=Calendar(identifier:.gregorian).component(.weekday,from:d)-1
        return isEN ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][w]:"週"+["日","一","二","三","四","五","六"][w]
    }
    /// Monday-first, like the 大型月曆.
    var weekLetters:[String] {isEN ? ["M","T","W","T","F","S","S"]:["一","二","三","四","五","六","日"]}
    func monthName(_ d:Date)->String {
        let m=Calendar(identifier:.gregorian).component(.month,from:d)
        return isEN ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]:"\(m)月"
    }
    func weekDates(from day:Date)->[Date] {
        let cal=Calendar(identifier:.gregorian),back=(cal.component(.weekday,from:day)+5)%7
        let start=cal.date(byAdding:.day,value:-back,to:day) ?? day
        return (0..<7).map{cal.date(byAdding:.day,value:$0,to:start) ?? start}
    }
    /// Things on a day: the 21-day span when the app sends it, else the month grid's count.
    func dayCount(_ s:Snapshot,_ key:String)->Int {
        if let d=s.span?.first(where:{$0.date == key}) {return d.total}
        return s.days.first(where:{$0.date == key})?.count ?? 0
    }
    func dayLabel(_ key:String)->String {
        if key == todayKey {return L("今天","Today")}
        guard let d=huddleDayFormat.date(from:key),let t=huddleDayFormat.date(from:todayKey) else {return key}
        if Calendar(identifier:.gregorian).dateComponents([.day],from:t,to:d).day == 1 {return L("明天","Tmrw")}
        return weekdayName(d)
    }
    /// Agenda items still ahead of now (the agenda is already date+time sorted).
    func upcoming(_ s:Snapshot)->[Item] {
        let key=todayKey,now=WidgetView.clockFormat.string(from:entry.date)
        return s.agenda.filter{i in
            guard let d=i.date,let t=i.time else {return false}
            return !isDone(i) && (d > key || (d == key && String(t.prefix(5)) >= now))
        }
    }
    func stickyURL(_ n:StickyInfo?)->URL {url(.sticky,n.map{Item(id:$0.id,title:"",subtitle:"")})}
    func stickyTime(_ iso:String)->String {
        let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        let g=ISO8601DateFormatter()
        guard let d=f.date(from:iso) ?? g.date(from:iso) else {return ""}
        let key=huddleDayFormat.string(from:d)
        if key == todayKey {return WidgetView.clockFormat.string(from:d)}
        if dayLabel(key) == L("明天","Tmrw") {return ""}
        let cal=Calendar(identifier:.gregorian)
        if let y=cal.date(byAdding:.day,value:-1,to:entry.date),huddleDayFormat.string(from:y) == key {return L("昨天","Yesterday")}
        return "\(cal.component(.month,from:d))/\(cal.component(.day,from:d))"
    }

    // MARK: Numbers each face shows
    struct TodayStat {var open:[Item];var done:Int;var total:Int;var next:Item?}
    func todayStat(_ s:Snapshot)->TodayStat {
        let open=s.tasks.filter{!isDone($0)}
        return TodayStat(open:open,done:s.tasks.count-open.count,total:s.tasks.count,next:open.first)
    }
    struct NextStat {var item:Item?;var time:String;var day:String}
    func nextStat(_ s:Snapshot)->NextStat {
        let next=upcoming(s).first
        return NextStat(item:next,time:next?.time.map{String($0.prefix(5))} ?? "",day:next?.date.map{dayLabel($0)} ?? "")
    }
    struct WeekStat {var counts:[Int];var total:Int;var idx:Int;var today:Int}
    func weekStat(_ s:Snapshot)->WeekStat {
        let keys=weekDates(from:entry.date).map{huddleDayFormat.string(from:$0)}
        let counts=keys.map{dayCount(s,$0)},idx=keys.firstIndex(of:todayKey) ?? 0
        return WeekStat(counts:counts,total:counts.reduce(0,+),idx:idx,today:counts[idx])
    }
    struct MonthStat {var label:String;var day:Int;var busyLeft:Int}
    func monthStat(_ s:Snapshot)->MonthStat {
        let cal=Calendar(identifier:.gregorian),today=entry.date
        let count=cal.range(of:.day,in:.month,for:today)?.count ?? 30
        let start=cal.date(from:cal.dateComponents([.year,.month],from:today)) ?? today
        let keys=(0..<count).map{huddleDayFormat.string(from:cal.date(byAdding:.day,value:$0,to:start) ?? start)}
        return MonthStat(label:monthName(today),day:cal.component(.day,from:today),busyLeft:keys.filter{$0 >= todayKey && dayCount(s,$0) > 0}.count)
    }
    /// 今天三件事 as "x of 3": up to three slots, today's finished tasks fill them first.
    struct TopStat {var open:[Item];var done:Int;var total:Int}
    func topStat(_ s:Snapshot)->TopStat {
        let t=todayStat(s),total=min(3,t.total),done=min(t.done,total)
        return TopStat(open:Array(t.open.prefix(total-done)),done:done,total:total)
    }
    struct FocusStat {var f:FocusFace;var running:Bool;var expired:Bool}
    func focusStat(_ s:Snapshot)->FocusStat {
        let f=focusFace(s)
        let expired=(f.state == "running" && f.countdown && (f.endAt ?? .distantFuture) <= entry.date) || f.state == "stopped"
        return FocusStat(f:f,running:f.state == "running" && !expired,expired:expired)
    }
    /// Live countdown / stopwatch (the system ticks it by itself), or the frozen time when paused.
    @ViewBuilder func focusClock(_ st:FocusStat,_ size:CGFloat,align:TextAlignment = .leading)->some View {
        Group {
            if st.running,st.f.countdown,let end=st.f.endAt {Text(timerInterval:entry.date...end,countsDown:true)}
            else if st.running,let ref=st.f.startRef {Text(ref,style:.timer)}
            else {Text(mmss(st.f.frozen))}
        }.font(.system(size:size,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6).multilineTextAlignment(align)
    }

    // MARK: Building blocks
    func inkIcon(_ d:String,_ size:CGFloat)->some View {InkGlyph(d:d).fill(style:FillStyle(eoFill:true)).frame(width:size,height:size).widgetAccentable()}
    func hourglass(_ size:CGFloat)->some View {InkHourglass().frame(width:size,height:size).widgetAccentable()}
    func weekGlyph(_ w:WeekStat,_ size:CGFloat)->some View {InkWeek(counts:w.counts,today:w.idx).frame(width:size,height:size).widgetAccentable()}
    func disc<V:View>(@ViewBuilder _ content:()->V)->some View {ZStack{AccessoryWidgetBackground();content()}}
    /// The big rounded number, with small words before / after it on the same baseline.
    func hero(_ value:String,pre:String="",unit:String="",size:CGFloat)->some View {
        HStack(alignment:.firstTextBaseline,spacing:size >= 30 ? 3:1){
            if !pre.isEmpty {Text(pre).font(.system(size:max(10,size*0.42),weight:.semibold,design:.rounded))}
            Text(value).font(.system(size:size,weight:.bold,design:.rounded)).monospacedDigit()
            if !unit.isEmpty {Text(unit).font(.system(size:max(10,size*0.42),weight:.semibold,design:.rounded))}
        }.lineLimit(1).minimumScaleFactor(0.5)
    }
    /// Circle: ink glyph on top, hero in the middle, what-it-means word underneath.
    func hCircle<I:View,H:View>(_ caption:String?,@ViewBuilder icon:()->I,@ViewBuilder hero:()->H)->some View {
        disc{VStack(spacing:0){
            icon()
            hero()
            if let caption {Text(caption).font(.system(size:10,weight:.semibold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7).opacity(0.85)}
        }.padding(.horizontal,7)}
    }
    /// Rectangle: ink glyph as the subject, hero on the right, one small line under it.
    func hRect<I:View,H:View>(_ caption:String,lines:Int=1,@ViewBuilder icon:()->I,@ViewBuilder hero:()->H)->some View {
        HStack(spacing:8){
            icon()
            VStack(alignment:.leading,spacing:-1){
                hero()
                Text(caption).font(.system(size:13,weight:.medium)).lineLimit(lines).opacity(0.8)
            }
            Spacer(minLength:0)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
    }
    var circleIcon:CGFloat {20}
    var rectIcon:CGFloat {42}

    // MARK: Inline — one short line above the clock (system text + SF Symbol only)
    @ViewBuilder func inlineFace(_ s:Snapshot)->some View {
        switch glance {
        case .today:
            let t=todayStat(s)
            Label(t.open.isEmpty ? L("今天都完成了","All done"):L("\(t.open.count) 件待辦","\(t.open.count) to do"),systemImage:"checklist").widgetURL(url(.tasks))
        case .next:
            let n=nextStat(s)
            Label(n.item.map{(n.item?.date == todayKey ? "":n.day+" ")+"\(n.time) \($0.title)"} ?? L("這週沒有行程","No plans"),systemImage:"clock").widgetURL(url(.agenda,n.item))
        case .week:
            let w=weekStat(s)
            Label(L("本週 \(w.total) 件","\(w.total) this week"),systemImage:"calendar").widgetURL(url(.week,date:todayKey))
        case .month:
            let m=monthStat(s)
            Label(L("\(m.label)還有 \(m.busyLeft) 天有事","\(m.busyLeft) busy days left in \(m.label)"),systemImage:"calendar").widgetURL(url(.calendar))
        case .topThree:
            // Same sparkles as the circle / rectangle glyph.
            let t=topStat(s)
            Label(t.open.first?.title ?? L("三件事完成","Top three done"),systemImage:"sparkles").widgetURL(url(.topThree,t.open.first))
        case .focus:
            let st=focusStat(s)
            Group {
                if st.running,st.f.countdown,let end=st.f.endAt {Label{Text(timerInterval:entry.date...end,countsDown:true)} icon:{Image(systemName:"hourglass")}}
                else if st.running,let ref=st.f.startRef {Label{Text(ref,style:.timer)} icon:{Image(systemName:"hourglass")}}
                else if st.f.state == "paused" {Label(L("專注暫停 · 剩 \(mmss(st.f.frozen))","Focus paused · \(mmss(st.f.frozen))"),systemImage:"pause.fill")}
                else if st.expired {Label(L("專注完成","Focus done"),systemImage:"checkmark")}
                else {Label(L("開始專注","Start a focus session"),systemImage:"hourglass")}
            }.widgetURL(url(.focus))
        case .sticky:
            let first=s.stickies?.first
            Label(first?.title ?? L("還沒有便條","No notes yet"),systemImage:"note.text").widgetURL(stickyURL(first))
        case .pet:
            if let p=s.pet,p.adopted {let b=petBubble(s,p);Label(b.text,systemImage:"bird").widgetURL(b.link)}
            else {Label(L("打開 Huddle 領養你的企鵝","Open Huddle to adopt your penguin"),systemImage:"bird").widgetURL(url(.pet))}
        case .none:
            Text("Huddle · \(kind.title)").widgetURL(url(kind))
        }
    }

    // MARK: 今日任務
    @ViewBuilder func todayFace(_ s:Snapshot)->some View {
        let t=todayStat(s)
        if family == .accessoryCircular {
            hCircle(t.open.isEmpty ? L("今天","today"):L("待辦","to do")){inkIcon(InkPaths.todo,circleIcon)} hero:{
                if t.open.isEmpty {hero(L("完成","Done"),size:17)} else {hero("\(t.open.count)",unit:L("件",""),size:28)}
            }.widgetURL(url(.tasks))
        } else {
            hRect(t.next?.title ?? L("今天完成 \(t.done) 件","\(t.done) done today")){inkIcon(InkPaths.todo,rectIcon)} hero:{
                if t.open.isEmpty {hero(L("都完成了","All done"),size:24)} else {hero("\(t.open.count)",unit:L("件待辦","to do"),size:34)}
            }.widgetURL(url(.tasks,t.next))
        }
    }

    // MARK: 下一個行程
    @ViewBuilder func nextFace(_ s:Snapshot)->some View {
        let n=nextStat(s)
        if family == .accessoryCircular {
            hCircle(n.item == nil ? L("行程","plans"):n.day){inkIcon(InkPaths.clock,circleIcon)} hero:{hero(n.item == nil ? "—":n.time,size:22)}
                .widgetURL(url(.agenda,n.item))
        } else {
            hRect(n.item?.title ?? L("接下來七天","Next 7 days")){inkIcon(InkPaths.clock,rectIcon)} hero:{
                if n.item == nil {hero(L("沒有行程","No plans"),size:24)} else {hero(n.time,unit:n.day,size:34)}
            }.widgetURL(url(.agenda,n.item))
        }
    }

    // MARK: 當週日曆
    @ViewBuilder func weekFace(_ s:Snapshot)->some View {
        let w=weekStat(s)
        if family == .accessoryCircular {
            hCircle(L("本週","this week")){weekGlyph(w,22)} hero:{hero("\(w.total)",unit:L("件",""),size:26)}
                .widgetURL(url(.week,date:todayKey))
        } else {
            hRect(L("本週 · 今天 \(w.today) 件","This week · \(w.today) today")){weekGlyph(w,rectIcon)} hero:{hero("\(w.total)",unit:L("件","things"),size:34)}
                .widgetURL(url(.week,date:todayKey))
        }
    }

    // MARK: 月份
    @ViewBuilder func monthFace(_ s:Snapshot)->some View {
        let m=monthStat(s),wd=weekdayName(entry.date)
        if family == .accessoryCircular {
            disc{VStack(spacing:-2){
                HStack(spacing:2){inkIcon(InkPaths.calendar,13);Text(m.label).font(.system(size:12,weight:.bold,design:.rounded)).lineLimit(1)}.widgetAccentable()
                Text("\(m.day)").font(.system(size:30,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text(wd).font(.system(size:10,weight:.semibold,design:.rounded)).lineLimit(1).opacity(0.85)
            }.padding(.horizontal,7)}.widgetURL(url(.calendar))
        } else {
            hRect(L("還有 \(m.busyLeft) 天有安排","\(m.busyLeft) busy days left")){inkIcon(InkPaths.calendar,rectIcon)} hero:{
                hero("\(m.day)",pre:m.label,unit:L("日 \(wd)",wd),size:34)
            }.widgetURL(url(.calendar))
        }
    }

    // MARK: 今天三件事 — sparkles everywhere (circle, rectangle and the inline SF symbol).
    @ViewBuilder func topThreeFace(_ s:Snapshot)->some View {
        let t=topStat(s)
        if family == .accessoryCircular {
            hCircle(L("三件事","top 3")){inkIcon(InkPaths.sparkles,circleIcon)} hero:{
                if t.open.isEmpty {hero(L("完成","Done"),size:17)} else {hero("\(t.open.count)",pre:L("剩",""),unit:L("","left"),size:28)}
            }.widgetURL(url(.topThree))
        } else {
            hRect(t.open.first?.title ?? L("三件事都完成了","Top three done")){inkIcon(InkPaths.sparkles,rectIcon)} hero:{
                if t.open.isEmpty {hero(L("都完成了","All done"),size:24)} else {hero("\(t.open.count)",pre:L("剩",""),unit:L("件要事","of \(t.total) left"),size:34)}
            }.widgetURL(url(.topThree,t.open.first))
        }
    }

    // MARK: 專注計時 — the hourglass; live timers tick on their own.
    @ViewBuilder func focusLockFace(_ s:Snapshot)->some View {
        let st=focusStat(s),live=st.running || st.f.state == "paused"
        if family == .accessoryCircular {
            Group {
                if live {
                    hCircle(st.running ? L("專注中","focus"):L("暫停","paused")){hourglass(18)} hero:{focusClock(st,17,align:.center)}
                } else {
                    hCircle(nil){hourglass(26)} hero:{hero(st.expired ? L("完成","Done"):L("專注","Focus"),size:15)}
                }
            }.widgetURL(url(.focus))
        } else {
            Group {
                if live {
                    hRect(st.running ? L("專注中 · \(s.focus.title)","Focusing · \(s.focus.title)"):L("暫停 · \(s.focus.title)","Paused · \(s.focus.title)")){hourglass(rectIcon)} hero:{focusClock(st,32)}
                } else if st.expired {
                    hRect(L("打開 Huddle 記下收穫","Open Huddle to jot it down")){hourglass(rectIcon)} hero:{hero(L("專注完成","Done"),size:24)}
                } else {
                    hRect(L("點一下，慢慢來","Tap to begin. No rush")){hourglass(rectIcon)} hero:{hero(L("開始專注","Focus"),size:24)}
                }
            }.widgetURL(url(.focus))
        }
    }

    // MARK: 便條紙 — the rectangle gives the words room: title + two lines of the note.
    @ViewBuilder func stickyFace(_ s:Snapshot)->some View {
        let notes=s.stickies ?? [],first=notes.first
        if family == .accessoryCircular {
            hCircle(L("便條","notes")){inkIcon(InkPaths.sticky,circleIcon)} hero:{hero("\(notes.count)",unit:L("張",""),size:26)}
                .widgetURL(stickyURL(first))
        } else {
            HStack(spacing:7){
                inkIcon(InkPaths.sticky,32)
                VStack(alignment:.leading,spacing:0){
                    Text(first?.title ?? L("還沒有便條","No notes yet")).font(.system(size:15,weight:.bold,design:.rounded)).lineLimit(1)
                    Text(first.map{$0.body.isEmpty ? stickyTime($0.updatedAt):$0.body} ?? L("在 Huddle 貼一張便條紙","Add a sticky note in Huddle"))
                        .font(.system(size:13,weight:.medium)).lineLimit(2).opacity(0.8)
                }
                Spacer(minLength:0)
            }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading).widgetURL(stickyURL(first))
        }
    }

    // MARK: 我的 Huddle — the penguin in one brush line, with its name.
    @ViewBuilder func petFace(_ s:Snapshot)->some View {
        if let p=s.pet,p.adopted {
            let b=petBubble(s,p,safe:true)
            if family == .accessoryCircular {
                disc{VStack(spacing:0){
                    InkPenguinMark().frame(width:34,height:34)
                    Text(p.name).font(.system(size:12,weight:.bold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7)
                }.padding(.horizontal,8).padding(.top,1)}.widgetURL(b.link)
            } else {
                hRect(b.text,lines:2){InkPenguinMark().frame(width:44,height:44)} hero:{hero(p.name,size:22)}.widgetURL(b.link)
            }
        } else if family == .accessoryCircular {
            disc{InkPenguinMark().frame(width:34,height:34).opacity(0.6)}.widgetURL(url(.pet))
        } else {
            hRect(L("打開 Huddle 領養你的企鵝","Open Huddle to adopt your penguin"),lines:2){InkPenguinMark().frame(width:44,height:44).opacity(0.6)} hero:{hero(L("企鵝","Penguin"),size:22)}.widgetURL(url(.pet))
        }
    }
}
