import SwiftUI
import WidgetKit

// MARK: Hand-inked glyphs for the Lock Screen faces (HuddleLockScreen.swift).
//
// The system tints every accessory face one vibrant colour: no custom colours,
// no backgrounds besides AccessoryWidgetBackground, images become masks. Ink
// glyphs are therefore vector paths (filled even-odd, or brush-like strokes),
// not bitmaps. DESIGN.md: lines that are too clean read like an icon font once
// shrunk, so the hand-drawn ones here lean, overshoot and wobble on purpose.

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
/// InkCalendar, InkSparkles, InkStickyNote); calendarBlank is InkCalendar
/// without its three dots, so the week row (InkWeek) can be drawn inside.
enum InkPaths {
    static let todo="M21.5 1.3c-.3 .1-.8 .6-1.5 1.5c-.1 .1-.4 .5-.6 .7c-.3 .3-.5 .6-.5 .7c-.3 .3-1.3 1.4-1.4 1.4c0 0-.1 0-.1-.2c-.1-.2-.4-.5-.7-.6c-.4-.2-2.7-.1-3.9 .2c-.1 0-.3 0-.4 .1c-.6 .1-1.6 .3-1.8 .3c-.2 .1-1.3 .3-3.1 .6c-.4 0-.9 .1-1.1 .2c-.9 .2-1.8 .3-1.8 .2c-.1 0-.1-.1-.1-.3c-.2-1.1-1.8-1.2-2.1-.1c-.1 .1-.1 .3-.1 .6c0 .4 0 .5-.2 .5c-.3 0-.9 .4-1 .7c-.3 .8 .2 1.5 1 1.5c.3 0 .3 0 .4 1c0 .8 0 1.7 .1 2.9c.1 1.6 .2 2.5 .3 3.7c0 .7 .1 1.4 .1 1.6c0 .2 0 .6 0 .9l.1 .6l-.3 .2c-1.3 .6-1.1 2.2 .3 2.1c.3 0 .3 0 .4 .1c.6 .6 1.5 .5 1.9-.3c.1-.3 .2-.3 .7-.4c.2 0 .4 0 .6 0c.2-.1 .7-.1 1.1-.2c.4 0 1-.1 1.2-.1c.2-.1 .5-.1 .6-.1c.2-.1 .7-.2 1.1-.2c1.3-.3 1.5-.3 2-.4c.5 0 .6 0 1.7-.2c.3 0 .7 0 .8-.1c1.4-.2 1.8-.1 1.8 .1c.2 .8 .5 1.2 1.1 1.2c.9 0 1.3-.6 1.1-1.5c0-.3 0-.3 .3-.5c.8-.5 .6-1.9-.3-1.9c-.3 0-.4-.2-.5-1.3c-.1-.6-.1-.8-.2-1.4c-.1-.3-.2-.9-.2-1.3c-.1-.4-.1-1.2-.2-1.9c-.1-.6-.1-1.4-.2-1.8c0-.3 0-.8 0-.9c-.1-.4 0-.4 .9-1.5c.6-.7 .7-.9 1.2-1.5c.3-.3 .7-.7 .9-1c.3-.3 .7-.8 1-1.2c.2-.3 .6-.7 .7-.8c.9-1 .1-2.4-1.1-1.9M14.5 7c-.6 0-1.9 .2-2.3 .3c-.1 .1-.4 .1-.7 .1c-.4 .1-.5 .1-1.1 .2c-.2 .1-.5 .1-.7 .2c-.2 0-.6 .1-.8 .1c-.5 .1-1 .2-1.5 .3c-.2 0-.6 .1-.8 .1c-.3 .1-.7 .2-.9 .2c-.6 .1-1 .2-1 .3c-.2 .1-.1 2.2 .1 4.4c0 .2 .1 .8 .1 1.2c0 .5 .1 1.2 .1 1.7c0 .4 .1 1.1 .1 1.5c0 1 .2 1.9 .2 2c0 .1 .1 .1 .4 0c.3 0 .7-.1 1.1-.1c1-.1 1.4-.2 2-.3c.2 0 .6-.1 .7-.1c.3 0 .6-.1 1.4-.2c.7-.2 1.3-.2 1.5-.3c.2 0 .4 0 .5 0c.2-.1 .6-.1 1.5-.2c.3 0 .7-.1 .7-.1c.1 0 .3 0 .5-.1c1.2-.1 1.1 0 1-.9c-.1-.3-.2-.8-.2-1.1c-.1-.2-.1-.7-.1-.9c-.1-.5-.2-1.1-.2-1.7c-.2-2.4-.2-2.4-.6-2c-.2 .2-.4 .5-1.1 1.4c-.2 .3-.5 .6-.6 .7c-.1 .2-1 1.3-1.4 1.8c-.1 .2-.4 .5-.6 .8c-.2 .2-.4 .5-.5 .6c-.4 .6-1.1 .8-1.8 .5c-.2-.1-.6-.6-1-1.1c-.2-.3-.5-.7-.7-.9c-.6-.8-.6-.8-1.1-1.5c-.7-1-.5-1.8 .4-2.1c.5-.2 1 0 1.6 .8c.1 .2 .4 .5 .5 .6c.1 .2 .3 .5 .5 .7c.5 .7 .5 .7 1.1-.1c.2-.3 .6-.7 .8-.9c.1-.3 .4-.6 .6-.8c.2-.4 .8-1 1.3-1.6c.2-.2 .5-.5 .6-.7c.2-.2 .5-.6 .8-1c.6-.7 .6-.6 .5-1.2c0-.8 0-.8-.9-.6"
    static let clock="M12.1 1.6c-.3 0-.6 0-.7 0c-.1 .1-.3 .1-.4 .1c-1.4 .2-3.4 1-4.7 1.8c-1.1 .7-1.5 1-2.4 1.9c-1.5 1.5-2.1 2.6-2.6 4.6c0 .2-.1 .4-.1 .5c-.5 2.1-.1 5 1.2 6.8c.8 1.2 2.5 2.9 3.7 3.7c2 1.2 5.2 1.8 7.5 1.3c1.9-.5 4.2-1.7 5.7-3c.9-.7 1.9-2 2.3-2.9c.6-1.1 1.1-2.6 1.2-3.3c0-.1 .1-.3 .1-.3c.1-.5 .1-2.3 0-2.9c0-.1-.1-.4-.2-.6c-.7-3.5-3-5.9-6.6-7c-.1 0-.5-.2-.7-.3c-.9-.4-1.8-.5-3.3-.4M12 4.5c0 0-.3 .1-.5 .1c-.4 .1-.7 .1-1 .1c-.6-.1-2.8 1.1-4 2.2c-1.6 1.5-2.7 4.5-2.4 6.5c.3 1.7 .8 2.6 2 3.8c1.4 1.4 2.3 1.9 4.2 2.3c1.9 .4 3.9-.1 6.1-1.6c3.6-2.4 4.7-7.6 2.3-10.7c-1.2-1.6-4.7-3-6.7-2.7M10.6 5.5c-.2 .2-.6 .6-.7 .8c-.2 .4-.1 6.8 0 7.2c.2 .3 .6 .6 .9 .8c.4 .1 1.4 .6 2 1.1c.1 .1 .3 .2 .6 .3c.2 .2 .6 .5 1 .7c1.3 .9 2 1 2.7 .3c.8-.9 .5-2-.6-2.7c-.1-.1-.7-.5-1.3-.9c-.9-.6-1.4-.9-1.8-1.1c-.5-.2-.7-.3-.7-.4c0-.1 0-.3-.1-2.1c0-.6-.1-1.3-.1-1.5c0-.2-.1-.6-.1-.9c0-1.3-.9-2-1.8-1.6"
    static let calendar="M15.2 .9c-.6 .2-.8 .6-.8 1.5c0 .7 .1 .6-1 .7c-1.4 .1-2.7 .2-4.5 .4c-1.3 .2-1.7 .2-1.7 .2c-.1 0-.1-.3-.1-.6c-.1-1-.6-1.5-1.4-1.5c-.9 .1-1.4 .7-1.3 1.9c.1 .5 .1 .5-.4 .6c-2.7 .5-3.2 1.1-2.9 3.7c.1 .3 .1 .8 .1 1c.1 .3 .1 .6 .1 .8c0 .1 .1 .5 .1 .9c.2 2.2 .2 2.7 .3 4.3c.1 .4 .1 1 .2 1.4c0 .8 .1 1.8 .2 2.6c.1 .8 .2 1.8 .3 2.5c0 .9 .1 1.1 .5 1.5c.5 .4 .8 .5 2 .3c.8-.1 1.4-.2 2-.2c1.7-.2 2.4-.3 3.2-.4c.5-.1 1.1-.1 2.2-.3c.3 0 1 0 1.5-.1c2.9-.2 4.8-.4 6.5-.6c.2 0 .6-.1 .9-.1c1.3-.2 1.8-.8 1.8-2.2c-.1-.9-.1-1.7-.2-2.1c0-.1 0-.5-.1-.7c0-.3 0-.6-.1-.9c-.1-1.1-.2-1.5-.2-2c-.1-1.1-.2-1.9-.3-2.5c-.2-2.4-.4-3.9-.7-5.3c-.1-.2-.1-.4-.1-.6c-.3-1.7-.9-2.1-3.3-2.1c-1 0-.9 .1-.9-.7c-.1-1.2-.9-1.8-1.9-1.4M17.2 5.6c-.1 0-.1 .1-.1 .1c0 .7-.7 1.4-1.4 1.4c-.7 0-1.3-.6-1.3-1.3c0-.1 0-.2-.1-.2c0 0-1.5 0-2.3 .1c-.3 0-.7 0-1 .1c-.3 0-.8 0-1.1 .1c-.3 0-.7 .1-1 .1c-1.6 .2-1.5 .1-1.5 .5c0 1.7-2.4 2-2.6 .3c-.1-.3-.1-.3-.6-.2c-.5 .1-.6 .2-.4 1.3c0 .2 .1 .5 .1 .7c.1 1.1 .1 1.2 .3 1.1c0 0 .2 0 .5-.1c.3 0 .5 0 .5 0c.1 0 .4-.1 .7-.1c.3 0 .8-.1 1.1-.1c.9-.1 1.6-.2 2.2-.3c.4 0 .9-.1 1.2-.1c1-.1 2.3-.2 4-.4c.3 0 .7 0 .9 0c.1-.1 .4-.1 .6-.1c.2 0 .5 0 .7-.1c.2 0 .5 0 .8 0c1.8-.2 1.8-.2 1.7-.6c0-.1-.1-.3-.1-.4c-.2-1.3-.3-1.7-.5-1.8c-.1-.1-1.3-.1-1.3 0M18.4 10.8c-1.9 .2-2.8 .2-5.4 .5c-.8 0-1.7 .1-2.5 .2c-.4 0-.9 .1-1.2 .1c-1.5 .2-1.9 .2-3.4 .4c-.2 0-.7 .1-1 .1c-.8 .1-.7 .1-.7 .9c.1 .3 .1 .7 .1 .8c0 .2 .1 1.2 .2 2.1c.1 1 .2 2 .3 2.8c0 .4 0 .9 .1 1.2c0 .7 .1 .7 .3 .7c.4-.1 1.4-.2 2.7-.4c.3 0 .7 0 1-.1c.2 0 .7-.1 1-.1c.4 0 .9-.1 1.2-.1c1.6-.2 1.9-.2 4.4-.4c2.9-.2 4.7-.4 4.8-.6c0-.1-.1-1.4-.3-3.2c-.1-.8-.2-1.6-.3-2.3c-.1-1.7-.2-2.6-.2-2.7c-.1 0-.4 0-1.1 .1M16.2 14c-1.3 .5-1.5 2.2-.3 3c1.8 1 3.6-1.4 2-2.7c-.4-.4-1.1-.5-1.7-.3M11.8 14.5c-1.3 .3-1.7 1.8-.8 2.7c.9 .9 2.4 .5 2.8-.8c.3-1.1-.9-2.3-2-1.9M7 15c-1.3 .5-1.6 2.1-.5 2.9c1.3 1 3.3-.5 2.6-2c-.4-.7-1.4-1.1-2.1-.9"
    static let calendarBlank="M15.2 .9c-.6 .2-.8 .6-.8 1.5c0 .7 .1 .6-1 .7c-1.4 .1-2.7 .2-4.5 .4c-1.3 .2-1.7 .2-1.7 .2c-.1 0-.1-.3-.1-.6c-.1-1-.6-1.5-1.4-1.5c-.9 .1-1.4 .7-1.3 1.9c.1 .5 .1 .5-.4 .6c-2.7 .5-3.2 1.1-2.9 3.7c.1 .3 .1 .8 .1 1c.1 .3 .1 .6 .1 .8c0 .1 .1 .5 .1 .9c.2 2.2 .2 2.7 .3 4.3c.1 .4 .1 1 .2 1.4c0 .8 .1 1.8 .2 2.6c.1 .8 .2 1.8 .3 2.5c0 .9 .1 1.1 .5 1.5c.5 .4 .8 .5 2 .3c.8-.1 1.4-.2 2-.2c1.7-.2 2.4-.3 3.2-.4c.5-.1 1.1-.1 2.2-.3c.3 0 1 0 1.5-.1c2.9-.2 4.8-.4 6.5-.6c.2 0 .6-.1 .9-.1c1.3-.2 1.8-.8 1.8-2.2c-.1-.9-.1-1.7-.2-2.1c0-.1 0-.5-.1-.7c0-.3 0-.6-.1-.9c-.1-1.1-.2-1.5-.2-2c-.1-1.1-.2-1.9-.3-2.5c-.2-2.4-.4-3.9-.7-5.3c-.1-.2-.1-.4-.1-.6c-.3-1.7-.9-2.1-3.3-2.1c-1 0-.9 .1-.9-.7c-.1-1.2-.9-1.8-1.9-1.4M17.2 5.6c-.1 0-.1 .1-.1 .1c0 .7-.7 1.4-1.4 1.4c-.7 0-1.3-.6-1.3-1.3c0-.1 0-.2-.1-.2c0 0-1.5 0-2.3 .1c-.3 0-.7 0-1 .1c-.3 0-.8 0-1.1 .1c-.3 0-.7 .1-1 .1c-1.6 .2-1.5 .1-1.5 .5c0 1.7-2.4 2-2.6 .3c-.1-.3-.1-.3-.6-.2c-.5 .1-.6 .2-.4 1.3c0 .2 .1 .5 .1 .7c.1 1.1 .1 1.2 .3 1.1c0 0 .2 0 .5-.1c.3 0 .5 0 .5 0c.1 0 .4-.1 .7-.1c.3 0 .8-.1 1.1-.1c.9-.1 1.6-.2 2.2-.3c.4 0 .9-.1 1.2-.1c1-.1 2.3-.2 4-.4c.3 0 .7 0 .9 0c.1-.1 .4-.1 .6-.1c.2 0 .5 0 .7-.1c.2 0 .5 0 .8 0c1.8-.2 1.8-.2 1.7-.6c0-.1-.1-.3-.1-.4c-.2-1.3-.3-1.7-.5-1.8c-.1-.1-1.3-.1-1.3 0M18.4 10.8c-1.9 .2-2.8 .2-5.4 .5c-.8 0-1.7 .1-2.5 .2c-.4 0-.9 .1-1.2 .1c-1.5 .2-1.9 .2-3.4 .4c-.2 0-.7 .1-1 .1c-.8 .1-.7 .1-.7 .9c.1 .3 .1 .7 .1 .8c0 .2 .1 1.2 .2 2.1c.1 1 .2 2 .3 2.8c0 .4 0 .9 .1 1.2c0 .7 .1 .7 .3 .7c.4-.1 1.4-.2 2.7-.4c.3 0 .7 0 1-.1c.2 0 .7-.1 1-.1c.4 0 .9-.1 1.2-.1c1.6-.2 1.9-.2 4.4-.4c2.9-.2 4.7-.4 4.8-.6c0-.1-.1-1.4-.3-3.2c-.1-.8-.2-1.6-.3-2.3c-.1-1.7-.2-2.6-.2-2.7c-.1 0-.4 0-1.1 .1"
    static let sparkles="M18.8 1.2c-.5 .3-.8 .7-.8 1.4c0 .6 0 .6-.7 .7c-2 .2-1.8 2.7 .1 2.7c.6 0 .6-.1 .6 .5c0 1 .5 1.5 1.4 1.5c.9 0 1.4-.5 1.4-1.7c0-.8 0-.8 .5-.8c2.1-.3 2-2.8-.1-2.8c-.5 0-.5 0-.5-.3c0-1-1.1-1.6-1.9-1.2M11 3.2c-.4 .2-.7 .4-.8 .7c-.1 .2-.2 .4-.3 .5c-.1 .1-.3 .5-.4 .9c-.5 1-1 1.8-1.6 2.5c-1.2 1.6-3.6 3.2-5.5 3.7c-.8 .2-1.2 .6-1.2 1.3c0 .7 .6 1.3 1.3 1.3c.4 0 1.6 .6 2.6 1.2c2.3 1.5 3.3 3 3.9 5.6c0 .1 .1 .4 .1 .6c.1 2 2.5 1.9 2.8-.1c.3-2.2 1.4-4.4 3-6.1c1-1 2.3-1.8 3-1.8c.8 0 1.5-.9 1.2-1.7c-.2-.5-.5-.8-1.2-.9c-2.9-.5-5.5-3.4-5.4-6.2c0-1-.7-1.7-1.5-1.5M10.1 9.5c-.8 1.2-2.1 2.3-3.5 3.1c-.2 .1-.3 .2-.1 .3c1.1 .6 2.9 2.2 3.7 3.5c.2 .2 .2 .2 .5-.2c.9-1.4 2-2.8 3-3.6c.3-.3 .3-.3 0-.5c-.1-.1-.4-.3-.6-.4c-.7-.5-1.5-1.5-2.1-2.5c-.3-.5-.3-.5-.9 .3"
    static let sticky="M19.4 .6c-.3 .1-.5 .2-.7 .5l-.2 .2l-1 0c-2.3 0-3.4 .1-6.3 .7c-.3 .1-.6 .2-.7 .2c-.2 0-.3 .1-.4 .1c-.1 0-.9 .2-1.4 .2c-.3 .1-.5 .1-1.9 .2c-.7 .1-1.5 .2-1.6 .2c-.1 .1-.2 0-.2-.1c0-.2-.3-.6-.4-.7c-.9-.8-2.3-.2-2.4 1c-.1 .5-.1 .5-.4 .7c-1.1 .5-1.1 1.9-.1 2.4c.3 .1 .3-.2 .3 3.3c0 3 0 5.7 .1 7c0 .3 .1 .9 .1 1.3c0 .5 0 1.1 .1 1.5c0 .7 0 .7-.3 .9c-1.1 .6-.9 2.3 .3 2.4c.3 .1 .3 .1 .4 .3c.5 .8 1.9 .7 2.4-.2c.1-.3 .1-.2 .8-.3c.8-.1 1.3-.2 2.7-.4c.3 0 .7-.1 1-.1c.3 0 .6-.1 .7-.1c0 0 .3 0 .5-.1c.4 0 1.1-.1 2-.2c1.2-.1 1.7-.2 1.8-.2c.1 0 .3 0 .5 .1c.6 0 1.2-.2 1.5-.6c0-.1 .5-.6 1-1.1c.8-.8 1.1-1.1 2-2.2c.6-.5 1.4-1.6 1.8-2.1c.2-.3 .4-.6 .6-.7c.4-.4 .6-1 .4-1.6c0-.1 0-.4-.1-.8c0-.3-.1-.8-.1-1.1c-.2-1.5-.2-1.8-.2-2.4c-.2-1.4-.3-3.4-.4-4.4c0-.4 0-.4 .3-.4c.4-.1 .8-.4 .9-.8c.5-.9-.2-1.9-1.4-1.9c-.2 0-.2 0-.5-.3c-.4-.4-1-.6-1.5-.4M15.9 4.1c-.9 .1-1.8 .2-3.4 .6c-1 .2-1.2 .3-1.8 .4c-.8 .2-.9 .2-1.2 .2c-.1 0-.3 0-.5 .1c-.1 0-.4 0-.7 0c-.3 .1-.8 .1-1.1 .1c-2.1 .2-2.2 .3-2.3 .7c-.1 .6-.1 5.2 0 7.7c.2 4.6 .2 5.4 .3 5.5c0 .2 .1 .2 2-.1c.9-.1 1.8-.2 2.8-.4c.9-.1 1.6-.1 2.1-.2c.3 0 .7-.1 .9-.1c.6-.1 .6 0 .6-.8c-.1-.7 0-2 .1-2.4c0-.2 0-.5 0-.7c.1-1 .6-1.6 1.5-1.7c.2 0 .5 0 .6-.1c.7-.1 1.7-.3 3-.5c.2 0 .5 0 .5-.1c0 0 0-.8-.2-1.9c0-.3 0-.7-.1-1c0-.3 0-.8-.1-1c0-.2 0-.7 0-1.1c-.1-1.9-.2-3.1-.3-3.2c-.1-.1-2-.1-2.7 0M17.3 15.4c-.1 0-.2 .1-.3 .1c-.4 .1-.4 0-.5 .3c-.1 .3-.1 .9 0 .9c.1 0 1.2-1.2 1.2-1.3c-.1 0-.4 0-.4 0"
}

