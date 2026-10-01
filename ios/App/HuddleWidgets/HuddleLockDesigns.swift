import SwiftUI
import WidgetKit

// MARK: Lock Screen design proposals (2026-10-02) — NOT a shipped look.
//
// The owner found the current Lock Screen faces too busy and wants to compare
// three different directions on a real, locked Lock Screen before picking one:
//   A 極簡大數字   one hero number (or very short word) + a small SF Symbol, ≤2 lines
//   B 手繪圖示主導 a Huddle hand-inked glyph is the subject, one short line beside it
//   C 進度圈系     every circle is a Gauge ring, every rectangle a linear bar + one line
//
// Only the demo fixture (scripts/e2e/widget-fixture.mjs --design=a|b|c) writes
// snapshot.designVariant. The app's real snapshot (lib/widgets/model.ts
// makeSnapshot) never sends it, so real users always get the current faces
// (HuddleLockScreen.swift). Inline (the one line above the clock) is plain
// system text, so the three directions share one shorter wording.
//
// The system tints every accessory face one vibrant colour: no custom colours,
// no backgrounds besides AccessoryWidgetBackground, images become masks. Ink
// glyphs are therefore vector paths (filled, even-odd), not bitmaps.
enum LockDesign:String {case a,b,c}

extension WidgetView {
    var lockDesign:LockDesign? {LockDesign(rawValue:entry.snapshot?.designVariant ?? "")}

    @ViewBuilder func designFace(_ s:Snapshot,_ d:LockDesign)->some View {
        if family == .accessoryInline {designInline(s)}
        else {
            switch d {
            case .a: designA(s)
            case .b: designB(s)
            case .c: designC(s)
            }
        }
    }

