import SwiftUI
import WidgetKit
import AppIntents

// MARK: Lock Screen (accessory) faces.
//
// Five Lock-Screen-only widgets (今日任務／下一個行程／當週日曆／月份／喝水) live
// here as their own kinds; where a family has two looks the widget gets an
// on/off option (長按 → 編輯小工具). 今天三件事、專注計時、我的 Huddle、便條紙 add
// the accessory families to their existing kinds instead. The legacy
// configurable widget ("HuddleWidgets") gets the same faces for the matching 類型.
//
// Style options are Bool parameters on purpose: on the iOS 26.5 simulator an
// AppEnum widget parameter saved from the Lock Screen editor reached the
// extension as nil (always the default look), while a Bool round-tripped fine.
// parameterSummary shows each switch only for the family it affects.
//
// Owner chose 「一直顯示」 for the Lock Screen (2026-10-01): these faces show real
// titles and are NOT privacySensitive. Text follows the app's language
// (snapshot pet.lang / locale); gallery names and the option labels follow the
// device language (Localizable.xcstrings).

enum LockKind:String {
    case today,next,week,month,water
    var widgetKind:String {"HuddleWidget.lock-\(rawValue)"}
    /// Where a tap lands (lib/widgets/model.ts widgetPath).
    var link:Kind {switch self {case .today:return .tasks;case .next:return .agenda;case .week:return .week;case .month:return .calendar;case .water:return .water}}
}

/// Look identifiers the faces switch on (Entry.circleStyle / rectStyle).
enum TodayCircle:String {case ring,count}
enum TodayRect:String {case next,list}
enum WeekRect:String {case dots,twoDays="two-days"}
enum MonthRect:String {case grid,summary}
enum WaterCircle:String {case cups,countdown}