/// 專注計時: a hand-drawn hourglass — the bars overshoot, the glass bows out and
/// pinches a little off-centre, sand heaped in the bottom bulb. It reads as
/// "timer" even at 18pt (the old bracket-and-dot focus glyph looked like a
/// camera's focus frame), and it can't be confused with 下一個行程's clock.
struct InkHourglass:View {
    var body:some View {
        GeometryReader{g in
            let k=min(g.size.width,g.size.height)/24
            ZStack{
                InkHourglassLine().stroke(style:StrokeStyle(lineWidth:2.3*k,lineCap:.round,lineJoin:.round))
                InkHourglassSand().fill()
            }
        }
    }
}
struct InkHourglassLine:Shape {
    func path(in r:CGRect)->Path {
        let P=penguinPoint(r)
        var p=Path()
        p.move(to:P(4.6,3.7));p.addQuadCurve(to:P(19.4,2.8),control:P(12.0,2.5))
        p.move(to:P(4.4,21.0));p.addQuadCurve(to:P(19.6,21.5),control:P(12.2,22.1))
        p.move(to:P(6.6,3.8));p.addCurve(to:P(11.0,12.1),control1:P(6.3,8.0),control2:P(9.2,10.4))
        p.addCurve(to:P(6.3,20.9),control1:P(8.9,13.9),control2:P(5.9,16.6))
        p.move(to:P(17.6,3.1));p.addCurve(to:P(13.2,12.0),control1:P(17.9,7.8),control2:P(15.0,10.3))
        p.addCurve(to:P(18.0,21.3),control1:P(15.3,13.8),control2:P(18.4,16.7))
        return p
    }
}
struct InkHourglassSand:Shape {
    func path(in r:CGRect)->Path {
        let P=penguinPoint(r),k=min(r.width,r.height)/24
        var p=Path()
        // What's left up top, then the heap below, then the falling thread.
        p.move(to:P(8.4,6.8));p.addQuadCurve(to:P(15.8,6.4),control:P(12.1,7.5))
        p.addQuadCurve(to:P(12.1,10.5),control:P(14.6,9.3));p.addQuadCurve(to:P(8.4,6.8),control:P(9.6,9.5));p.closeSubpath()
        p.move(to:P(7.5,20.4));p.addCurve(to:P(16.8,20.5),control1:P(9.0,15.9),control2:P(14.9,15.5));p.closeSubpath()
        let t=P(11.65,12.6)
        p.addRoundedRect(in:CGRect(x:t.x,y:t.y,width:0.9*k,height:4.4*k),cornerSize:CGSize(width:0.45*k,height:0.45*k))
        return p
    }
}
/// 當週日曆: the hand-inked calendar page with this week written inside as one
/// row of seven dots, Monday first — days with something on them full, free
/// days faint, today a big dot. (The earlier seven bars of different heights
/// read as phone signal strength.) The faces also say 「本週」 in words.
struct InkWeek:View {
    var counts:[Int];var today:Int
    var body:some View {
        GeometryReader{g in
            let k=min(g.size.width,g.size.height)/24
            let ox=(g.size.width-24*k)/2,oy=(g.size.height-24*k)/2
            let wobble:[CGFloat]=[0.2,-0.25,0.1,-0.15,0.3,-0.1,0.05]
            ZStack(alignment:.topLeading){
                InkGlyph(d:InkPaths.calendarBlank).fill(style:FillStyle(eoFill:true))
                ForEach(0..<7,id:\.self){i in
                    let busy=i < counts.count && counts[i] > 0,isToday=i == today
                    let d:CGFloat=isToday ? 2.5:(busy ? 1.6:1.15)
                    Circle().frame(width:d*k,height:d*k).opacity(isToday || busy ? 1:0.4)
                        .position(x:ox+(5.9+CGFloat(i)*2.1)*k,y:oy+(15.6+wobble[i])*k)
                }
            }
        }
    }
}
/// 今日任務's list rows: a small hand-drawn box (corners overshoot, sides lean),
/// ticked with one stroke that flies out past the corner when the task is done.
struct InkBox:View {
    var checked:Bool
    var body:some View {
        GeometryReader{g in
            let k=min(g.size.width,g.size.height)/24
            InkBoxLine(checked:checked).stroke(style:StrokeStyle(lineWidth:2.6*k,lineCap:.round,lineJoin:.round))
        }
    }
}
struct InkBoxLine:Shape {
    var checked:Bool
    func path(in r:CGRect)->Path {
        let P=penguinPoint(r)
        var p=Path()
        p.move(to:P(4.6,5.9));p.addQuadCurve(to:P(18.3,4.9),control:P(11.5,5.0))
        p.addQuadCurve(to:P(18.9,19.0),control:P(19.0,12.0))
        p.addQuadCurve(to:P(5.2,19.4),control:P(12.0,19.6))
        p.addQuadCurve(to:P(4.4,4.4),control:P(4.3,12.2))
        if checked {p.move(to:P(7.9,11.6));p.addLine(to:P(11.2,15.4));p.addQuadCurve(to:P(21.6,2.6),control:P(15.5,8.0))}
        return p
    }
}
/// A loose pen circle around today's date in the mini month: it doesn't quite
/// close, the end runs on past the start like a quick pen loop.
struct InkRing:Shape {
    func path(in r:CGRect)->Path {
        let cx=r.midX,cy=r.midY,rx=r.width/2,ry=r.height/2
        let wobble:[CGFloat]=[1.0,1.06,0.97,1.04,0.95,1.03,1.0,0.96,1.05,1.08,1.12]
        var pts:[CGPoint]=[]
        for (i,w) in wobble.enumerated() {
            let a=(-100.0+Double(i)*41.0)*Double.pi/180   // 410° in all: overshoots the start
            pts.append(CGPoint(x:cx+rx*w*CGFloat(cos(a)),y:cy+ry*w*CGFloat(sin(a))))
        }
        var p=Path();p.move(to:pts[0])
        for i in 1..<pts.count-1 {
            let mid=CGPoint(x:(pts[i].x+pts[i+1].x)/2,y:(pts[i].y+pts[i+1].y)/2)
            p.addQuadCurve(to:mid,control:pts[i])
        }
        p.addLine(to:pts[pts.count-1])
        return p
    }
}
