import SwiftUI
import WidgetKit

// MARK: Snapshot extras (lib/widgets/model.ts WidgetSpanDay / WidgetSticky). Optional on Snapshot.
struct SpanItem:Decodable {var title:String;var color:String;var type:String;var done:Bool?;var time:String?}
struct SpanDay:Decodable,Identifiable {var date:String;var total:Int;var items:[SpanItem];var id:String{date}}
struct StickyInfo:Decodable,Identifiable {var id:String;var title:String;var body:String;var color:String;var updatedAt:String}

struct MonthWidget:Widget {
    var body:some WidgetConfiguration {
        StaticConfiguration(kind:Kind.month.widgetKind,provider:FixedProvider(kind:.month)){WidgetView(entry:$0)}
            .configurationDisplayName("大型月曆").description("三週大月曆：任務、行程一格一格看清楚。").supportedFamilies(Kind.month.families)
    }
}
struct StickyWidget:Widget {
    var body:some WidgetConfiguration {
        StaticConfiguration(kind:Kind.sticky.widgetKind,provider:FixedProvider(kind:.sticky)){WidgetView(entry:$0)}
            .configurationDisplayName("便條紙").description("最近的便條紙，像備忘錄一樣放在手邊。").supportedFamilies(Kind.sticky.families)
    }
}

extension WidgetView {
    /// Light: terracotta on paper. Dark: mustard on the ink desk (DESIGN.md 紙本輕版).
    var accent:Color {scheme == .dark ? hexColor("#edc747"):clay}
    var onAccent:Color {scheme == .dark ? hexColor("#292b24"):Color.white}
    var mustard:Color {hexColor("#edc747")}

