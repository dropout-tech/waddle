/**
 * Where can a small floating thing sit on a phone without covering anything you can tap or read as a
 * heading? (喝水提醒 C on the 任務 tab used to sit on 「＋ 新增任務」 and the 「歡迎」 title — 驗收 2026-10-10.)
 *
 * One synchronous pass hit-tests the viewport on a coarse grid (our own element hidden for the pass —
 * no paint happens in between, so nothing flickers), marks every cell whose topmost element is a
 * control, a heading, anything with a pointer cursor, or anything that carries its own text or an
 * image (a date, a label — not tappable, but still something you'd want to read), then walks candidate
 * spots from the preferred one outward/upward and returns the first that is completely clear (only
 * plain background underneath). `null` = nowhere is clear.
 */

const INTERACTIVE =
  'button, a[href], input, select, textarea, summary, label, [role="button"], [role="checkbox"], [role="tab"], ' +
  '[role="menuitem"], [role="switch"], [role="link"], [role="option"], [contenteditable="true"], [draggable="true"], ' +
  'h1, h2, h3, h4, h5, h6, [role="heading"]'

export type ChipSide = 'right' | 'above' | 'left' | 'none'
export interface FreeSpot {
  x: number
  y: number
  chip: ChipSide
}

type Rect = { x: number; y: number; w: number; h: number }

const MEDIA = 'img, svg, canvas, video, picture'

function ownText(el: Element) {
  for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return true
  return false
}

/** Something under this point that shouldn't be covered? (cached per element for one pass) */
function makeBusy() {
  const cache = new Map<Element, boolean>()
  return (el: Element | null): boolean => {
    if (!el || el === document.documentElement || el === document.body) return false
    const known = cache.get(el)
    if (known !== undefined) return known
    const hit = !!el.closest(INTERACTIVE) || !!el.closest(MEDIA) || ownText(el) || getComputedStyle(el).cursor === 'pointer'
    cache.set(el, hit)
    return hit
  }
}

const STEP = 10
const EDGE = 4

function occupancy(hide: HTMLElement[]) {
  const W = window.innerWidth
  const H = window.innerHeight
  const cols = Math.ceil(W / STEP)
  const rows = Math.ceil(H / STEP)
  // prefix sums over "busy" cells: sum[(r+1)*(cols+1) + (c+1)]
  const sum = new Uint32Array((rows + 1) * (cols + 1))
  const busy = makeBusy()
  const saved = hide.map((el) => el.style.visibility)
  hide.forEach((el) => {
    el.style.visibility = 'hidden'
  })
  try {
    for (let r = 0; r < rows; r++) {
      let rowSum = 0
      for (let c = 0; c < cols; c++) {
        const x = Math.min(W - 1, c * STEP + STEP / 2)
        const y = Math.min(H - 1, r * STEP + STEP / 2)
        rowSum += busy(document.elementFromPoint(x, y)) ? 1 : 0
        sum[(r + 1) * (cols + 1) + (c + 1)] = sum[r * (cols + 1) + (c + 1)] + rowSum
      }
    }
  } finally {
    hide.forEach((el, i) => {
      el.style.visibility = saved[i]
    })
  }
  const clear = (rect: Rect) => {
    if (rect.x < EDGE || rect.y < EDGE || rect.x + rect.w > W - EDGE || rect.y + rect.h > H - EDGE) return false
    const c0 = Math.max(0, Math.floor(rect.x / STEP))
    const r0 = Math.max(0, Math.floor(rect.y / STEP))
    const c1 = Math.min(cols, Math.ceil((rect.x + rect.w) / STEP))
    const r1 = Math.min(rows, Math.ceil((rect.y + rect.h) / STEP))
    const n = sum[r1 * (cols + 1) + c1] - sum[r0 * (cols + 1) + c1] - sum[r1 * (cols + 1) + c0] + sum[r0 * (cols + 1) + c0]
    return n === 0
  }
  return { W, H, clear }
}

/** Is this rect (e.g. where the drop is now) still clear? Cheap enough to poll. */
export function isRectClear(rect: Rect, hide: HTMLElement[]): boolean {
  const saved = hide.map((el) => el.style.visibility)
  hide.forEach((el) => {
    el.style.visibility = 'hidden'
  })
  const busy = makeBusy()
  try {
    for (let y = rect.y + 2; y < rect.y + rect.h; y += STEP) {
      for (let x = rect.x + 2; x < rect.x + rect.w; x += STEP) {
        if (busy(document.elementFromPoint(x, y))) return false
      }
    }
    return true
  } finally {
    hide.forEach((el, i) => {
      el.style.visibility = saved[i]
    })
  }
}

/**
 * Scan from `start` (top-left of the preferred spot): same row rightwards then leftwards, then each
 * row higher up. The chip (the short question) goes right of the drop, above it, or left of it —
 * whichever is clear; if none is, the drop shows alone.
 */
export function findFreeSpot(p: { hide: HTMLElement[]; drop: { w: number; h: number }; chip: { w: number; h: number }; start: { x: number; y: number } }): FreeSpot | null {
  const { W, clear } = occupancy(p.hide)
  const { w, h } = p.drop
  const chipAt = (x: number, y: number): ChipSide => {
    const cy = y + (h - p.chip.h) / 2
    if (clear({ x: x + w + 6, y: cy, w: p.chip.w, h: p.chip.h })) return 'right'
    if (clear({ x, y: y - p.chip.h - 4, w: p.chip.w, h: p.chip.h })) return 'above'
    if (clear({ x: x - 6 - p.chip.w, y: cy, w: p.chip.w, h: p.chip.h })) return 'left'
    return 'none'
  }
  const xs: number[] = []
  for (let x = p.start.x; x <= W - w - EDGE; x += 8) xs.push(x)
  for (let x = p.start.x - 8; x >= EDGE; x -= 8) xs.push(x)
  for (let y = p.start.y; y >= EDGE; y -= 8) {
    for (const x of xs) {
      if (clear({ x, y, w, h })) return { x, y, chip: chipAt(x, y) }
    }
  }
  return null
}
