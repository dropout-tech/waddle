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

/** Floating chrome. Some of it lets taps fall through its visible body (the timer pill only takes clicks on a
 *  transparent strip), so hit-testing can't see it — take its visible box instead. */
const FLOATING = '[data-hide-on-keyboard], [data-tour="focus-timer"], [data-sonner-toast]'

function floatingRects(hide: HTMLElement[]): Rect[] {
  const out: Rect[] = []
  for (const el of document.querySelectorAll<HTMLElement>(FLOATING)) {
    if (hide.some((h) => h === el || h.contains(el))) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height })
  }
  return out
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

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
  const cells = new Uint8Array(rows * cols)
  const busy = makeBusy()
  const saved = hide.map((el) => el.style.visibility)
  hide.forEach((el) => {
    el.style.visibility = 'hidden'
  })
  try {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.min(W - 1, c * STEP + STEP / 2)
        const y = Math.min(H - 1, r * STEP + STEP / 2)
        if (busy(document.elementFromPoint(x, y))) cells[r * cols + c] = 1
      }
    }
  } finally {
    hide.forEach((el, i) => {
      el.style.visibility = saved[i]
    })
  }
  for (const f of floatingRects(hide)) {
    const c0 = Math.max(0, Math.floor(f.x / STEP)), c1 = Math.min(cols, Math.ceil((f.x + f.w) / STEP))
    const r0 = Math.max(0, Math.floor(f.y / STEP)), r1 = Math.min(rows, Math.ceil((f.y + f.h) / STEP))
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) cells[r * cols + c] = 1
  }
  for (let r = 0; r < rows; r++) {
    let rowSum = 0
    for (let c = 0; c < cols; c++) {
      rowSum += cells[r * cols + c]
      sum[(r + 1) * (cols + 1) + (c + 1)] = sum[r * (cols + 1) + (c + 1)] + rowSum
    }
  }
  // `pad` keeps a margin around the rect: the grid samples cell centres, so without it an edge could
  // still slide a few px under a neighbour (the question bubble under the timer pill).
  const clear = (r: Rect, padX = 0, padY = 0) => {
    const rect = { x: r.x - padX, y: r.y - padY, w: r.w + padX * 2, h: r.h + padY * 2 }
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
  if (floatingRects(hide).some((f) => overlaps(f, rect))) return false
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
    if (clear({ x: x + w + 6, y: cy, w: p.chip.w, h: p.chip.h }, 10, 4)) return 'right'
    if (clear({ x, y: y - p.chip.h - 4, w: p.chip.w, h: p.chip.h }, 10, 4)) return 'above'
    if (clear({ x: x - 6 - p.chip.w, y: cy, w: p.chip.w, h: p.chip.h }, 10, 4)) return 'left'
    return 'none'
  }
  const xs: number[] = []
  for (let x = p.start.x; x <= W - w - EDGE; x += 8) xs.push(x)
  for (let x = p.start.x - 8; x >= EDGE; x -= 8) xs.push(x)
  for (let y = p.start.y; y >= EDGE; y -= 8) {
    for (const x of xs) {
      if (clear({ x, y, w, h }, 6, 0)) return { x, y, chip: chipAt(x, y) }
    }
  }
  return null
}
