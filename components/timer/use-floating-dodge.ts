'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 右下角浮動元件的「讓路」規矩，兩個住在同一個角落的元件共用：
 *   - components/timer/focus-timer.tsx   閒置時的計時啟動鈕（fixed z-40）
 *   - components/timer/focus-timer-mini.tsx 執行中的計時膠囊（fixed z-toast）
 *
 * 兩條規矩：
 *   1. 使用者在捲動時，手指屬於底下的內容 → 浮動元件暫時不吃點擊（仍看得見）。
 *   2. 靜止時若壓到別人的觸控目標，而對方已經沒有 44×44 可按 → 把被壓到的
 *      那一條讓出去，浮動元件只保留剩下的安全區當自己的點擊區。
 */

/** 捲動停止後多久恢復可點。 */
export const SCROLL_QUIET_MS = 400
/** 對方還留有這麼大的未被遮住區塊，就還按得到，浮動元件可以繼續待著。 */
const MIN_TOUCH_PX = 44
/** 浮動元件自己至少要留這麼寬（高）的一條才值得當點擊區，否則純顯示。 */
const MIN_HIT_PX = 24
/** 探測網格步距，必須小於 MIN_TOUCH_PX，否則會整顆漏掉小圖示鈕。 */
const PROBE_STEP_PX = 16
const INTERACTIVE_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [contenteditable="true"]'

/** 被壓到的範圍，換算成浮動元件自己的座標（0,0 = 它的左上角）。 */
export type BlockedRect = { left: number; top: number; right: number; bottom: number; w: number; h: number }

/** True while the page (or any inner overflow container) is scrolling, plus a
 *  short tail. Most of this app scrolls inside nested `overflow-y-auto`
 *  panels, whose scroll events never reach `window` — so we listen on the
 *  document's capture phase, which sees every one of them. */
export function useIsScrolling(enabled: boolean) {
  const [scrolling, setScrolling] = useState(false)
  // When the current scroll gesture began — lets the caller tell "expanded,
  // then scrolled" from "scrolled, then expanded" without another effect.
  const [scrollAt, setScrollAt] = useState(0)
  const runningRef = useRef(false)
  useEffect(() => {
    if (!enabled) return
    let idle: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      // Only two renders per gesture (start + settle), not one per frame.
      if (!runningRef.current) {
        runningRef.current = true
        setScrollAt(Date.now())
        setScrolling(true)
      }
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => {
        runningRef.current = false
        setScrolling(false)
      }, SCROLL_QUIET_MS)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      if (idle) clearTimeout(idle)
      runningRef.current = false
    }
  }, [enabled])
  return { scrolling: enabled && scrolling, scrollAt }
}

/** Glance mode's manners.
 *
 *  The test isn't "do we overlap" — a bottom-docked chip always overlaps
 *  something — but "does the control still have room for a finger": we measure
 *  the four uncovered strips of the control and require one of them to be at
 *  least 44×44. A full-width list row keeps hundreds of px to its left and is
 *  left alone; a 44×44 icon button loses too much and wins the argument.
 *
 *  Controls that win get their pixels back: the caller keeps its own tap area
 *  only on the part that isn't standing on them (see `freeHitArea`). */