    // MARK: 大型月曆 — this week's Monday + 20 days, three rows of seven.
    func spanDays(_ s:Snapshot)->[SpanDay] {
        if let span=s.span,!span.isEmpty {return span}
        // Older app build: counts only, from the month grid.
        return weekDates(from:entry.date).first.map{start in
            let cal=Calendar(identifier:.gregorian)
            return (0..<21).map{i in
                let key=huddleDayFormat.string(from:cal.date(byAdding:.day,value:i,to:start) ?? start)
                return SpanDay(date:key,total:s.days.first{$0.date == key}?.count ?? 0,items:[])
            }
        } ?? []
    }
    func shortDate(_ d:Date)->String {
        let cal=Calendar(identifier:.gregorian),m=cal.component(.month,from:d),day=cal.component(.day,from:d)
        return isEN ? "\(monthName(d)) \(day)":"\(m)月\(day)日"
    }
    func bigMonth(_ s:Snapshot)->some View {
        let xl=family == .systemExtraLarge
        let days=spanDays(s)
        let first=days.first.flatMap{huddleDayFormat.date(from:$0.date)},last=days.last.flatMap{huddleDayFormat.date(from:$0.date)}
        let title=first.flatMap{f in last.map{"\(shortDate(f)) – \(shortDate($0))"}} ?? ""
        let names=isEN ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:weekLetters
        return VStack(spacing:xl ? 8:5){
            HStack(spacing:6){
                Image("Huddle").resizable().scaledToFit().frame(width:xl ? 28:22,height:xl ? 28:22)
                Text(title).font(.system(size:xl ? 19:15,weight:.semibold,design:.rounded)).lineLimit(1).minimumScaleFactor(0.75)
                Spacer(minLength:4)
                Text(shortDate(entry.date)).font(.system(size:xl ? 14:12,weight:.semibold,design:.rounded)).monospacedDigit()
                    .padding(.horizontal,10).padding(.vertical,4).background(accent,in:Capsule()).foregroundStyle(onAccent)
            }
            HStack(spacing:0){ForEach(0..<7,id:\.self){i in
                Text(names[i]).font(.system(size:xl ? 12:10,weight:.medium,design:.rounded)).foregroundStyle(ink.opacity(i >= 5 ? 0.5:0.68)).frame(maxWidth:.infinity)
            }}
            GeometryReader{geo in
                let rowH=geo.size.height/3,colW=geo.size.width/7
                VStack(spacing:0){ForEach(0..<3,id:\.self){r in
                    HStack(spacing:0){ForEach(0..<7,id:\.self){c in
                        let i=r*7+c
                        if i < days.count {dayCell(days[i],width:colW,height:rowH,xl:xl)} else {Color.clear.frame(width:colW,height:rowH)}
                    }}
                    .overlay(alignment:.top){Rectangle().fill(ink.opacity(0.10)).frame(height:0.5)}
                }}
            }
        }
    }
    /// A date + as many chips as the cell really fits (2 on a small iPhone, 3 on most), then "+N".
    func dayCell(_ d:SpanDay,width:CGFloat,height:CGFloat,xl:Bool)->some View {
        let isToday=d.date == todayKey,past=d.date < todayKey
        let n=Int(d.date.suffix(2)) ?? 0
        let dateH:CGFloat=xl ? 24:19,chipH:CGFloat=xl ? 20:15,plusH:CGFloat=xl ? 13:11,gap:CGFloat=2
        let room=height-dateH-6
        let fitAll=max(0,Int((room+gap)/(chipH+gap)))
        let shown=d.total <= fitAll ? min(d.items.count,fitAll):max(0,min(d.items.count,Int((room-plusH)/(chipH+gap))))
        let more=d.total-shown
        let firstOfMonth=n == 1
        return Link(destination:url(.week,date:d.date)){
            VStack(alignment:.leading,spacing:gap){
                HStack(spacing:0){
                    if isToday {
                        Text("\(n)").font(.system(size:xl ? 13:11,weight:.bold,design:.rounded)).monospacedDigit()
                            .frame(minWidth:xl ? 22:18,minHeight:xl ? 22:18).background(accent,in:Circle()).foregroundStyle(onAccent)
                    } else {
                        Text(firstOfMonth ? (isEN ? "\(monthName(huddleDayFormat.date(from:d.date) ?? entry.date)) 1":"\(Int(d.date.dropFirst(5).prefix(2)) ?? 0)/1"):"\(n)")
                            .font(.system(size:xl ? 13:11,weight:firstOfMonth ? .bold:.medium,design:.rounded)).monospacedDigit()
                            .foregroundStyle(ink).padding(.leading,3).frame(minHeight:xl ? 22:18)
                    }
                    Spacer(minLength:0)
                }.frame(height:dateH)
                ForEach(0..<shown,id:\.self){chip(d.items[$0],width:width-3,height:chipH,xl:xl)}
                if more > 0 {
                    Text("+\(more)").font(.system(size:xl ? 11:9,weight:.semibold,design:.rounded)).foregroundStyle(ink.opacity(0.55))
                        .frame(maxWidth:.infinity,alignment:.trailing).padding(.trailing,2).frame(height:plusH)
                }
                Spacer(minLength:0)
            }
            .padding(.horizontal,1.5).padding(.top,2).frame(width:width,height:height,alignment:.top)
            .background(isToday ? mustard.opacity(scheme == .dark ? 0.16:0.24):Color.clear,in:RoundedRectangle(cornerRadius:7))
            .opacity(past ? 0.5:1)
        }
    }
    /// Task: a check circle (filled when done). Plan / time block: a slim colour bar. Tinted fill of the item's colour.
    func chip(_ it:SpanItem,width:CGFloat,height:CGFloat,xl:Bool)->some View {
        let tint=color(it.color),done=it.done == true,task=it.type == "task"
        // Single line, tail "…" (owner review 2026-10-01: a hard cut read as a typo).
        // Icon / insets kept tiny so a narrow iPhone cell still shows ~3 characters + "…".
        return HStack(spacing:task ? 1.5:2.5){
            if task {Image(systemName:done ? "checkmark.circle.fill":"circle").font(.system(size:xl ? 10:7,weight:.semibold)).foregroundStyle(tint)}
            else {Rectangle().fill(tint).frame(width:xl ? 3:2)}
            Text(it.title).font(.system(size:xl ? 11:9,weight:.medium)).lineLimit(1).truncationMode(.tail)
                .strikethrough(done).foregroundStyle(ink.opacity(done ? 0.5:0.92))
                .frame(maxWidth:.infinity,alignment:.leading)
        }
        .padding(.leading,task ? 1.5:0).padding(.trailing,1).frame(width:width,height:height,alignment:.leading)
        .background(tint.opacity(scheme == .dark ? 0.30:0.17))
        .clipShape(RoundedRectangle(cornerRadius:4))
    }