    // MARK: Shared numbers (same data for all three directions)
    struct TodayStat {var open:[Item];var done:Int;var total:Int;var next:Item?}
    func todayStat(_ s:Snapshot)->TodayStat {
        let open=s.tasks.filter{!isDone($0)}
        return TodayStat(open:open,done:s.tasks.count-open.count,total:s.tasks.count,next:open.first)
    }
    struct NextStat {var item:Item?;var time:String;var day:String;var minutes:Int?;var more:Int}
    func nextStat(_ s:Snapshot)->NextStat {
        let list=upcoming(s),next=list.first
        let time=next?.time.map{String($0.prefix(5))} ?? ""
        var mins:Int?=nil
        if let d=next?.date,let day=huddleDayFormat.date(from:d) {
            let p=time.split(separator:":").compactMap{Int($0)}
            if p.count == 2,let at=Calendar.current.date(bySettingHour:p[0],minute:p[1],second:0,of:day) {mins=max(0,Int(at.timeIntervalSince(entry.date)/60))}
        }
        return NextStat(item:next,time:time,day:next?.date.map{dayLabel($0)} ?? "",minutes:mins,more:max(0,list.count-1))
    }
    struct WeekStat {var counts:[Int];var total:Int;var idx:Int;var today:Int}
    func weekStat(_ s:Snapshot)->WeekStat {
        let keys=weekDates(from:entry.date).map{huddleDayFormat.string(from:$0)}
        let counts=keys.map{dayCount(s,$0)},idx=keys.firstIndex(of:todayKey) ?? 0
        return WeekStat(counts:counts,total:counts.reduce(0,+),idx:idx,today:counts[idx])
    }
    struct MonthStat {var label:String;var day:Int;var count:Int;var busyLeft:Int}
    func monthStat(_ s:Snapshot)->MonthStat {
        let cal=Calendar(identifier:.gregorian),today=entry.date
        let dayN=cal.component(.day,from:today),count=cal.range(of:.day,in:.month,for:today)?.count ?? 30
        let start=cal.date(from:cal.dateComponents([.year,.month],from:today)) ?? today
        let keys=(0..<count).map{huddleDayFormat.string(from:cal.date(byAdding:.day,value:$0,to:start) ?? start)}
        return MonthStat(label:monthName(today),day:dayN,count:count,busyLeft:keys.filter{$0 >= todayKey && dayCount(s,$0) > 0}.count)
    }
    /// 今天三件事 as "x of 3": up to three slots, today's finished tasks fill them first.
    struct TopStat {var open:[Item];var done:Int;var total:Int}
    func topStat(_ s:Snapshot)->TopStat {
        let t=todayStat(s),total=min(3,t.total),done=min(t.done,total)
        return TopStat(open:Array(t.open.prefix(total-done)),done:done,total:total)
    }
    struct FocusStat {var f:FocusFace;var running:Bool;var expired:Bool;var total:Double}
    func focusStat(_ s:Snapshot)->FocusStat {
        let f=focusFace(s)
        let expired=(f.state == "running" && f.countdown && (f.endAt ?? .distantFuture) <= entry.date) || f.state == "stopped"
        return FocusStat(f:f,running:f.state == "running" && !expired,expired:expired,total:Double(max(s.focus.total ?? 0,f.frozen,60)))
    }
    /// Live countdown / stopwatch, or the frozen time when paused.
    @ViewBuilder func focusClock(_ st:FocusStat,_ size:CGFloat,align:TextAlignment = .leading)->some View {
        Group {
            if st.running,st.f.countdown,let end=st.f.endAt {Text(timerInterval:entry.date...end,countsDown:true)}
            else if st.running,let ref=st.f.startRef {Text(ref,style:.timer)}
            else {Text(mmss(st.f.frozen))}
        }.font(.system(size:size,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).multilineTextAlignment(align)
    }
    var stickyEmpty:String {L("還沒有便條","No notes yet")}

    // MARK: Inline — one short line, shared by A/B/C
    @ViewBuilder func designInline(_ s:Snapshot)->some View {
        switch glance {
        case .today:
            let t=todayStat(s)
            Label(t.open.isEmpty ? L("今天都完成了","All done"):L("\(t.open.count) 件待辦","\(t.open.count) to do"),systemImage:"checklist").widgetURL(url(.tasks))
        case .next:
            let n=nextStat(s)
            Label(n.item.map{(n.item?.date == todayKey ? "":n.day+" ")+"\(n.time) \($0.title)"} ?? L("這週沒有行程","No plans"),systemImage:"calendar").widgetURL(url(.agenda,n.item))
        case .week:
            let w=weekStat(s)
            Label(L("本週 \(w.total) 件","\(w.total) this week"),systemImage:"calendar").widgetURL(url(.week,date:todayKey))
        case .month:
            let m=monthStat(s)
            Label(L("\(m.label)還有 \(m.busyLeft) 天有事","\(m.busyLeft) busy days left in \(m.label)"),systemImage:"calendar").widgetURL(url(.calendar))
        case .topThree:
            let t=topStat(s)
            Label(t.open.first?.title ?? L("三件事完成","Top three done"),systemImage:"star").widgetURL(url(.topThree,t.open.first))
        case .sticky:
            let first=s.stickies?.first
            Label(first?.title ?? stickyEmpty,systemImage:"note.text").widgetURL(stickyURL(first))
        default:
            // 專注 (live timer) and 我的 Huddle (the penguin's line) are already one short line.
            if glance == .focus {focusGlance(s)} else {petGlance(s)}
        }
    }

    // MARK: A 極簡大數字
    func aCircle(icon:String?=nil,top:String?=nil,_ value:String)->some View {
        disc{VStack(spacing:-2){
            if let icon {Image(systemName:icon).font(.system(size:12,weight:.bold)).widgetAccentable()}
            if let top {Text(top).font(.system(size:11,weight:.bold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.7).widgetAccentable()}
            Text(value).font(.system(size:30,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.45)
        }.padding(.horizontal,8)}
    }
    func aHero(_ value:String,_ unit:String)->some View {
        HStack(alignment:.firstTextBaseline,spacing:4){
            Text(value).font(.system(size:36,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).widgetAccentable()
            if !unit.isEmpty {Text(unit).font(.system(size:15,weight:.semibold,design:.rounded)).lineLimit(1)}
        }.minimumScaleFactor(0.7)
    }
    func aRect<V:View>(_ icon:String,_ caption:String,@ViewBuilder hero:()->V)->some View {
        VStack(alignment:.leading,spacing:-2){
            hero()
            HStack(spacing:4){Image(systemName:icon).font(.system(size:11,weight:.bold));Text(caption).font(.system(size:14,weight:.medium)).lineLimit(1)}.opacity(0.8)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
    }
    @ViewBuilder func designA(_ s:Snapshot)->some View {
        let circle=family == .accessoryCircular
        switch glance {
        case .today:
            let t=todayStat(s)
            if circle {aCircle(icon:"checklist","\(t.open.count)").widgetURL(url(.tasks))}
            else {aRect("checklist",t.next?.title ?? L("今天的事都完成了","All done today")){aHero("\(t.open.count)",L("件待辦","to do"))}.widgetURL(url(.tasks,t.next))}
        case .next:
            let n=nextStat(s)
            if circle {aCircle(top:n.item == nil ? L("行程","Plans"):n.day,n.item == nil ? "—":n.time).widgetURL(url(.agenda,n.item))}
            else {aRect("calendar",n.item?.title ?? L("這週沒有行程","Nothing this week")){aHero(n.item == nil ? "—":n.time,n.day)}.widgetURL(url(.agenda,n.item))}
        case .week:
            let w=weekStat(s)
            if circle {aCircle(top:L("本週","Week"),"\(w.total)").widgetURL(url(.week,date:todayKey))}
            else {aRect("calendar",L("今天 \(w.today) 件","\(w.today) today")){aHero("\(w.total)",L("件 · 本週","this week"))}.widgetURL(url(.week,date:todayKey))}
        case .month:
            let m=monthStat(s)
            if circle {aCircle(top:m.label,"\(m.day)").widgetURL(url(.calendar))}
            else {aRect("calendar",L("還有 \(m.busyLeft) 天有安排","\(m.busyLeft) busy days left")){aHero("\(m.day)",m.label+" "+weekdayName(entry.date))}.widgetURL(url(.calendar))}
        case .topThree:
            let t=topStat(s)
            if circle {aCircle(icon:"star.fill","\(t.open.count)").widgetURL(url(.topThree))}
            else {aRect("star.fill",t.open.first?.title ?? L("都完成了","All done")){aHero("\(t.open.count)",L("件要事","to go"))}.widgetURL(url(.topThree,t.open.first))}
        case .focus:
            let st=focusStat(s)
            if circle {
                Group {
                    if st.running || st.f.state == "paused" {
                        disc{VStack(spacing:0){Image(systemName:st.running ? "timer":"pause.fill").font(.system(size:12,weight:.bold)).widgetAccentable();focusClock(st,16,align:.center)}.padding(.horizontal,3)}
                    } else {disc{Image(systemName:st.expired ? "checkmark":"play.fill").font(.system(size:26,weight:.bold)).widgetAccentable()}}
                }.widgetURL(url(.focus))
            } else {
                Group {
                    if st.running || st.f.state == "paused" {aRect(st.running ? "timer":"pause.fill",st.running ? s.focus.title:L("暫停 · \(s.focus.title)","Paused · \(s.focus.title)")){focusClock(st,36).widgetAccentable()}}
                    else if st.expired {aRect("checkmark",L("打開 Huddle 記下收穫","Open Huddle to jot it down")){aHero(L("完成","Done"),"")}}
                    else {aRect("play.fill",L("點一下開始","Tap to begin")){aHero(L("專注","Focus"),"")}}
                }.widgetURL(url(.focus))
            }
        case .sticky:
            let notes=s.stickies ?? [],first=notes.first
            if circle {aCircle(icon:"note.text","\(notes.count)").widgetURL(stickyURL(first))}
            else {
                VStack(alignment:.leading,spacing:1){
                    Text(first?.title ?? stickyEmpty).font(.system(size:20,weight:.bold,design:.rounded)).lineLimit(1).widgetAccentable()
                    HStack(spacing:4){Image(systemName:"note.text").font(.system(size:11,weight:.bold));Text(first.map{$0.body.isEmpty ? stickyTime($0.updatedAt):$0.body} ?? L("在 Huddle 貼一張","Add one in Huddle")).font(.system(size:14,weight:.medium)).lineLimit(1)}.opacity(0.8)
                }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading).widgetURL(stickyURL(first))
            }
        case .pet:
            if circle {petGlance(s)}
            else if let p=s.pet,p.adopted {
                let b=petBubble(s,p,safe:true)
                aRect("bird",b.text){aHero(p.name,"")}.widgetURL(b.link)
            } else {petLockScreen}
        case .none: EmptyView()
        }
    }

    // MARK: B 手繪圖示主導
    func bIcon(_ d:String,_ size:CGFloat)->some View {InkGlyph(d:d).fill(style:FillStyle(eoFill:true)).frame(width:size,height:size).widgetAccentable()}
    /// The hand-inked calendar with a number written inside it.
    func bCalendar(_ text:String,_ size:CGFloat)->some View {
        ZStack{
            bIcon(InkPaths.calendarBlank,size)
            Text(text).font(.system(size:size*0.34,weight:.heavy,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
                .frame(width:size*0.58).offset(x:size*0.02,y:size*0.15)
        }.frame(width:size,height:size)
    }
    func bCircle<I:View>(_ text:String,@ViewBuilder icon:()->I)->some View {
        disc{VStack(spacing:1){
            icon()
            Text(text).font(.system(size:12,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }.padding(.horizontal,8).padding(.top,1)}
    }
    func bRect<I:View>(_ title:String,_ sub:String?,@ViewBuilder icon:()->I)->some View {
        HStack(spacing:9){
            icon()
            VStack(alignment:.leading,spacing:1){
                Text(title).font(.system(size:17,weight:.semibold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.8)
                if let sub {Text(sub).font(.system(size:13,weight:.medium)).lineLimit(2).opacity(0.75)}
            }
            Spacer(minLength:0)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
    }
    @ViewBuilder func designB(_ s:Snapshot)->some View {
        let circle=family == .accessoryCircular
        switch glance {
        case .today:
            let t=todayStat(s)
            if circle {bCircle(t.open.isEmpty ? L("完成","done"):L("剩 \(t.open.count)","\(t.open.count) left")){bIcon(InkPaths.todo,30)}.widgetURL(url(.tasks))}
            else {bRect(t.open.isEmpty ? L("都完成了","All done"):L("還有 \(t.open.count) 件","\(t.open.count) to go"),t.next?.title){bIcon(InkPaths.todo,44)}.widgetURL(url(.tasks,t.next))}
        case .next:
            let n=nextStat(s)
            if circle {bCircle(n.item == nil ? "—":n.time){bIcon(InkPaths.clock,30)}.widgetURL(url(.agenda,n.item))}
            else {bRect(n.item?.title ?? L("這週沒有行程","Nothing this week"),n.item == nil ? nil:n.day+" "+n.time){bIcon(InkPaths.clock,44)}.widgetURL(url(.agenda,n.item))}
        case .week:
            let w=weekStat(s)
            if circle {bCircle(L("本週 \(w.total)","\(w.total) wk")){InkWeekBars(counts:w.counts,today:w.idx).frame(width:38,height:26).padding(.bottom,2)}.widgetURL(url(.week,date:todayKey))}
            else {bRect(L("本週 \(w.total) 件","\(w.total) this week"),L("今天 \(w.today) 件","\(w.today) today")){InkWeekBars(counts:w.counts,today:w.idx).frame(width:50,height:38)}.widgetURL(url(.week,date:todayKey))}
        case .month:
            let m=monthStat(s)
            if circle {bCircle(weekdayName(entry.date)){bCalendar("\(m.day)",38)}.widgetURL(url(.calendar))}
            else {bRect(m.label+" "+weekdayName(entry.date),L("還有 \(m.busyLeft) 天有安排","\(m.busyLeft) busy days left")){bCalendar("\(m.day)",48)}.widgetURL(url(.calendar))}
        case .topThree:
            let t=topStat(s)
            if circle {bCircle(t.open.isEmpty ? L("完成","done"):L("剩 \(t.open.count)","\(t.open.count) left")){bIcon(InkPaths.sparkles,30)}.widgetURL(url(.topThree))}
            else {bRect(t.open.first?.title ?? L("三件事都完成","Top three done"),L("三件事 · 剩 \(t.open.count)","Top three · \(t.open.count) left")){bIcon(InkPaths.sparkles,44)}.widgetURL(url(.topThree,t.open.first))}
        case .focus:
            let st=focusStat(s),live=st.running || st.f.state == "paused"
            if circle {
                disc{VStack(spacing:1){
                    bIcon(InkPaths.focus,live ? 28:34)
                    if live {focusClock(st,12,align:.center)} else if st.expired {Text(L("完成","done")).font(.system(size:12,weight:.bold,design:.rounded))}
                }.padding(.horizontal,8)}.widgetURL(url(.focus))
            } else {
                HStack(spacing:9){
                    bIcon(InkPaths.focus,44)
                    VStack(alignment:.leading,spacing:0){
                        if live {focusClock(st,24)} else {Text(st.expired ? L("專注完成","Session done"):L("開始專注","Start focusing")).font(.system(size:17,weight:.semibold,design:.rounded)).lineLimit(1)}
                        Text(live ? (st.running ? s.focus.title:L("暫停 · \(s.focus.title)","Paused · \(s.focus.title)")):L("點一下，慢慢來","Tap to begin")).font(.system(size:13,weight:.medium)).lineLimit(1).opacity(0.75)
                    }
                    Spacer(minLength:0)
                }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading).widgetURL(url(.focus))
            }
        case .sticky:
            let notes=s.stickies ?? [],first=notes.first
            if circle {bCircle(L("\(notes.count) 張","\(notes.count)")){bIcon(InkPaths.sticky,30)}.widgetURL(stickyURL(first))}
            else {bRect(first?.title ?? stickyEmpty,first.map{$0.body.isEmpty ? stickyTime($0.updatedAt):$0.body}){bIcon(InkPaths.sticky,44)}.widgetURL(stickyURL(first))}
        case .pet:
            if let p=s.pet,p.adopted {
                let b=petBubble(s,p,safe:true)
                if circle {bCircle(p.name){InkPenguinMark().frame(width:34,height:34)}.widgetURL(b.link)}
                else {bRect(p.name,b.text){InkPenguinMark().frame(width:46,height:46)}.widgetURL(b.link)}
            } else {petGlance(s)}
        case .none: EmptyView()
        }
    }

    // MARK: C 進度圈系
    func cRing<C:View>(_ value:Double,@ViewBuilder center:()->C)->some View {
        Gauge(value:min(max(value,0),1),in:0...1){EmptyView()} currentValueLabel:{center()}.gaugeStyle(.accessoryCircularCapacity)
    }
    func cCenter(icon:String?=nil,top:String?=nil,_ value:String)->some View {
        VStack(spacing:0){
            if let icon {Image(systemName:icon).font(.system(size:10,weight:.bold)).widgetAccentable()}
            if let top {Text(top).font(.system(size:9,weight:.bold,design:.rounded)).lineLimit(1).widgetAccentable()}
            Text(value).font(.system(size:16,weight:.bold,design:.rounded)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.5)
        }.padding(.horizontal,2)
    }
    func cBar(_ value:Double)->some View {Gauge(value:min(max(value,0),1),in:0...1){EmptyView()}.gaugeStyle(.accessoryLinearCapacity).widgetAccentable()}
    func cRect<B:View>(_ icon:String,_ title:String,_ trailing:String,_ caption:String,@ViewBuilder bar:()->B)->some View {
        VStack(alignment:.leading,spacing:4){
            HStack(spacing:4){
                Image(systemName:icon).font(.system(size:12,weight:.bold))
                Text(title).lineLimit(1)
                Spacer(minLength:4)
                Text(trailing).monospacedDigit().lineLimit(1).layoutPriority(1)
            }.font(.system(size:14,weight:.semibold,design:.rounded)).widgetAccentable()
            bar()
            Text(caption).font(.system(size:13,weight:.medium)).lineLimit(1).opacity(0.8)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
    }
    /// 下一個行程 as a ring: fills up over the last two hours before it starts.
    func soon(_ n:NextStat)->Double {n.minutes.map{1-Double(min($0,120))/120} ?? 0}
    @ViewBuilder func designC(_ s:Snapshot)->some View {
        let circle=family == .accessoryCircular
        switch glance {
        case .today:
            let t=todayStat(s),v=t.total == 0 ? 1:Double(t.done)/Double(t.total)
            if circle {cRing(v){cCenter(icon:"checklist","\(t.done)/\(t.total)")}.widgetURL(url(.tasks))}
            else {cRect("checklist",L("今日任務","Today"),"\(t.done)/\(t.total)",t.next?.title ?? L("今天的事都完成了","All done today")){cBar(v)}.widgetURL(url(.tasks,t.next))}
        case .next:
            let n=nextStat(s),short=n.minutes.map{$0 < 60 ? L("\($0)分","\($0)m"):n.time} ?? "—"
            if circle {cRing(soon(n)){cCenter(icon:"calendar",short)}.widgetURL(url(.agenda,n.item))}
            else {cRect("calendar",n.item?.title ?? L("這週沒有行程","Nothing this week"),n.item == nil ? "":n.time,n.minutes.map{$0 < 60 ? L("\($0) 分鐘後開始","Starts in \($0) min"):n.day+" "+n.time} ?? L("時間是你的","Your time is yours")){cBar(soon(n))}.widgetURL(url(.agenda,n.item))}
        case .week:
            let w=weekStat(s),v=Double(w.idx+1)/7
            if circle {cRing(v){cCenter(top:L("本週","Week"),"\(w.total)")}.widgetURL(url(.week,date:todayKey))}
            else {cRect("calendar",L("本週","This week"),weekdayName(entry.date),L("本週 \(w.total) 件 · 今天 \(w.today) 件","\(w.total) this week · \(w.today) today")){cBar(v)}.widgetURL(url(.week,date:todayKey))}
        case .month:
            let m=monthStat(s),v=Double(m.day)/Double(m.count)
            if circle {cRing(v){cCenter(top:m.label,"\(m.day)")}.widgetURL(url(.calendar))}
            else {cRect("calendar",m.label,"\(m.day)/\(m.count)",L("還有 \(m.busyLeft) 天有安排","\(m.busyLeft) busy days left")){cBar(v)}.widgetURL(url(.calendar))}
        case .topThree:
            let t=topStat(s),v=t.total == 0 ? 1:Double(t.done)/Double(t.total)
            if circle {cRing(v){cCenter(icon:"star.fill","\(t.done)/\(t.total)")}.widgetURL(url(.topThree))}
            else {cRect("star.fill",L("今天三件事","Top three"),"\(t.done)/\(t.total)",t.open.first?.title ?? L("都完成了","All done")){cBar(v)}.widgetURL(url(.topThree,t.open.first))}
        case .focus:
            let st=focusStat(s)
            if circle {
                Group {
                    if st.running,st.f.countdown,let end=st.f.endAt {
                        ProgressView(timerInterval:min(entry.date,end.addingTimeInterval(-st.total))...end,countsDown:true){EmptyView()} currentValueLabel:{
                            VStack(spacing:0){Image(systemName:"timer").font(.system(size:10,weight:.bold));focusClock(st,12,align:.center)}
                        }.progressViewStyle(.circular)
                    } else if st.f.state == "paused" {cRing(Double(st.f.frozen)/st.total){VStack(spacing:0){Image(systemName:"pause.fill").font(.system(size:10,weight:.bold));focusClock(st,12,align:.center)}}}
                    else {cRing(st.expired ? 1:0){cCenter(icon:st.expired ? "checkmark":"play.fill",st.expired ? L("完成","Done"):L("專注","Focus"))}}
                }.widgetURL(url(.focus))
            } else {
                VStack(alignment:.leading,spacing:4){
                    HStack(spacing:4){
                        Image(systemName:st.running ? "timer":st.f.state == "paused" ? "pause.fill":"play.fill").font(.system(size:12,weight:.bold))
                        Text(st.running ? L("專注中","Focusing"):st.f.state == "paused" ? L("暫停","Paused"):st.expired ? L("完成","Done"):L("專注","Focus")).lineLimit(1)
                        Spacer(minLength:4)
                        Text(s.focus.title).lineLimit(1).opacity(0.8)
                    }.font(.system(size:14,weight:.semibold,design:.rounded)).widgetAccentable()
                    if st.running,st.f.countdown,let end=st.f.endAt {
                        ProgressView(timerInterval:min(entry.date,end.addingTimeInterval(-st.total))...end,countsDown:true){EmptyView()} currentValueLabel:{EmptyView()}.progressViewStyle(.linear).widgetAccentable()
                    } else {cBar(st.f.state == "paused" ? Double(st.f.frozen)/st.total:st.expired ? 1:0)}
                    if st.running || st.f.state == "paused" {HStack(spacing:4){Text(L("剩","Left")).font(.system(size:13,weight:.medium));focusClock(st,13)}.opacity(0.8)}
                    else {Text(L("點一下開始","Tap to begin")).font(.system(size:13,weight:.medium)).opacity(0.8)}
                }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading).widgetURL(url(.focus))
            }
        case .sticky:
            // Notes have no natural "progress": the ring fills one fifth per note on the board.
            let notes=s.stickies ?? [],first=notes.first,v=Double(min(notes.count,5))/5
            if circle {cRing(v){cCenter(icon:"note.text","\(notes.count)")}.widgetURL(stickyURL(first))}
            else {cRect("note.text",L("便條紙","Sticky notes"),L("\(notes.count) 張","\(notes.count)"),first?.title ?? stickyEmpty){cBar(v)}.widgetURL(stickyURL(first))}
        case .pet:
            if let p=s.pet,p.adopted {
                // The penguin sits inside today's progress.
                let t=todayStat(s),v=t.total == 0 ? 1:Double(t.done)/Double(t.total),b=petBubble(s,p,safe:true)
                if circle {ZStack{cRing(v){EmptyView()};LockPenguin().frame(width:30,height:30)}.widgetURL(b.link)}
                else {cRect("bird",p.name,"\(t.done)/\(t.total)",b.text){cBar(v)}.widgetURL(b.link)}
            } else {petGlance(s)}
        case .none: EmptyView()
        }
    }
}

// MARK: Hand-inked glyphs (direction B)

/// Huddle's hand-inked icons (components/icons/huddle-icons.tsx, 24×24 box,
/// filled even-odd outlines traced from brush-pen drawings), drawn as vectors
/// so they stay crisp as Lock Screen masks at any size.
struct InkGlyph:Shape {
    var d:String
    func path(in r:CGRect)->Path {
        let k=min(r.width,r.height)/24
        return inkPath(d).applying(CGAffineTransform(a:k,b:0,c:0,d:k,tx:r.midX-12*k,ty:r.midY-12*k))
    }
}
/// Minimal SVG path reader for the traced icons (M/m, L/l, C/c, Z/z with implicit repeats).
func inkPath(_ d:String)->Path {
    var p=Path(),cur=CGPoint.zero,start=CGPoint.zero
    let b=Array(d.utf8);var i=0;var cmd:UInt8=0
    func isDigit(_ c:UInt8)->Bool {c >= 48 && c <= 57}
    func num()->CGFloat? {
        while i < b.count,b[i] == 32 || b[i] == 44 || b[i] == 10 || b[i] == 13 || b[i] == 9 {i+=1}
        var j=i
        if j < b.count,b[j] == 45 || b[j] == 43 {j+=1}
        while j < b.count,isDigit(b[j]) {j+=1}
        if j < b.count,b[j] == 46 {j+=1;while j < b.count,isDigit(b[j]) {j+=1}}
        if j < b.count,b[j] == 101 || b[j] == 69 {j+=1;if j < b.count,b[j] == 45 || b[j] == 43 {j+=1};while j < b.count,isDigit(b[j]) {j+=1}}
        guard j > i,let v=Double(String(decoding:b[i..<j],as:UTF8.self)) else {return nil}
        i=j;return CGFloat(v)
    }
    while i < b.count {
        let c=b[i]
        if c == 32 || c == 44 || c == 10 || c == 13 || c == 9 {i+=1;continue}
        if (c >= 65 && c <= 90) || (c >= 97 && c <= 122) {cmd=c;i+=1}
        switch cmd {
        case 77,109: // M m — later pairs are implicit line-tos
            guard let x=num(),let y=num() else {i=b.count;break}
            cur=cmd == 109 ? CGPoint(x:cur.x+x,y:cur.y+y):CGPoint(x:x,y:y);start=cur;p.move(to:cur);cmd=cmd == 109 ? 108:76
        case 76,108:
            guard let x=num(),let y=num() else {i=b.count;break}
            cur=cmd == 108 ? CGPoint(x:cur.x+x,y:cur.y+y):CGPoint(x:x,y:y);p.addLine(to:cur)
        case 67,99:
            guard let x1=num(),let y1=num(),let x2=num(),let y2=num(),let x=num(),let y=num() else {i=b.count;break}
            let o=cmd == 99 ? cur:.zero
            let c1=CGPoint(x:o.x+x1,y:o.y+y1),c2=CGPoint(x:o.x+x2,y:o.y+y2),e=CGPoint(x:o.x+x,y:o.y+y)
            p.addCurve(to:e,control1:c1,control2:c2);cur=e
        case 90,122: p.closeSubpath();cur=start
        default: i=b.count
        }
    }
    return p
}
/// 本週 as seven hand-drawn strokes (Mon→Sun), height = how much is on that day.
struct InkWeekBars:View {
    var counts:[Int];var today:Int
    var body:some View {
        GeometryReader{g in
            let step=g.size.width/7,lw=max(2.5,step*0.5),base=g.size.height-lw/2
            let lean:[CGFloat]=[0.6,-0.5,0.4,-0.7,0.5,-0.4,0.6]
            ZStack{
                ForEach(0..<7,id:\.self){i in
                    let n=min(i < counts.count ? counts[i]:0,4)
                    let x=step*(CGFloat(i)+0.5),top=n == 0 ? base-0.01:base-(g.size.height-lw)*(0.3+0.175*CGFloat(n)),w=lean[i]*lw*0.35
                    Path{p in p.move(to:CGPoint(x:x-w*0.5,y:base));p.addQuadCurve(to:CGPoint(x:x+w,y:top),control:CGPoint(x:x+w*1.4,y:(base+top)/2))}
                        .stroke(style:StrokeStyle(lineWidth:lw,lineCap:.round)).opacity(i == today ? 1:(n == 0 ? 0.3:0.5))
                }
            }
        }
    }
}
/// 我的 Huddle as a single brush-pen outline (body loop that overshoots where it
/// closes, belly, flippers, feet, beak) + two eye dots. Drawn in a 24×24 box.
struct InkPenguinMark:View {
    var body:some View {
        GeometryReader{g in
            let k=min(g.size.width,g.size.height)/24
            ZStack{
                InkPenguinLine().stroke(style:StrokeStyle(lineWidth:2.2*k,lineCap:.round,lineJoin:.round))
                InkPenguinEyes().fill()
            }.widgetAccentable()
        }
    }
}
private func penguinPoint(_ r:CGRect)->(CGFloat,CGFloat)->CGPoint {
    let k=min(r.width,r.height)/24,ox=r.midX-12*k,oy=r.midY-12*k
    return {x,y in CGPoint(x:ox+x*k,y:oy+y*k)}
}
struct InkPenguinLine:Shape {
    func path(in r:CGRect)->Path {
        let P=penguinPoint(r)
        var p=Path()
        p.move(to:P(11.2,2.7))
        p.addCurve(to:P(18.6,10.6),control1:P(15.6,2.1),control2:P(18.5,6.0))
        p.addCurve(to:P(17.3,19.7),control1:P(18.9,14.1),control2:P(19.1,17.7))
        p.addCurve(to:P(6.5,19.5),control1:P(14.6,22.5),control2:P(9.3,22.4))
        p.addCurve(to:P(5.6,9.9),control1:P(4.6,17.3),control2:P(4.9,13.1))
        p.addCurve(to:P(13.4,3.0),control1:P(6.3,5.6),control2:P(9.1,2.3))
        p.move(to:P(8.6,12.6));p.addCurve(to:P(12.1,19.1),control1:P(7.9,15.6),control2:P(9.3,19.0));p.addCurve(to:P(15.5,12.4),control1:P(15.0,19.1),control2:P(16.2,15.4))
        p.move(to:P(5.3,11.8));p.addQuadCurve(to:P(2.5,16.2),control:P(3.1,13.1))
        p.move(to:P(18.8,11.5));p.addQuadCurve(to:P(21.5,15.9),control:P(21.0,12.9))
        p.move(to:P(8.4,21.6));p.addLine(to:P(10.5,21.1))
        p.move(to:P(13.7,21.1));p.addLine(to:P(15.8,21.7))
        p.move(to:P(10.9,9.4));p.addLine(to:P(12.1,10.8));p.addLine(to:P(13.3,9.3))
        return p
    }
}
struct InkPenguinEyes:Shape {
    func path(in r:CGRect)->Path {
        let P=penguinPoint(r),k=min(r.width,r.height)/24
        var p=Path()
        for c in [P(9.8,7.4),P(14.3,7.3)] {p.addEllipse(in:CGRect(x:c.x-1.15*k,y:c.y-1.25*k,width:2.3*k,height:2.5*k))}
        return p
    }
}
/// Path data copied from components/icons/huddle-icons.tsx (InkTodo, InkClock,
/// InkCalendar, InkSparkles, InkFocus, InkStickyNote); calendarBlank is InkCalendar
/// without its three dots, so a date can be written inside.
enum InkPaths {
    static let todo="M21.5 1.3c-.3 .1-.8 .6-1.5 1.5c-.1 .1-.4 .5-.6 .7c-.3 .3-.5 .6-.5 .7c-.3 .3-1.3 1.4-1.4 1.4c0 0-.1 0-.1-.2c-.1-.2-.4-.5-.7-.6c-.4-.2-2.7-.1-3.9 .2c-.1 0-.3 0-.4 .1c-.6 .1-1.6 .3-1.8 .3c-.2 .1-1.3 .3-3.1 .6c-.4 0-.9 .1-1.1 .2c-.9 .2-1.8 .3-1.8 .2c-.1 0-.1-.1-.1-.3c-.2-1.1-1.8-1.2-2.1-.1c-.1 .1-.1 .3-.1 .6c0 .4 0 .5-.2 .5c-.3 0-.9 .4-1 .7c-.3 .8 .2 1.5 1 1.5c.3 0 .3 0 .4 1c0 .8 0 1.7 .1 2.9c.1 1.6 .2 2.5 .3 3.7c0 .7 .1 1.4 .1 1.6c0 .2 0 .6 0 .9l.1 .6l-.3 .2c-1.3 .6-1.1 2.2 .3 2.1c.3 0 .3 0 .4 .1c.6 .6 1.5 .5 1.9-.3c.1-.3 .2-.3 .7-.4c.2 0 .4 0 .6 0c.2-.1 .7-.1 1.1-.2c.4 0 1-.1 1.2-.1c.2-.1 .5-.1 .6-.1c.2-.1 .7-.2 1.1-.2c1.3-.3 1.5-.3 2-.4c.5 0 .6 0 1.7-.2c.3 0 .7 0 .8-.1c1.4-.2 1.8-.1 1.8 .1c.2 .8 .5 1.2 1.1 1.2c.9 0 1.3-.6 1.1-1.5c0-.3 0-.3 .3-.5c.8-.5 .6-1.9-.3-1.9c-.3 0-.4-.2-.5-1.3c-.1-.6-.1-.8-.2-1.4c-.1-.3-.2-.9-.2-1.3c-.1-.4-.1-1.2-.2-1.9c-.1-.6-.1-1.4-.2-1.8c0-.3 0-.8 0-.9c-.1-.4 0-.4 .9-1.5c.6-.7 .7-.9 1.2-1.5c.3-.3 .7-.7 .9-1c.3-.3 .7-.8 1-1.2c.2-.3 .6-.7 .7-.8c.9-1 .1-2.4-1.1-1.9M14.5 7c-.6 0-1.9 .2-2.3 .3c-.1 .1-.4 .1-.7 .1c-.4 .1-.5 .1-1.1 .2c-.2 .1-.5 .1-.7 .2c-.2 0-.6 .1-.8 .1c-.5 .1-1 .2-1.5 .3c-.2 0-.6 .1-.8 .1c-.3 .1-.7 .2-.9 .2c-.6 .1-1 .2-1 .3c-.2 .1-.1 2.2 .1 4.4c0 .2 .1 .8 .1 1.2c0 .5 .1 1.2 .1 1.7c0 .4 .1 1.1 .1 1.5c0 1 .2 1.9 .2 2c0 .1 .1 .1 .4 0c.3 0 .7-.1 1.1-.1c1-.1 1.4-.2 2-.3c.2 0 .6-.1 .7-.1c.3 0 .6-.1 1.4-.2c.7-.2 1.3-.2 1.5-.3c.2 0 .4 0 .5 0c.2-.1 .6-.1 1.5-.2c.3 0 .7-.1 .7-.1c.1 0 .3 0 .5-.1c1.2-.1 1.1 0 1-.9c-.1-.3-.2-.8-.2-1.1c-.1-.2-.1-.7-.1-.9c-.1-.5-.2-1.1-.2-1.7c-.2-2.4-.2-2.4-.6-2c-.2 .2-.4 .5-1.1 1.4c-.2 .3-.5 .6-.6 .7c-.1 .2-1 1.3-1.4 1.8c-.1 .2-.4 .5-.6 .8c-.2 .2-.4 .5-.5 .6c-.4 .6-1.1 .8-1.8 .5c-.2-.1-.6-.6-1-1.1c-.2-.3-.5-.7-.7-.9c-.6-.8-.6-.8-1.1-1.5c-.7-1-.5-1.8 .4-2.1c.5-.2 1 0 1.6 .8c.1 .2 .4 .5 .5 .6c.1 .2 .3 .5 .5 .7c.5 .7 .5 .7 1.1-.1c.2-.3 .6-.7 .8-.9c.1-.3 .4-.6 .6-.8c.2-.4 .8-1 1.3-1.6c.2-.2 .5-.5 .6-.7c.2-.2 .5-.6 .8-1c.6-.7 .6-.6 .5-1.2c0-.8 0-.8-.9-.6"
    static let clock="M12.1 1.6c-.3 0-.6 0-.7 0c-.1 .1-.3 .1-.4 .1c-1.4 .2-3.4 1-4.7 1.8c-1.1 .7-1.5 1-2.4 1.9c-1.5 1.5-2.1 2.6-2.6 4.6c0 .2-.1 .4-.1 .5c-.5 2.1-.1 5 1.2 6.8c.8 1.2 2.5 2.9 3.7 3.7c2 1.2 5.2 1.8 7.5 1.3c1.9-.5 4.2-1.7 5.7-3c.9-.7 1.9-2 2.3-2.9c.6-1.1 1.1-2.6 1.2-3.3c0-.1 .1-.3 .1-.3c.1-.5 .1-2.3 0-2.9c0-.1-.1-.4-.2-.6c-.7-3.5-3-5.9-6.6-7c-.1 0-.5-.2-.7-.3c-.9-.4-1.8-.5-3.3-.4M12 4.5c0 0-.3 .1-.5 .1c-.4 .1-.7 .1-1 .1c-.6-.1-2.8 1.1-4 2.2c-1.6 1.5-2.7 4.5-2.4 6.5c.3 1.7 .8 2.6 2 3.8c1.4 1.4 2.3 1.9 4.2 2.3c1.9 .4 3.9-.1 6.1-1.6c3.6-2.4 4.7-7.6 2.3-10.7c-1.2-1.6-4.7-3-6.7-2.7M10.6 5.5c-.2 .2-.6 .6-.7 .8c-.2 .4-.1 6.8 0 7.2c.2 .3 .6 .6 .9 .8c.4 .1 1.4 .6 2 1.1c.1 .1 .3 .2 .6 .3c.2 .2 .6 .5 1 .7c1.3 .9 2 1 2.7 .3c.8-.9 .5-2-.6-2.7c-.1-.1-.7-.5-1.3-.9c-.9-.6-1.4-.9-1.8-1.1c-.5-.2-.7-.3-.7-.4c0-.1 0-.3-.1-2.1c0-.6-.1-1.3-.1-1.5c0-.2-.1-.6-.1-.9c0-1.3-.9-2-1.8-1.6"
    static let calendar="M15.2 .9c-.6 .2-.8 .6-.8 1.5c0 .7 .1 .6-1 .7c-1.4 .1-2.7 .2-4.5 .4c-1.3 .2-1.7 .2-1.7 .2c-.1 0-.1-.3-.1-.6c-.1-1-.6-1.5-1.4-1.5c-.9 .1-1.4 .7-1.3 1.9c.1 .5 .1 .5-.4 .6c-2.7 .5-3.2 1.1-2.9 3.7c.1 .3 .1 .8 .1 1c.1 .3 .1 .6 .1 .8c0 .1 .1 .5 .1 .9c.2 2.2 .2 2.7 .3 4.3c.1 .4 .1 1 .2 1.4c0 .8 .1 1.8 .2 2.6c.1 .8 .2 1.8 .3 2.5c0 .9 .1 1.1 .5 1.5c.5 .4 .8 .5 2 .3c.8-.1 1.4-.2 2-.2c1.7-.2 2.4-.3 3.2-.4c.5-.1 1.1-.1 2.2-.3c.3 0 1 0 1.5-.1c2.9-.2 4.8-.4 6.5-.6c.2 0 .6-.1 .9-.1c1.3-.2 1.8-.8 1.8-2.2c-.1-.9-.1-1.7-.2-2.1c0-.1 0-.5-.1-.7c0-.3 0-.6-.1-.9c-.1-1.1-.2-1.5-.2-2c-.1-1.1-.2-1.9-.3-2.5c-.2-2.4-.4-3.9-.7-5.3c-.1-.2-.1-.4-.1-.6c-.3-1.7-.9-2.1-3.3-2.1c-1 0-.9 .1-.9-.7c-.1-1.2-.9-1.8-1.9-1.4M17.2 5.6c-.1 0-.1 .1-.1 .1c0 .7-.7 1.4-1.4 1.4c-.7 0-1.3-.6-1.3-1.3c0-.1 0-.2-.1-.2c0 0-1.5 0-2.3 .1c-.3 0-.7 0-1 .1c-.3 0-.8 0-1.1 .1c-.3 0-.7 .1-1 .1c-1.6 .2-1.5 .1-1.5 .5c0 1.7-2.4 2-2.6 .3c-.1-.3-.1-.3-.6-.2c-.5 .1-.6 .2-.4 1.3c0 .2 .1 .5 .1 .7c.1 1.1 .1 1.2 .3 1.1c0 0 .2 0 .5-.1c.3 0 .5 0 .5 0c.1 0 .4-.1 .7-.1c.3 0 .8-.1 1.1-.1c.9-.1 1.6-.2 2.2-.3c.4 0 .9-.1 1.2-.1c1-.1 2.3-.2 4-.4c.3 0 .7 0 .9 0c.1-.1 .4-.1 .6-.1c.2 0 .5 0 .7-.1c.2 0 .5 0 .8 0c1.8-.2 1.8-.2 1.7-.6c0-.1-.1-.3-.1-.4c-.2-1.3-.3-1.7-.5-1.8c-.1-.1-1.3-.1-1.3 0M18.4 10.8c-1.9 .2-2.8 .2-5.4 .5c-.8 0-1.7 .1-2.5 .2c-.4 0-.9 .1-1.2 .1c-1.5 .2-1.9 .2-3.4 .4c-.2 0-.7 .1-1 .1c-.8 .1-.7 .1-.7 .9c.1 .3 .1 .7 .1 .8c0 .2 .1 1.2 .2 2.1c.1 1 .2 2 .3 2.8c0 .4 0 .9 .1 1.2c0 .7 .1 .7 .3 .7c.4-.1 1.4-.2 2.7-.4c.3 0 .7 0 1-.1c.2 0 .7-.1 1-.1c.4 0 .9-.1 1.2-.1c1.6-.2 1.9-.2 4.4-.4c2.9-.2 4.7-.4 4.8-.6c0-.1-.1-1.4-.3-3.2c-.1-.8-.2-1.6-.3-2.3c-.1-1.7-.2-2.6-.2-2.7c-.1 0-.4 0-1.1 .1M16.2 14c-1.3 .5-1.5 2.2-.3 3c1.8 1 3.6-1.4 2-2.7c-.4-.4-1.1-.5-1.7-.3M11.8 14.5c-1.3 .3-1.7 1.8-.8 2.7c.9 .9 2.4 .5 2.8-.8c.3-1.1-.9-2.3-2-1.9M7 15c-1.3 .5-1.6 2.1-.5 2.9c1.3 1 3.3-.5 2.6-2c-.4-.7-1.4-1.1-2.1-.9"
    static let calendarBlank="M15.2 .9c-.6 .2-.8 .6-.8 1.5c0 .7 .1 .6-1 .7c-1.4 .1-2.7 .2-4.5 .4c-1.3 .2-1.7 .2-1.7 .2c-.1 0-.1-.3-.1-.6c-.1-1-.6-1.5-1.4-1.5c-.9 .1-1.4 .7-1.3 1.9c.1 .5 .1 .5-.4 .6c-2.7 .5-3.2 1.1-2.9 3.7c.1 .3 .1 .8 .1 1c.1 .3 .1 .6 .1 .8c0 .1 .1 .5 .1 .9c.2 2.2 .2 2.7 .3 4.3c.1 .4 .1 1 .2 1.4c0 .8 .1 1.8 .2 2.6c.1 .8 .2 1.8 .3 2.5c0 .9 .1 1.1 .5 1.5c.5 .4 .8 .5 2 .3c.8-.1 1.4-.2 2-.2c1.7-.2 2.4-.3 3.2-.4c.5-.1 1.1-.1 2.2-.3c.3 0 1 0 1.5-.1c2.9-.2 4.8-.4 6.5-.6c.2 0 .6-.1 .9-.1c1.3-.2 1.8-.8 1.8-2.2c-.1-.9-.1-1.7-.2-2.1c0-.1 0-.5-.1-.7c0-.3 0-.6-.1-.9c-.1-1.1-.2-1.5-.2-2c-.1-1.1-.2-1.9-.3-2.5c-.2-2.4-.4-3.9-.7-5.3c-.1-.2-.1-.4-.1-.6c-.3-1.7-.9-2.1-3.3-2.1c-1 0-.9 .1-.9-.7c-.1-1.2-.9-1.8-1.9-1.4M17.2 5.6c-.1 0-.1 .1-.1 .1c0 .7-.7 1.4-1.4 1.4c-.7 0-1.3-.6-1.3-1.3c0-.1 0-.2-.1-.2c0 0-1.5 0-2.3 .1c-.3 0-.7 0-1 .1c-.3 0-.8 0-1.1 .1c-.3 0-.7 .1-1 .1c-1.6 .2-1.5 .1-1.5 .5c0 1.7-2.4 2-2.6 .3c-.1-.3-.1-.3-.6-.2c-.5 .1-.6 .2-.4 1.3c0 .2 .1 .5 .1 .7c.1 1.1 .1 1.2 .3 1.1c0 0 .2 0 .5-.1c.3 0 .5 0 .5 0c.1 0 .4-.1 .7-.1c.3 0 .8-.1 1.1-.1c.9-.1 1.6-.2 2.2-.3c.4 0 .9-.1 1.2-.1c1-.1 2.3-.2 4-.4c.3 0 .7 0 .9 0c.1-.1 .4-.1 .6-.1c.2 0 .5 0 .7-.1c.2 0 .5 0 .8 0c1.8-.2 1.8-.2 1.7-.6c0-.1-.1-.3-.1-.4c-.2-1.3-.3-1.7-.5-1.8c-.1-.1-1.3-.1-1.3 0M18.4 10.8c-1.9 .2-2.8 .2-5.4 .5c-.8 0-1.7 .1-2.5 .2c-.4 0-.9 .1-1.2 .1c-1.5 .2-1.9 .2-3.4 .4c-.2 0-.7 .1-1 .1c-.8 .1-.7 .1-.7 .9c.1 .3 .1 .7 .1 .8c0 .2 .1 1.2 .2 2.1c.1 1 .2 2 .3 2.8c0 .4 0 .9 .1 1.2c0 .7 .1 .7 .3 .7c.4-.1 1.4-.2 2.7-.4c.3 0 .7 0 1-.1c.2 0 .7-.1 1-.1c.4 0 .9-.1 1.2-.1c1.6-.2 1.9-.2 4.4-.4c2.9-.2 4.7-.4 4.8-.6c0-.1-.1-1.4-.3-3.2c-.1-.8-.2-1.6-.3-2.3c-.1-1.7-.2-2.6-.2-2.7c-.1 0-.4 0-1.1 .1"
    static let sparkles="M18.8 1.2c-.5 .3-.8 .7-.8 1.4c0 .6 0 .6-.7 .7c-2 .2-1.8 2.7 .1 2.7c.6 0 .6-.1 .6 .5c0 1 .5 1.5 1.4 1.5c.9 0 1.4-.5 1.4-1.7c0-.8 0-.8 .5-.8c2.1-.3 2-2.8-.1-2.8c-.5 0-.5 0-.5-.3c0-1-1.1-1.6-1.9-1.2M11 3.2c-.4 .2-.7 .4-.8 .7c-.1 .2-.2 .4-.3 .5c-.1 .1-.3 .5-.4 .9c-.5 1-1 1.8-1.6 2.5c-1.2 1.6-3.6 3.2-5.5 3.7c-.8 .2-1.2 .6-1.2 1.3c0 .7 .6 1.3 1.3 1.3c.4 0 1.6 .6 2.6 1.2c2.3 1.5 3.3 3 3.9 5.6c0 .1 .1 .4 .1 .6c.1 2 2.5 1.9 2.8-.1c.3-2.2 1.4-4.4 3-6.1c1-1 2.3-1.8 3-1.8c.8 0 1.5-.9 1.2-1.7c-.2-.5-.5-.8-1.2-.9c-2.9-.5-5.5-3.4-5.4-6.2c0-1-.7-1.7-1.5-1.5M10.1 9.5c-.8 1.2-2.1 2.3-3.5 3.1c-.2 .1-.3 .2-.1 .3c1.1 .6 2.9 2.2 3.7 3.5c.2 .2 .2 .2 .5-.2c.9-1.4 2-2.8 3-3.6c.3-.3 .3-.3 0-.5c-.1-.1-.4-.3-.6-.4c-.7-.5-1.5-1.5-2.1-2.5c-.3-.5-.3-.5-.9 .3"
    static let focus="M18.9 2.6c-.6 .1-1.4 .2-1.4 .2c-.1 0-.4 .1-.7 .1c-.6 0-.7 0-.9 .1c-1.2 .7-.8 2.3 .7 2.3c.4 0 .6 0 1.5-.2c.2 0 .4-.1 .5-.1l.3 0l0 .3c0 .1 .1 .8 .1 1.4c0 1.3 0 1.4 .4 1.8c.8 .8 2 .2 2-.9c.1-.8-.1-3.8-.2-4.1c-.1-.5-.5-.8-1.1-.9c-.3-.1-.4-.1-1.2 0M6.8 2.6c-.1 .1-.4 .1-.5 .1c-.2 .1-.9 .1-1.5 .1c-1.4 0-1.5 .1-1.8 .3c-.7 .4-.9 1-.8 2.7c.1 .2 .1 .9 .1 1.3c0 1.3 .4 1.9 1.3 1.9c.8 0 1.3-.7 1.2-1.8c-.2-2-.2-1.9 .3-2c.2 0 .5 0 .8-.1c.3 0 .8 0 1.2 0c1.4 0 1.9-.3 2-1.1c.1-1.1-.7-1.6-2.3-1.4M11.8 10.2c-.8 .2-1.5 1-1.6 1.8c-.3 1.9 1.9 3 3.3 1.7c1.6-1.4 .3-3.9-1.7-3.5M20 14.6c-.5 .2-.8 .7-.8 1.5c0 .2 .1 .5 .1 .8c.1 .8 0 1.6 0 1.7c-.1 .1-.7 .1-1.6 .1c-1.5 0-2 .3-2 1.3c0 1 .6 1.3 2.6 1.1c.5 0 1.3-.1 1.7-.1c1 0 1.5-.3 1.7-1.1c.2-.4 .1-4.3-.1-4.7c-.3-.6-1-.9-1.6-.6M3.6 14.9c-.8 .2-1 .6-.8 2.4c0 .6 0 1-.1 2c0 .8 .1 1.2 .5 1.6c.5 .5 .2 .5 4.4 .6c1.5 0 1.9-1.9 .6-2.4c-.2-.1-.3-.1-1.6-.1c-1.5 0-1.4 .1-1.4-.5c.1-.7 0-2.4-.1-2.8c-.2-.6-.9-1-1.5-.8"
    static let sticky="M19.4 .6c-.3 .1-.5 .2-.7 .5l-.2 .2l-1 0c-2.3 0-3.4 .1-6.3 .7c-.3 .1-.6 .2-.7 .2c-.2 0-.3 .1-.4 .1c-.1 0-.9 .2-1.4 .2c-.3 .1-.5 .1-1.9 .2c-.7 .1-1.5 .2-1.6 .2c-.1 .1-.2 0-.2-.1c0-.2-.3-.6-.4-.7c-.9-.8-2.3-.2-2.4 1c-.1 .5-.1 .5-.4 .7c-1.1 .5-1.1 1.9-.1 2.4c.3 .1 .3-.2 .3 3.3c0 3 0 5.7 .1 7c0 .3 .1 .9 .1 1.3c0 .5 0 1.1 .1 1.5c0 .7 0 .7-.3 .9c-1.1 .6-.9 2.3 .3 2.4c.3 .1 .3 .1 .4 .3c.5 .8 1.9 .7 2.4-.2c.1-.3 .1-.2 .8-.3c.8-.1 1.3-.2 2.7-.4c.3 0 .7-.1 1-.1c.3 0 .6-.1 .7-.1c0 0 .3 0 .5-.1c.4 0 1.1-.1 2-.2c1.2-.1 1.7-.2 1.8-.2c.1 0 .3 0 .5 .1c.6 0 1.2-.2 1.5-.6c0-.1 .5-.6 1-1.1c.8-.8 1.1-1.1 2-2.2c.6-.5 1.4-1.6 1.8-2.1c.2-.3 .4-.6 .6-.7c.4-.4 .6-1 .4-1.6c0-.1 0-.4-.1-.8c0-.3-.1-.8-.1-1.1c-.2-1.5-.2-1.8-.2-2.4c-.2-1.4-.3-3.4-.4-4.4c0-.4 0-.4 .3-.4c.4-.1 .8-.4 .9-.8c.5-.9-.2-1.9-1.4-1.9c-.2 0-.2 0-.5-.3c-.4-.4-1-.6-1.5-.4M15.9 4.1c-.9 .1-1.8 .2-3.4 .6c-1 .2-1.2 .3-1.8 .4c-.8 .2-.9 .2-1.2 .2c-.1 0-.3 0-.5 .1c-.1 0-.4 0-.7 0c-.3 .1-.8 .1-1.1 .1c-2.1 .2-2.2 .3-2.3 .7c-.1 .6-.1 5.2 0 7.7c.2 4.6 .2 5.4 .3 5.5c0 .2 .1 .2 2-.1c.9-.1 1.8-.2 2.8-.4c.9-.1 1.6-.1 2.1-.2c.3 0 .7-.1 .9-.1c.6-.1 .6 0 .6-.8c-.1-.7 0-2 .1-2.4c0-.2 0-.5 0-.7c.1-1 .6-1.6 1.5-1.7c.2 0 .5 0 .6-.1c.7-.1 1.7-.3 3-.5c.2 0 .5 0 .5-.1c0 0 0-.8-.2-1.9c0-.3 0-.7-.1-1c0-.3 0-.8-.1-1c0-.2 0-.7 0-1.1c-.1-1.9-.2-3.1-.3-3.2c-.1-.1-2-.1-2.7 0M17.3 15.4c-.1 0-.2 .1-.3 .1c-.4 .1-.4 0-.5 .3c-.1 .3-.1 .9 0 .9c.1 0 1.2-1.2 1.2-1.3c-.1 0-.4 0-.4 0"
}