export function useControlYield(active: boolean, ref: React.RefObject<HTMLElement | null>) {
  const [blocked, setBlocked] = useState<BlockedRect | null>(null)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const same = (a: BlockedRect | null, b: BlockedRect | null) =>
      a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right &&
        a.bottom === b.bottom && a.w === b.w && a.h === b.h)
    const check = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      // 導覽進行中：教學就是要使用者點這顆，別在這時候讓路。
      if (document.querySelector('[data-onboarding-tour]')) {
        setBlocked((prev) => (prev === null ? prev : null))
        return
      }
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      // 網格要比「別人的觸控目標」密：只探四角＋中心的話，一顆 44×44 的圖示鈕
      // 剛好卡在邊中間就會整個漏掉（2026-08-26 實測，啟動鈕 132px 寬時漏掉
      // 釘選鈕）。步距 16px < 44px，任何 44px 目標至少會被踩到一次。
      const axis = (min: number, max: number) => {
        const out: number[] = []
        for (let v = min; v < max; v += PROBE_STEP_PX) out.push(v)
        out.push(max)
        return out
      }
      const xs = axis(r.left + 2, r.right - 2)
      const ys = axis(r.top + 2, r.bottom - 2)
      const covered = new Set<Element>()
      for (const x of xs) {
        for (const y of ys) {
          for (const node of document.elementsFromPoint(x, y)) {
            // Skip ourselves — we want whatever the tap would have reached.
            if (node === el || el.contains(node)) continue
            const control = node.closest?.(INTERACTIVE_SELECTOR)
            if (control) covered.add(control)
            break
          }
        }
      }
      let union: BlockedRect | null = null
      for (const control of covered) {
        const c = control.getBoundingClientRect()
        const overlapW = Math.min(c.right, r.right) - Math.max(c.left, r.left)
        const overlapH = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)
        if (overlapW <= 0 || overlapH <= 0) continue
        const strips: Array<[number, number]> = [
          [Math.max(0, r.left - c.left), c.height],
          [Math.max(0, c.right - r.right), c.height],
          [c.width, Math.max(0, r.top - c.top)],
          [c.width, Math.max(0, c.bottom - r.bottom)],
        ]
        const room = Math.max(...strips.map(([w, h]) => Math.min(w, h)))
        if (room >= MIN_TOUCH_PX) continue // still tappable elsewhere — carry on
        // 1px of slack on every side so we never sit on the control's edge.
        const local = {
          left: Math.floor(Math.max(0, c.left - r.left) - 1),
          top: Math.floor(Math.max(0, c.top - r.top) - 1),
          right: Math.ceil(Math.min(r.width, c.right - r.left) + 1),
          bottom: Math.ceil(Math.min(r.height, c.bottom - r.top) + 1),
        }
        union = union
          ? {
              left: Math.min(union.left, local.left),
              top: Math.min(union.top, local.top),
              right: Math.max(union.right, local.right),
              bottom: Math.max(union.bottom, local.bottom),
              w: r.width,
              h: r.height,
            }
          : { ...local, w: r.width, h: r.height }
      }
      setBlocked((prev) => (same(prev, union) ? prev : union))
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check) }
    schedule()
    // Layout under a fixed element changes for reasons no single event covers
    // (route change, sheet close, list re-render), so a slow poll backs up the
    // scroll/resize listeners. Callers switch `active` off while the user is
    // scrolling (nothing is tappable then anyway), so this grid never runs
    // per-frame during a flick.
    const poll = setInterval(schedule, 500)
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      clearInterval(poll)
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [active, ref])
  return active ? blocked : null
}

/** 浮動元件自己的點擊區：沒壓到別人的那一條裡最大的一塊。
 *  `null` = 已經沒有安全的地方了，這一刻它只負責顯示。 */
export function freeHitArea(blocked: BlockedRect | null): React.CSSProperties | null {
  if (!blocked) return { inset: 0 }
  const { left, top, right, bottom, w, h } = blocked
  const options: Array<{ area: number; min: number; style: React.CSSProperties }> = [
    { area: w * top, min: top, style: { left: 0, right: 0, top: 0, height: top } },
    { area: w * (h - bottom), min: h - bottom, style: { left: 0, right: 0, top: bottom, bottom: 0 } },
    { area: left * h, min: left, style: { left: 0, top: 0, bottom: 0, width: left } },
    { area: (w - right) * h, min: w - right, style: { left: right, right: 0, top: 0, bottom: 0 } },
  ]
  const best = options
    .filter((o) => o.min >= MIN_HIT_PX)
    .sort((a, b) => b.area - a.area)[0]
  return best ? best.style : null
}