    // MARK: 便條紙 — Notes-style card: title, body, time in the corner; Huddle paper, ink and accent.
    func stickyTape(_ key:String)->Color {
        switch key {case "sage":return hexColor("#9fb08a");case "rose":return hexColor("#e3a191");case "cream":return hexColor("#d9cfb4");default:return hexColor("#edc747")}
    }
    func noteFace(_ n:StickyInfo,titleLines:Int,bodyLines:Int,header:Bool=true)->some View {
        VStack(alignment:.leading,spacing:4){
            if header {
                HStack(spacing:5){
                    RoundedRectangle(cornerRadius:2).fill(stickyTape(n.color)).frame(width:18,height:7).rotationEffect(.degrees(-8))
                    Text(L("便條紙","Sticky notes")).font(.system(size:11,weight:.semibold,design:.rounded)).foregroundStyle(accent)
                    Spacer(minLength:0)
                    Image("Huddle").resizable().scaledToFit().frame(width:18,height:18)
                }
            }
            Text(n.title).font(.system(size:15,weight:.bold,design:.rounded)).lineLimit(titleLines).fixedSize(horizontal:false,vertical:true)
            Text(n.body.isEmpty ? L("沒有其他內容","No additional text"):n.body).font(.system(size:12)).foregroundStyle(ink.opacity(0.62)).lineLimit(bodyLines)
            Spacer(minLength:0)
            Text(stickyTime(n.updatedAt)).font(.system(size:11,weight:.medium,design:.rounded)).foregroundStyle(ink.opacity(0.55)).monospacedDigit()
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.topLeading)
    }
    @ViewBuilder func stickyPanel(_ s:Snapshot)->some View {
        let notes=s.stickies ?? []
        if notes.isEmpty {
            VStack(spacing:6){
                Image("Huddle").resizable().scaledToFit().frame(width:44,height:44)
                Text(L("還沒有便條紙","No sticky notes yet")).font(.system(size:13,weight:.semibold,design:.rounded))
                Text(L("在 Huddle 貼一張，這裡就看得到","Add one in Huddle and it shows up here")).font(.caption2).foregroundStyle(ink.opacity(0.65)).multilineTextAlignment(.center)
            }.frame(maxWidth:.infinity,maxHeight:.infinity)
        } else if family == .systemMedium {
            HStack(alignment:.top,spacing:12){
                Link(destination:stickyURL(notes[0])){noteFace(notes[0],titleLines:2,bodyLines:3)}
                Rectangle().fill(ink.opacity(0.12)).frame(width:0.5)
                VStack(alignment:.leading,spacing:7){
                    Text(L("還有 \(notes.count-1) 張","\(notes.count-1) more")).font(.system(size:11,weight:.semibold,design:.rounded)).foregroundStyle(ink.opacity(0.6))
                    if notes.count == 1 {Text(L("就這一張","Just this one")).font(.caption2).foregroundStyle(ink.opacity(0.5))}
                    ForEach(notes.dropFirst().prefix(3)){n in
                        Link(destination:stickyURL(n)){
                            HStack(alignment:.top,spacing:5){
                                Circle().fill(stickyTape(n.color)).frame(width:6,height:6).padding(.top,4)
                                VStack(alignment:.leading,spacing:0){
                                    Text(n.title).font(.system(size:12,weight:.semibold,design:.rounded)).lineLimit(1)
                                    Text(stickyTime(n.updatedAt)).font(.system(size:10)).foregroundStyle(ink.opacity(0.55))
                                }
                            }
                        }
                    }
                    Spacer(minLength:0)
                }.frame(width:118,alignment:.leading)
            }
        } else {
            // Taps outside the links open the newest note (WidgetView body's widgetURL).
            noteFace(notes[0],titleLines:2,bodyLines:3)
        }
    }
}