protocol LockIntent:WidgetConfigurationIntent {static var lockKind:LockKind {get};var circleStyle:String {get};var rectStyle:String {get}}
struct TodayLook:LockIntent {
    static var title:LocalizedStringResource="今日任務樣式"
    static var description=IntentDescription("圓形、長方形各有兩種樣式。")
    static var lockKind:LockKind {.today}
    @Parameter(title:"圓形只顯示剩餘件數",default:false) var circleCount:Bool
    @Parameter(title:"長方形改成前三件清單",default:false) var rectList:Bool
    var circleStyle:String {(circleCount ? TodayCircle.count:.ring).rawValue};var rectStyle:String {(rectList ? TodayRect.list:.next).rawValue}
    static var parameterSummary:some ParameterSummary {
        When(widgetFamily:.equalTo,.accessoryCircular){Summary{\.$circleCount}} otherwise:{
            When(widgetFamily:.equalTo,.accessoryRectangular){Summary{\.$rectList}} otherwise:{Summary()}}
    }
}
struct WeekLook:LockIntent {
    static var title:LocalizedStringResource="當週日曆樣式"
    static var description=IntentDescription("長方形可選七天點點或今明兩天行程。")
    static var lockKind:LockKind {.week}
    @Parameter(title:"長方形改看今明兩天行程",default:false) var twoDays:Bool
    var circleStyle:String {""};var rectStyle:String {(twoDays ? WeekRect.twoDays:.dots).rawValue}
    static var parameterSummary:some ParameterSummary {
        When(widgetFamily:.equalTo,.accessoryRectangular){Summary{\.$twoDays}} otherwise:{Summary()}
    }
}
struct MonthLook:LockIntent {
    static var title:LocalizedStringResource="月份樣式"
    static var description=IntentDescription("長方形可選迷你月格或今天日期＋本月有事天數。")
    static var lockKind:LockKind {.month}
    @Parameter(title:"長方形改看日期＋本月有事天數",default:false) var summary:Bool
    var circleStyle:String {""};var rectStyle:String {(summary ? MonthRect.summary:.grid).rawValue}
    static var parameterSummary:some ParameterSummary {
        When(widgetFamily:.equalTo,.accessoryRectangular){Summary{\.$summary}} otherwise:{Summary()}
    }
}
struct WaterLook:LockIntent {
    static var title:LocalizedStringResource="喝水樣式"
    static var description=IntentDescription("圓形可選今天幾杯或下次提醒倒數。")
    static var lockKind:LockKind {.water}
    @Parameter(title:"圓形顯示下次提醒倒數",default:false) var countdown:Bool
    var circleStyle:String {(countdown ? WaterCircle.countdown:.cups).rawValue};var rectStyle:String {""}
    static var parameterSummary:some ParameterSummary {
        When(widgetFamily:.equalTo,.accessoryCircular){Summary{\.$countdown}} otherwise:{Summary()}
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
/// a minute after each upcoming plan starts (下一個行程 moves on), and when water comes due.
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
        if s.water.enabled,let next=s.water.nextAt {at.append(Date(timeIntervalSince1970:next/1000+1))}
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
struct LockWaterWidget:Widget {
    var body:some WidgetConfiguration {
        AppIntentConfiguration(kind:LockKind.water.widgetKind,intent:WaterLook.self,provider:LockProvider<WaterLook>()){WidgetView(entry:$0)}
            .configurationDisplayName("喝水").description("今天喝了幾杯、下次提醒還有多久。").supportedFamilies(lockFamilies)
    }
}

// MARK: Faces
enum Glance {case today,next,week,month,water,topThree,focus,sticky,pet,none}
extension WidgetView {
    var isEN:Bool {(entry.snapshot?.pet?.lang ?? entry.snapshot?.locale) == "en"}
    func L(_ zh:String,_ en:String)->String {isEN ? en:zh}
    var isAccessory:Bool {family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline}
    var todayKey:String {huddleDayFormat.string(from:entry.date)}
    var glance:Glance {
        if let l=entry.lock {switch l {case .today:return .today;case .next:return .next;case .week:return .week;case .month:return .month;case .water:return .water}}
        // The legacy configurable widget maps its 類型 onto the nearest face.
        switch kind {
        case .tasks:return .today
        case .agenda:return .next
        case .week:return .week
        case .calendar,.overview,.month:return .month
        case .water:return .water
        case .topThree:return .topThree
        case .focus:return .focus
        case .sticky:return .sticky
        case .pet:return .pet
        default:return .none
        }
    }
    @ViewBuilder var accessoryView:some View {
        if let s=entry.snapshot {
            switch glance {
            case .today: todayGlance(s)
            case .next: nextGlance(s)
            case .week: weekGlance(s)
            case .month: monthGlance(s)
            case .water: waterGlance(s)
            case .topThree: topThreeGlance(s)
            case .focus: focusGlance(s)
            case .sticky: stickyGlance(s)
            case .pet: petGlance(s)
            case .none:
                if family == .accessoryCircular {Image(systemName:"square.grid.2x2").widgetURL(url(kind))}
                else {Text("Huddle · \(kind.title)").font(.caption).widgetURL(url(kind))}
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

    // MARK: Building blocks — rounded type is the Huddle voice on the monochrome Lock Screen.
    func disc<V:View>(@ViewBuilder _ content:()->V)->some View {ZStack{AccessoryWidgetBackground();content()}}
    func discStack(icon:String,value:String,caption:String)->some View {
        disc{VStack(spacing:0){
            Image(systemName:icon).font(.system(size:11,weight:.semibold))
            Text(value).font(.system(size:22,weight:.semibold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
            Text(caption).font(.system(size:9,weight:.medium,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7)
        }.padding(.horizontal,6)}
    }
    func rectHeader(_ icon:String,_ label:String,trailing:String?=nil)->some View {
        HStack(spacing:3){Image(systemName:icon);Text(label);Spacer(minLength:2);if let trailing {Text(trailing)}}
            .font(.system(size:12,weight:.semibold,design:.rounded)).lineLimit(1).widgetAccentable()
    }
    func rect<V:View>(@ViewBuilder _ content:()->V)->some View {
        VStack(alignment:.leading,spacing:1){content()}.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
    }
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

    // MARK: 今日任務
    @ViewBuilder func todayGlance(_ s:Snapshot)->some View {
        let open=s.tasks.filter{!isDone($0)},doneCount=s.tasks.count-open.count,next=open.first
        switch family {
        case .accessoryCircular:
            if entry.circleStyle == TodayCircle.count.rawValue {
                discStack(icon:"checklist",value:"\(open.count)",caption:L("件待辦","to do")).widgetURL(url(.tasks))
            } else {
                Gauge(value:Double(doneCount),in:0...Double(max(s.tasks.count,1))){Image(systemName:"checklist")} currentValueLabel:{
                    Text("\(open.count)").font(.system(size:20,weight:.semibold,design:.rounded))
                }.gaugeStyle(.accessoryCircularCapacity).widgetURL(url(.tasks))
            }
        case .accessoryInline:
            Label(next.map{L("還剩 \(open.count) 件 · \($0.title)","\(open.count) left · \($0.title)")} ?? L("今天的事都完成了","All done today"),systemImage:"checklist").widgetURL(url(.tasks,next))
        default:
            if entry.rectStyle == TodayRect.list.rawValue {
                let rows=Array((open+s.tasks.filter{isDone($0)}).prefix(3))
                rect{
                    rectHeader("checklist",L("今日任務","Today"),trailing:L("剩 \(open.count) 件","\(open.count) left"))
                    if rows.isEmpty {Text(L("今天還沒有任務","Nothing planned today")).font(.system(size:13))}
                    ForEach(rows){i in
                        HStack(spacing:4){
                            Image(systemName:isDone(i) ? "checkmark.circle.fill":"circle").font(.system(size:10,weight:.semibold))
                            Text(i.title).font(.system(size:13,weight:.medium)).lineLimit(1).strikethrough(isDone(i)).opacity(isDone(i) ? 0.6:1)
                        }
                    }
                }.widgetURL(url(.tasks))
            } else {
                rect{
                    rectHeader("checklist",L("今日任務","Today"))
                    Text(next?.title ?? L("都完成了，休息一下","All done. Take a breather")).font(.system(size:16,weight:.semibold,design:.rounded)).lineLimit(1)
                    Text(next == nil ? L("今天完成 \(doneCount) 件","\(doneCount) done today"):L("還剩 \(open.count) 件","\(open.count) left")).font(.system(size:13)).foregroundStyle(.secondary)
                }.widgetURL(url(.tasks,next))
            }
        }
    }

    // MARK: 下一個行程
    @ViewBuilder func nextGlance(_ s:Snapshot)->some View {
        let list=upcoming(s),next=list.first
        let time=next?.time.map{String($0.prefix(5))} ?? "",day=next?.date.map{dayLabel($0)} ?? ""
        switch family {
        case .accessoryCircular:
            disc{VStack(spacing:0){
                Text(next == nil ? L("行程","Plans"):day).font(.system(size:10,weight:.semibold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7)
                Text(next == nil ? "—":time).font(.system(size:17,weight:.semibold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Image(systemName:"calendar").font(.system(size:9,weight:.semibold))
            }.padding(.horizontal,5)}.widgetURL(url(.agenda,next))
        case .accessoryInline:
            Label(next.map{(next?.date == todayKey ? "":day+" ")+"\(time) \($0.title)"} ?? L("接下來七天沒有行程","No plans this week"),systemImage:"calendar").widgetURL(url(.agenda,next))
        default:
            rect{
                rectHeader("calendar",L("下一個行程","Up next"),trailing:next == nil ? nil:day)
                if let next {
                    Text(next.title).font(.system(size:16,weight:.semibold,design:.rounded)).lineLimit(1)
                    HStack(spacing:4){Text(time).monospacedDigit();if list.count > 1 {Text(L("· 之後還有 \(list.count-1) 個","· \(list.count-1) more after"))}}
                        .font(.system(size:13)).foregroundStyle(.secondary).lineLimit(1)
                } else {
                    Text(L("接下來七天沒有行程","Nothing scheduled this week")).font(.system(size:14,weight:.semibold,design:.rounded)).lineLimit(1)
                    Text(L("時間是你的","Your time is yours")).font(.system(size:12)).foregroundStyle(.secondary)
                }
            }.widgetURL(url(.agenda,next))
        }
    }

    // MARK: 當週日曆
    @ViewBuilder func weekGlance(_ s:Snapshot)->some View {
        let dates=weekDates(from:entry.date),keys=dates.map{huddleDayFormat.string(from:$0)}
        let counts=keys.map{dayCount(s,$0)},total=counts.reduce(0,+)
        let todayIdx=keys.firstIndex(of:todayKey) ?? 0,todayCount=counts[todayIdx]
        switch family {
        case .accessoryCircular:
            Gauge(value:Double(todayIdx+1),in:0...7){Text(weekdayName(entry.date))} currentValueLabel:{
                Text("\(todayCount)").font(.system(size:20,weight:.semibold,design:.rounded))
            } minimumValueLabel:{Text(weekLetters[0])} maximumValueLabel:{Text(weekLetters[6])}
                .gaugeStyle(.accessoryCircular).widgetURL(url(.week,date:todayKey))
        case .accessoryInline:
            Label(L("本週 \(total) 件 · 今天 \(todayCount) 件","\(total) this week · \(todayCount) today"),systemImage:"calendar").widgetURL(url(.week,date:todayKey))
        default:
            if entry.rectStyle == WeekRect.twoDays.rawValue {twoDays(s).widgetURL(url(.week,date:todayKey))}
            else {
                rect{
                    rectHeader("calendar",L("本週","This week"),trailing:L("\(total) 件","\(total) things"))
                    HStack(spacing:2){ForEach(0..<7,id:\.self){i in
                        let isToday=keys[i] == todayKey
                        VStack(spacing:1){
                            Text(weekLetters[i]).font(.system(size:9,weight:.medium)).opacity(0.75)
                            Text("\(Calendar(identifier:.gregorian).component(.day,from:dates[i]))").font(.system(size:14,weight:isToday ? .bold:.medium,design:.rounded)).monospacedDigit()
                            dots(counts[i])
                        }.frame(maxWidth:.infinity).padding(.vertical,2)
                            .background(isToday ? Color.primary.opacity(0.22):Color.clear,in:RoundedRectangle(cornerRadius:6))
                    }}
                }.widgetURL(url(.week,date:todayKey))
            }
        }
    }
    @ViewBuilder func dots(_ n:Int)->some View {
        if n > 3 {Text("\(n)").font(.system(size:8,weight:.bold,design:.rounded)).frame(height:6)}
        else if n == 0 {Circle().frame(width:4,height:4).opacity(0.2).frame(height:6)}
        else {HStack(spacing:1.5){ForEach(0..<n,id:\.self){_ in Circle().frame(width:4,height:4)}}.frame(height:6)}
    }
    /// (time or "•", title) for a day's open items, plus how many more there are.
    func dayRows(_ s:Snapshot,_ key:String,max:Int)->(rows:[(String,String)],more:Int) {
        // Today: what's still ahead (timed items already started drop off).
        let now=key == todayKey ? WidgetView.clockFormat.string(from:entry.date):""
        if let d=s.span?.first(where:{$0.date == key}) {
            let open=d.items.filter{$0.done != true && ($0.time ?? "99") >= now}
            let gone=d.items.count-open.count
            return (open.prefix(max).map{($0.time ?? "•",$0.title)},Swift.max(0,d.total-gone-Swift.min(open.count,max)))
        }
        let a=s.agenda.filter{$0.date == key && !isDone($0) && String(($0.time ?? "99").prefix(5)) >= now}
        return (a.prefix(max).map{(String(($0.time ?? "•").prefix(5)),$0.title)},Swift.max(0,a.count-max))
    }
    func twoDays(_ s:Snapshot)->some View {
        let cal=Calendar(identifier:.gregorian)
        let tomorrow=huddleDayFormat.string(from:cal.date(byAdding:.day,value:1,to:entry.date) ?? entry.date)
        let days=[(L("今天","Today"),todayKey),(L("明天","Tmrw"),tomorrow)]
        return rect{
            ForEach(days,id:\.1){label,key in
                let r=dayRows(s,key,max:2)
                HStack(alignment:.firstTextBaseline,spacing:5){
                    VStack(alignment:.leading,spacing:0){
                        Text(label).font(.system(size:12,weight:.bold,design:.rounded)).widgetAccentable()
                        if r.more > 0 {Text("+\(r.more)").font(.system(size:9,weight:.semibold,design:.rounded)).opacity(0.7)}
                    }.frame(width:isEN ? 40:28,alignment:.leading)
                    VStack(alignment:.leading,spacing:0){
                        if r.rows.isEmpty {Text(L("沒有安排","Free")).opacity(0.6)}
                        ForEach(Array(r.rows.enumerated()),id:\.offset){_,row in
                            HStack(spacing:3){Text(row.0).monospacedDigit().opacity(0.7);Text(row.1).lineLimit(1)}
                        }
                    }.font(.system(size:12,weight:.medium))
                }
            }
        }
    }

    // MARK: 月份
    @ViewBuilder func monthGlance(_ s:Snapshot)->some View {
        let cal=Calendar(identifier:.gregorian),today=entry.date
        let dayN=cal.component(.day,from:today),count=cal.range(of:.day,in:.month,for:today)?.count ?? 30
        let monthStart=cal.date(from:cal.dateComponents([.year,.month],from:today)) ?? today
        let keys=(0..<count).map{huddleDayFormat.string(from:cal.date(byAdding:.day,value:$0,to:monthStart) ?? monthStart)}
        let busyLeft=keys.filter{$0 >= todayKey && dayCount(s,$0) > 0}.count
        let monthLabel=monthName(today)
        switch family {
        case .accessoryCircular:
            Gauge(value:Double(dayN),in:1...Double(count)){Text(monthLabel)} currentValueLabel:{
                Text("\(dayN)").font(.system(size:22,weight:.semibold,design:.rounded))
            }.gaugeStyle(.accessoryCircular).widgetURL(url(.calendar))
        case .accessoryInline:
            Label(L("\(monthLabel)\(dayN)日 \(weekdayName(today)) · 還有 \(busyLeft) 天有安排","\(weekdayName(today)), \(monthLabel) \(dayN) · \(busyLeft) busy days left"),systemImage:"calendar").widgetURL(url(.calendar))
        default:
            if entry.rectStyle == MonthRect.summary.rawValue {
                HStack(spacing:8){
                    VStack(spacing:-3){
                        Text(monthLabel).font(.system(size:13,weight:.semibold,design:.rounded)).widgetAccentable()
                        Text("\(dayN)").font(.system(size:40,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                    }.frame(minWidth:50)
                    VStack(alignment:.leading,spacing:1){
                        Text(weekdayName(today)).font(.system(size:12,weight:.semibold,design:.rounded))
                        Text(L("這個月還有","Still ahead")).font(.system(size:12)).foregroundStyle(.secondary)
                        Text(L("\(busyLeft) 天有安排","\(busyLeft) busy days")).font(.system(size:16,weight:.semibold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    Spacer(minLength:0)
                }.widgetURL(url(.calendar))
            } else {miniMonth(s,keys:keys,monthStart:monthStart,busyLeft:busyLeft).widgetURL(url(.calendar))}
        }
    }
    /// Monday-first month: busy days full strength, quiet days faint, today knocked out of a solid dot.
    func miniMonth(_ s:Snapshot,keys:[String],monthStart:Date,busyLeft:Int)->some View {
        let lead=(Calendar(identifier:.gregorian).component(.weekday,from:monthStart)+5)%7
        let cells:[String?]=Array(repeating:nil,count:lead)+keys.map{Optional($0)}
        let rows=(cells.count+6)/7
        // 一～日 header + weeks; digits sized to the row so a 5-week month gets ~10.5pt.
        let digit:CGFloat=rows >= 6 ? 9.5:10.5
        return HStack(alignment:.top,spacing:4){
            VStack(alignment:.leading,spacing:0){
                Text(monthName(entry.date)).font(.system(size:14,weight:.bold,design:.rounded)).widgetAccentable().lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength:0)
                Text("\(busyLeft)").font(.system(size:14,weight:.semibold,design:.rounded)).monospacedDigit()
                Text(L("天有事","busy")).font(.system(size:8,weight:.medium)).opacity(0.85)
            }.frame(width:28,alignment:.leading)
            VStack(spacing:0){
                HStack(spacing:0){ForEach(0..<7,id:\.self){c in
                    Text(weekLetters[c]).font(.system(size:7.5,weight:.semibold)).opacity(0.8).frame(maxWidth:.infinity)
                }}.frame(height:9)
                ForEach(0..<rows,id:\.self){r in
                    HStack(spacing:0){ForEach(0..<7,id:\.self){c in
                        let i=r*7+c
                        if i < cells.count,let key=cells[i] {
                            let n=Int(key.suffix(2)) ?? 0,isToday=key == todayKey,busy=dayCount(s,key) > 0
                            ZStack{
                                if isToday {Circle().fill(Color.white).padding(-0.5)}
                                Text("\(n)").font(.system(size:digit,weight:isToday || busy ? .bold:.medium,design:.rounded)).monospacedDigit()
                                    .foregroundStyle(isToday ? Color.black:Color.primary)
                                    .opacity(isToday || busy ? 1:0.62)
                            }.frame(maxWidth:.infinity,maxHeight:.infinity)
                        } else {Color.clear.frame(maxWidth:.infinity,maxHeight:.infinity)}
                    }}
                }
            }
        }
    }

    // MARK: 喝水
    @ViewBuilder func waterGlance(_ s:Snapshot)->some View {
        let cups=max(entry.waterCount,s.water.count)
        let next=s.water.enabled ? s.water.nextAt.map{Date(timeIntervalSince1970:$0/1000)}:nil
        let due=next.map{$0 <= entry.date} ?? false
        let nextText = !s.water.enabled ? L("提醒還沒開啟","Reminders off"):due ? L("該喝口水了","Time for a sip"):next.map{L("下次提醒 \(WidgetView.clockFormat.string(from:$0))","Next at \(WidgetView.clockFormat.string(from:$0))")} ?? L("喝口水，休息一下","Sip, then breathe")
        switch family {
        case .accessoryCircular:
            if entry.circleStyle == WaterCircle.countdown.rawValue {
                disc{VStack(spacing:0){
                    Image(systemName:"drop.fill").font(.system(size:11,weight:.semibold))
                    if let next,!due {Text(next,style:.timer).font(.system(size:14,weight:.semibold,design:.rounded)).monospacedDigit().multilineTextAlignment(.center).lineLimit(1).minimumScaleFactor(0.6)}
                    else {Text(s.water.enabled ? L("喝水","Sip"):L("未開","Off")).font(.system(size:15,weight:.semibold,design:.rounded))}
                    Text(!s.water.enabled ? L("提醒","alerts"):due ? L("時間到","now"):L("下一杯","next")).font(.system(size:8,weight:.medium))
                }.padding(.horizontal,5)}.widgetURL(url(.water))
            } else {discStack(icon:"drop.fill",value:"\(cups)",caption:L("杯","cups")).widgetURL(url(.water))}
        case .accessoryInline:
            Label(L("今天 \(cups) 杯 · ","\(cups) today · ")+nextText,systemImage:"drop.fill").widgetURL(url(.water))
        default:
            rect{
                rectHeader("drop.fill",L("喝水","Water"))
                Text(L("今天 \(cups) 杯","\(cups) glasses today")).font(.system(size:16,weight:.semibold,design:.rounded)).lineLimit(1)
                Text(nextText).font(.system(size:13)).foregroundStyle(.secondary).lineLimit(1)
            }.widgetURL(url(.water))
        }
    }

    // MARK: 今天三件事
    @ViewBuilder func topThreeGlance(_ s:Snapshot)->some View {
        // Same rule as the home widget: completed tasks drop off the three.
        let top=Array(s.tasks.filter{$0.completed != true && entry.pendingTasks[$0.id] != true}.prefix(3))
        switch family {
        case .accessoryCircular:
            discStack(icon:"star.fill",value:"\(top.count)",caption:top.isEmpty ? L("都完成","all done"):L("件要事","to go")).widgetURL(url(.topThree))
        case .accessoryInline:
            Label(top.first.map{L("要事：\($0.title)","Top: \($0.title)")} ?? L("三件事都完成了","Top three done"),systemImage:"star").widgetURL(url(.topThree,top.first))
        default:
            rect{
                rectHeader("star.fill",L("今天三件事","Top three"))
                if top.isEmpty {Text(L("都完成了，好好休息","All done. Rest well")).font(.system(size:14,weight:.semibold,design:.rounded))}
                ForEach(Array(top.enumerated()),id:\.offset){n,i in
                    HStack(spacing:4){
                        Text("\(n+1)").font(.system(size:10,weight:.bold,design:.rounded)).frame(width:12)
                        Text(i.title).font(.system(size:13,weight:.medium)).lineLimit(1)
                    }
                }
            }.widgetURL(url(.topThree))
        }
    }

    // MARK: 專注計時 — live: the system ticks Text(timerInterval:) / ProgressView(timerInterval:) by itself.
    @ViewBuilder func focusGlance(_ s:Snapshot)->some View {
        let f=focusFace(s)
        let expired=f.state == "running" && f.countdown && (f.endAt ?? .distantFuture) <= entry.date
        let running=f.state == "running" && !expired
        let total=Double(max(s.focus.total ?? 0,f.frozen,60))
        switch family {
        case .accessoryCircular:
            Group {
                if running,f.countdown,let end=f.endAt {
                    ProgressView(timerInterval:min(entry.date,end.addingTimeInterval(-total))...end,countsDown:true){Image(systemName:"timer")} currentValueLabel:{
                        Text(timerInterval:entry.date...end,countsDown:true).font(.system(size:12,weight:.semibold,design:.rounded)).monospacedDigit().multilineTextAlignment(.center)
                    }.progressViewStyle(.circular)
                } else if running,let ref=f.startRef {
                    disc{VStack(spacing:0){Image(systemName:"stopwatch").font(.system(size:11,weight:.semibold));Text(ref,style:.timer).font(.system(size:13,weight:.semibold,design:.rounded)).monospacedDigit().multilineTextAlignment(.center).lineLimit(1).minimumScaleFactor(0.6)}.padding(.horizontal,6)}
                } else if f.state == "paused" {
                    if f.countdown {
                        Gauge(value:Double(f.frozen),in:0...total){Image(systemName:"pause.fill")} currentValueLabel:{Text(mmss(f.frozen)).font(.system(size:12,weight:.semibold,design:.rounded)).monospacedDigit()}.gaugeStyle(.accessoryCircularCapacity)
                    } else {discStack(icon:"pause.fill",value:mmss(f.frozen),caption:L("暫停","paused"))}
                } else {
                    disc{VStack(spacing:1){Image(systemName:"play.fill").font(.system(size:16,weight:.semibold));Text(L("開始專注","Focus")).font(.system(size:9,weight:.semibold,design:.rounded))}}
                }
            }.widgetURL(url(.focus))
        case .accessoryInline:
            Group {
                if running,f.countdown,let end=f.endAt {Label{Text(timerInterval:entry.date...end,countsDown:true)} icon:{Image(systemName:"timer")}}
                else if running,let ref=f.startRef {Label{Text(ref,style:.timer)} icon:{Image(systemName:"stopwatch")}}
                else if f.state == "paused" {Label(L("專注暫停 · 剩 \(mmss(f.frozen))","Focus paused · \(mmss(f.frozen))"),systemImage:"pause.fill")}
                else {Label(L("開始專注","Start a focus session"),systemImage:"timer")}
            }.widgetURL(url(.focus))
        default:
            rect{
                if running {
                    rectHeader("timer",L("專注中","Focusing"))
                    Text(s.focus.title).font(.system(size:13)).lineLimit(1).foregroundStyle(.secondary)
                    Group {
                        if f.countdown,let end=f.endAt {Text(timerInterval:entry.date...end,countsDown:true)}
                        else if let ref=f.startRef {Text(ref,style:.timer)}
                    }.font(.system(size:24,weight:.semibold,design:.rounded)).monospacedDigit().lineLimit(1)
                } else if f.state == "paused" {
                    rectHeader("pause.fill",L("專注暫停","Paused"))
                    Text(s.focus.title).font(.system(size:13)).lineLimit(1).foregroundStyle(.secondary)
                    Text(mmss(f.frozen)).font(.system(size:24,weight:.semibold,design:.rounded)).monospacedDigit()
                } else if expired || f.state == "stopped" {
                    rectHeader("checkmark.circle",L("這段專注結束了","Session done"))
                    Text(L("打開 Huddle 記下收穫","Open Huddle to jot it down")).font(.system(size:14,weight:.semibold,design:.rounded)).lineLimit(2)
                } else {
                    rectHeader("timer",L("專注","Focus"))
                    Text(L("開始專注","Start focusing")).font(.system(size:17,weight:.semibold,design:.rounded))
                    Text(L("點一下，慢慢來","Tap to begin. No rush")).font(.system(size:12)).foregroundStyle(.secondary)
                }
            }.widgetURL(url(.focus))
        }
    }

    // MARK: 便條紙 — rectangular reads like the Notes Lock Screen widget.
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
    @ViewBuilder func stickyGlance(_ s:Snapshot)->some View {
        let notes=s.stickies ?? [],first=notes.first
        switch family {
        case .accessoryCircular:
            discStack(icon:"note.text",value:"\(notes.count)",caption:L("張便條","notes")).widgetURL(stickyURL(first))
        case .accessoryInline:
            Label(first?.title ?? L("還沒有便條紙","No sticky notes yet"),systemImage:"note.text").widgetURL(stickyURL(first))
        default:
            rect{
                HStack(spacing:3){Image(systemName:"note.text");Text(L("便條紙","Sticky notes"));Spacer(minLength:2);if let first {Text(stickyTime(first.updatedAt))}}
                    .font(.system(size:11,weight:.semibold,design:.rounded)).foregroundStyle(.secondary).lineLimit(1)
                if let first {
                    Text(first.title).font(.system(size:15,weight:.bold)).lineLimit(1)
                    Text(first.body.isEmpty ? L("沒有其他內容","No additional text"):first.body).font(.system(size:13)).foregroundStyle(.secondary).lineLimit(2)
                } else {
                    Text(L("在 Huddle 貼一張便條紙","Add a sticky note in Huddle")).font(.system(size:14,weight:.semibold)).lineLimit(2)
                }
            }.widgetURL(stickyURL(first))
        }
    }

    // MARK: 我的 Huddle — circular: the penguin itself; inline: its current line.
    @ViewBuilder func petGlance(_ s:Snapshot)->some View {
        if let p=s.pet,p.adopted {
            let b=petBubble(s,p)
            if family == .accessoryCircular {ZStack{AccessoryWidgetBackground();LockPenguin().padding(.top,7).padding(.bottom,5)}.widgetURL(b.link)}
            else {Label(b.text,systemImage:"bird").widgetURL(b.link)}
        } else {
            if family == .accessoryCircular {disc{Image(systemName:"bird").font(.title2)}.widgetURL(url(.pet))}
            else {Label(L("打開 Huddle 領養你的企鵝","Open Huddle to adopt your penguin"),systemImage:"bird").widgetURL(url(.pet))}
        }
    }
}

/// 我的 Huddle on the monochrome Lock Screen. The colour art turns into a grey
/// blob there (the white belly vanishes and it reads as a bear), so this is a
/// purpose-drawn silhouette: solid body + flippers + feet, the face/belly
/// knocked out to the background disc, eyes and beak solid inside it.
/// Drawn in a 60×60 box and scaled to fit.
struct LockPenguin:View {
    var body:some View {
        GeometryReader{g in
            let k=min(g.size.width,g.size.height)/60
            let ox=(g.size.width-60*k)/2,oy=(g.size.height-60*k)/2
            let t=CGAffineTransform(a:k,b:0,c:0,d:k,tx:ox,ty:oy)
            let bodyShape=Path(ellipseIn:CGRect(x:13,y:2,width:34,height:52))
            let flippers=Path{p in
                p.addEllipse(in:CGRect(x:6,y:22,width:11,height:24))
                p.addEllipse(in:CGRect(x:43,y:22,width:11,height:24))
            }
            let feet=Path{p in
                p.addEllipse(in:CGRect(x:16,y:51,width:12,height:7))
                p.addEllipse(in:CGRect(x:32,y:51,width:12,height:7))
            }
            // Heart-ish face mask flowing into the belly.
            let face=Path{p in
                p.addEllipse(in:CGRect(x:19,y:20,width:22,height:31))
                p.addEllipse(in:CGRect(x:18.5,y:12,width:12,height:14))
                p.addEllipse(in:CGRect(x:29.5,y:12,width:12,height:14))
            }
            let eyes=Path{p in
                p.addEllipse(in:CGRect(x:22.5,y:16.5,width:5,height:5.5))
                p.addEllipse(in:CGRect(x:32.5,y:16.5,width:5,height:5.5))
            }
            let beak=Path{p in p.move(to:CGPoint(x:26.5,y:23.5));p.addLine(to:CGPoint(x:33.5,y:23.5));p.addLine(to:CGPoint(x:30,y:28.5));p.closeSubpath()}
            ZStack{
                ZStack{
                    flippers.applying(t).fill(Color.white)
                    feet.applying(t).fill(Color.white)
                    bodyShape.applying(t).fill(Color.white)
                    face.applying(t).fill(Color.black).blendMode(.destinationOut)
                }.compositingGroup()
                eyes.applying(t).fill(Color.white)
                beak.applying(t).fill(Color.white)
            }
        }
    }
}
