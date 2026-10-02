#!/usr/bin/env node
/**
 * Huddle hand-inked icons: icon sheet PNG(s) → components/icons/huddle-icons.tsx
 *
 * The sheets are drawn by an image model (prompts, originals and the log of
 * rejected tries live in docs/reports/2026-10-01-block-icons/). This script
 * cuts each sheet into icons, offsets the ink to the sheet's pen weight (the
 * same drawn line, a fatter or thinner pen), traces it to vector paths and
 * writes one React component per icon (24×24 viewBox, fill="currentColor").
 *
 * Two optical grades, both ≈2px of ink on screen: the notebook set (18–20px)
 * at 2.5 units, the toolbar set (14–16px) at 3.1 units.
 *
 * potrace + sharp are NOT project dependencies — install them in a throwaway
 * folder and point ICON_TOOLS_DIR at it:
 *
 *   mkdir /tmp/icon-tools && cd /tmp/icon-tools && npm init -y && npm i potrace sharp
 *   ICON_TOOLS_DIR=/tmp/icon-tools node scripts/icons/build-huddle-icons.mjs
 *
 * Flags: --preview <file.png>  also render a contact sheet at real sizes
 *        --dry                 measure + preview only, don't write the .tsx
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const TOOLS = process.env.ICON_TOOLS_DIR
if (!TOOLS) { console.error('set ICON_TOOLS_DIR (see header comment)'); process.exit(1) }
const req = createRequire(path.join(TOOLS, 'package.json'))
const sharp = req('sharp')
const potrace = req('potrace')

const ROOT = process.cwd()
const SHEET_DIR = 'docs/reports/2026-10-01-block-icons'
const OUT_FILE = 'components/icons/huddle-icons.tsx'

// ── tuning ────────────────────────────────────────────────────────────────
const BOX = 24            // viewBox units
const TARGET_STROKE = 2.5 // units; default pen (lucide is 2). Sheets override with { target }
const MAX_EXTENT = 22.5   // longest side an icon may take inside the box
const UP = 3              // supersampling before tracing
// Global pen multiplier on every target below. 2026-10-02 the boss compared
// 1 / 1.2 / 1.4 side by side (docs/reports/2026-10-02-ui-polish-26/) and chose
// 1.2: the 2.5/3.1-unit pens read thin at 16px. INK_WEIGHT overrides it for
// new comparisons.
const WEIGHT = Number(process.env.INK_WEIGHT || 1.2)

/**
 * Per-sheet grid + cell → icon name (`null` = cell not used), plus the pen:
 * { target } stroke in units, { scale } units per source px, { maxExtent }
 * longest side allowed, { blur, tol } how much the tracing smooths.
 */
const SHEETS = [
  // Both sheets are the same sketchy marker idiom (corners that cross and
  // stick out, leaning boxes, loops that overshoot). Earlier tries are kept
  // beside them for the record and are not used: v1 (notebook) and v2
  // (toolbar) were too clean/geometric — at 14–16px they read as "just
  // another line-icon set"; v3/v4 had wobble, but too subtle to survive 16px.
  //
  // Notebook set: shown at 18–20px.
  {
    file: 'sheet-v6-notebook.png', cols: 6, rows: 4, pen: 18.123859649122807, target: 2.5, scale: 0.122, maxExtent: 22, blur: 0.8, tol: 1.2,
    cells: [
      'Text', 'Heading1', 'Heading2', 'Heading3', 'Todo', 'BulletList',
      'NumberedList', 'Toggle', 'Quote', 'CodeBlock', 'Divider', 'Image',
      'Bold', 'Italic', 'Underline', 'Strikethrough', 'InlineCode', 'Link',
      'Undo', 'Redo', null /* "≡+" */, 'AddTask', null /* table */, null /* marker pen */,
    ],
    // the notebook top bar shows "升級為任務" at 14px → small grade
    extra: [{ from: 'AddTask', name: 'AddTaskSm' }],
  },
  // Toolbar set = the SMALL optical grade: shown at 14–16px, so the pen is
  // fatter in units — the same ~2px of ink on screen as the notebook set.
  {
    file: 'sheet-v5-toolbar.png', cols: 6, rows: 4, pen: 18.418977705274607, target: 3.1, scale: 0.125, maxExtent: 22, blur: 0.8, tol: 1.2,
    cells: [
      'ChevronLeft', 'ChevronRight', 'ChevronDown', 'More', 'Plus', 'Minus',
      'Bell', 'User', 'Users', 'Eye', 'EyeOff', 'Clock',
      'Notebook', 'StickyNote', 'Archive', 'BookOpen', 'BarChart', 'Download',
      'Settings', 'Sparkles', 'FloatingWindow', 'UndoSm', 'RedoSm', null /* toggle: the notebook sheet's is used */,
    ],
    // same drawing again at another weight: { from, name } + OPTIONS[name].target
    extra: [{ from: 'Bell', name: 'BellLg' }, { from: 'Sparkles', name: 'SparklesLg' }, { from: 'Plus', name: 'PlusLg' }],
  },
  // Navigation + user menu. Same style text as v5, word for word. The user-menu
  // icons are the small grade (16px); the three bottom-tab icons are shown at
  // 20px and get the 20px weight through OPTIONS. Rows 3–4 are spares.
  {
    file: 'sheet-v7-nav.png', cols: 6, rows: 4, pen: 16.83923431203224, target: 3.1, scale: 0.125, maxExtent: 22, blur: 0.8, tol: 1.2,
    cells: [
      'Focus', 'Tasks', 'Calendar', 'Mail', 'Gift', 'Document',
      'Clipboard', 'Building', 'Sun', 'Moon', 'LogOut', 'Phone',
      null, null, null, null, null, null,
      null, null, null, null, null, null,
    ],
  },
  // Notebook page chrome (top bar, folder sidebar, save status) + the
  // whiteboard tab candidate. Same style text as v7, word for word; small
  // grade (12–16px). Cell 2 "move to folder" read as a scribble at 16px — the
  // plain folder is used for that labelled menu item instead; cell 15 came
  // out as a magnifier, not a pin. Whiteboard 2/3 and the bottom two rows are
  // spares.
  {
    file: 'sheet-v8-notebook-chrome.png', cols: 6, rows: 4, pen: 17.8, target: 3.1, scale: 0.125, maxExtent: 22, blur: 0.8, tol: 1.2,
    cells: [
      'FolderPlus', null /* move to folder */, 'Grip', 'CloudOff', 'ArrowLeft', 'Whiteboard',
      null /* whiteboard on a ledge */, null /* pinned board */, 'Trash', 'Pencil', 'Check', 'Close',
      'Folder', null, null, null, null, null,
      null, null, null, null, null, null,
    ],
  },
]

/**
 * Per-icon hand-fixes. { scale } relative to the sheet scale, { fit } longest
 * side in units, { grow } extra ink in source px, { stroke } the drawing's
 * real line width when the measurement is off, { solid } mostly-filled shape,
 * { target } pen weight in units, { remix } rebuild from the icon's own blobs.
 */
const OPTIONS = {
  // The "1 2" are drawn too small to survive 16–20px: enlarge the digits.
  NumberedList: {
    fit: 21.5,
    remix: (parts) => {
      const mid = parts.reduce((a, p) => a + p.cy, 0) / parts.length
      return parts.map((part) => (part.w < 55
        ? { part, scale: 1.3, dx: -6, dy: part.cy < mid ? -8 : 8 }
        : { part, dx: 5, dy: part.cy < mid ? -8 : 8 }))
    },
  },
  Quote: { solid: true, scale: 1.1 },
  // Letters are drawn smaller than the pictograms — bring them up a little.
  // { grow } here corrects the pen: the quick stroke estimate reads these
  // glyphs as fatter than they are, so they came out at 2.1–2.4u instead of
  // 2.5u (measured on the output with a distance transform) and looked like
  // a thinner pen next to the "/" menu icons.
  Text: { scale: 1.12 }, Bold: { scale: 1.15, grow: 1.3 }, Italic: { scale: 1.1, grow: 0.45 }, Underline: { scale: 1.1, grow: -0.5 },
  InlineCode: { grow: 1.3 }, Link: { grow: 0.8 }, Undo: { grow: 1.2 }, Redo: { grow: 1.3 },
  // Divider: the sheet's long wavy rule, full width. (A plain dash was the
  // same shape as the zoom "−"; a rule between two short "text" strokes read
  // as a scribbled paragraph.)
  Divider: { fit: 22.5, grow: -0.55 },
  Toggle: { stroke: 16 },
  // Single-stroke arrows were drawn larger than the pictograms.
  ChevronLeft: { scale: 0.85 }, ChevronRight: { scale: 0.85 }, ChevronDown: { scale: 0.85 },
  // The bell trigger is drawn at 20px, so it gets the 20px weight.
  BellLg: { target: 2.6 },
  // Bottom tabs are 20px and the FAB plus 24px: same ~2px of ink on screen.
  Focus: { target: 2.5, grow: -1 }, Tasks: { target: 2.5 }, Calendar: { target: 2.5, grow: 0.5 }, SparklesLg: { target: 2.5, grow: 1 }, PlusLg: { target: 2.3 },
  Gift: { grow: 1.4 }, Sun: { grow: -1 },
  // Floating window = two overlapping windows: the big frame plus a small
  // frame that breaks out of its bottom-right corner. (Frame + solid square
  // inside was being read as "picture".) Built from the drawing's own blobs:
  // rub a gap around where the small window goes, stamp the square at 2×,
  // then hollow it into an outline.
  FloatingWindow: {
    stroke: 16.5, fit: 20.5,
    remix: (parts) => {
      const frame = parts.reduce((a, b) => (a.w > b.w ? a : b))
      const box = parts.find((p) => p !== frame)
      const at = { part: box, scale: 2, dx: 50, dy: 49 }
      return [{ part: frame }, { ...at, grow: 12, erase: true }, at, { ...at, grow: -8, erase: true }]
    },
  },
  // The arrow-into-tray is an open, airy shape between heavier neighbours in
  // the "more tools" menu; its pen measured the same as theirs (≈3.0u) but it
  // read thinner, so it gets a touch more ink.
  Download: { grow: 1.2 },
  AddTaskSm: { target: 3.1 },
  // Whiteboard is a bottom-tab candidate (20px) → the 20px weight.
  Whiteboard: { target: 2.5 },
  // wide drawings: keep the grown ink inside the 24-unit box
  FolderPlus: { fit: 21 }, CloudOff: { fit: 21 }, Trash: { fit: 21 }, Folder: { fit: 21 },
}

// ── raster helpers ────────────────────────────────────────────────────────
async function loadGray(file) {
  const { data, info } = await sharp(file).flatten({ background: '#ffffff' }).greyscale().raw()
    .toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

/** 8-connected components of ink (< 128). Returns [{minX,minY,maxX,maxY,area,cx,cy}] */
function components({ data, w, h }) {
  const label = new Int32Array(w * h)
  const out = []
  const stack = []
  for (let i = 0; i < w * h; i++) {
    if (data[i] >= 128 || label[i]) continue
    const id = out.length + 1
    const c = { minX: w, minY: h, maxX: 0, maxY: 0, area: 0, sx: 0, sy: 0 }
    stack.push(i); label[i] = id
    while (stack.length) {
      const p = stack.pop()
      const x = p % w, y = (p - x) / w
      c.area++; c.sx += x; c.sy += y
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (data[q] < 128 && !label[q]) { label[q] = id; stack.push(q) }
      }
    }
    c.cx = c.sx / c.area; c.cy = c.sy / c.area
    out.push(c)
  }
  return out
}

/** Disk dilation of a binary mask (1 = ink). */
function dilate(mask, w, h, r) {
  if (r <= 0) return mask
  const out = new Uint8Array(w * h)
  const R = Math.ceil(r)
  const offs = []
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r) offs.push([dx, dy])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue
    for (const [dx, dy] of offs) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1
    }
  }
  return out
}

/** Disk erosion (dilate the background). */
function erode(mask, w, h, r) {
  if (r <= 0) return mask
  const inv = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) inv[i] = mask[i] ? 0 : 1
  const fat = dilate(inv, w, h, r)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = fat[i] ? 0 : 1
  return out
}

/**
 * Hand-fix hook: rebuild an icon from its own ink blobs. `fn(parts)` gets the
 * blobs (sorted left→right, top→bottom; cx/cy/w/h in SOURCE px) and returns
 * [{ part, scale?, dx?, dy?, grow?, erase? }] — each blob is thickened (or
 * thinned), scaled about its own centre, moved, and stamped onto a fresh
 * canvas in order. `erase: true` rubs that shape out instead (to cut a gap
 * around something, or to hollow a solid blob into an outline). The same
 * blob may be used several times.
 */
function remix(mask, W, H, fn) {
  const label = new Int32Array(W * H)
  const parts = []
  const stack = []
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i]) continue
    const id = parts.length + 1
    const p = { id, minX: W, minY: H, maxX: 0, maxY: 0, area: 0 }
    stack.push(i); label[i] = id
    while (stack.length) {
      const q = stack.pop()
      const x = q % W, y = (q - x) / W
      p.area++
      if (x < p.minX) p.minX = x; if (x > p.maxX) p.maxX = x
      if (y < p.minY) p.minY = y; if (y > p.maxY) p.maxY = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx
        if (mask[n] && !label[n]) { label[n] = id; stack.push(n) }
      }
    }
    parts.push(p)
  }
  const big = parts.filter((p) => p.area > 30 * UP)
  for (const p of big) { p.cx = (p.minX + p.maxX) / 2 / UP; p.cy = (p.minY + p.maxY) / 2 / UP; p.w = (p.maxX - p.minX + 1) / UP; p.h = (p.maxY - p.minY + 1) / UP }
  big.sort((a, b) => (Math.abs(a.cx - b.cx) > 12 ? a.cx - b.cx : a.cy - b.cy))
  const M = 60 * UP // margin so scaled/moved blobs never clip
  const OW = W + 2 * M, OH = H + 2 * M
  const out = new Uint8Array(OW * OH)
  for (const op of fn(big)) {
    const p = op.part, sc = op.scale ?? 1
    let m = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) if (label[i] === p.id) m[i] = 1
    if (op.grow > 0) m = dilate(m, W, H, op.grow * UP)
    else if (op.grow < 0) m = erode(m, W, H, -op.grow * UP)
    const cx = (p.minX + p.maxX) / 2, cy = (p.minY + p.maxY) / 2
    const tx = cx + (op.dx ?? 0) * UP + M, ty = cy + (op.dy ?? 0) * UP + M
    const hw = ((p.maxX - p.minX) / 2 + 24 * UP) * sc, hh = ((p.maxY - p.minY) / 2 + 24 * UP) * sc
    for (let y = Math.max(0, Math.floor(ty - hh)); y < Math.min(OH, ty + hh); y++) {
      for (let x = Math.max(0, Math.floor(tx - hw)); x < Math.min(OW, tx + hw); x++) {
        const sx = Math.round(cx + (x - tx) / sc), sy = Math.round(cy + (y - ty) / sc)
        if (sx >= 0 && sy >= 0 && sx < W && sy < H && m[sy * W + sx]) out[y * OW + x] = op.erase ? 0 : 1
      }
    }
  }
  return { mask: out, W: OW, H: OH }
}

/** Mean stroke width in px: 2·area / perimeter (exact for long thin strokes). */
function strokeWidth(mask, w, h) {
  let area = 0, edge = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue
    area++
    if (!mask[y * w + x - 1] || !mask[y * w + x + 1] || !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x]) edge++
  }
  return edge ? (2 * area) / edge : 0
}

function trace(pngBuffer, optTolerance = 0.6) {
  return new Promise((resolve, reject) => {
    const t = new potrace.Potrace({ threshold: 128, turdSize: 20, optTolerance, alphaMax: 1.1 })
    t.loadImage(pngBuffer, (err) => (err ? reject(err) : resolve(t.getPathTag())))
  })
}

/** Absolute M/L/C path → transformed, rounded, relative-command path string. */
function transformPath(d, fn) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || []
  const fmt = (n) => {
    let s = (Math.round(n * 10) / 10).toString()
    if (s.startsWith('0.')) s = s.slice(1)
    else if (s.startsWith('-0.')) s = '-' + s.slice(2)
    return s
  }
  const join = (nums) => nums.map(fmt).reduce((acc, s) => acc + (acc && !s.startsWith('-') ? ' ' : '') + s, '')
  let out = ''
  let cmd = ''
  let i = 0
  let cx = 0, cy = 0 // current point, already rounded (so rounding never drifts)
  const rnd = (n) => Math.round(n * 10) / 10 // 0.1u ≈ 0.08px at 20px — invisible, and a third smaller
  const take = () => { const [x, y] = fn(parseFloat(tokens[i]), parseFloat(tokens[i + 1])); i += 2; return [rnd(x), rnd(y)] }
  while (i < tokens.length) {
    const tk = tokens[i]
    if (/[MLCZ]/i.test(tk)) { cmd = tk.toUpperCase(); i++; if (cmd === 'Z') { out += 'z'; } continue }
    if (cmd === 'M') { const [x, y] = take(); out += `M${join([x, y])}`; cx = x; cy = y; cmd = 'L' }
    else if (cmd === 'L') { const [x, y] = take(); out += `l${join([x - cx, y - cy])}`; cx = x; cy = y }
    else if (cmd === 'C') {
      const [x1, y1] = take(), [x2, y2] = take(), [x, y] = take()
      out += `c${join([x1 - cx, y1 - cy, x2 - cx, y2 - cy, x - cx, y - cy])}`; cx = x; cy = y
    } else throw new Error(`unexpected token ${tk}`)
  }
  return out
}

// ── main ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const previewIdx = args.indexOf('--preview')
const PREVIEW = previewIdx >= 0 ? args[previewIdx + 1] : null
const DRY = args.includes('--dry')

const icons = [] // { name, d, w, h }

for (const sheet of SHEETS) {
  const file = path.join(ROOT, SHEET_DIR, sheet.file)
  let img
  try { img = await loadGray(file) } catch { console.warn(`skip ${sheet.file} (not found)`); continue }
  const cw = img.w / sheet.cols, ch = img.h / sheet.rows
  const comps = components(img).filter((c) => c.area >= 12)

  // group components into cells by centroid
  const cells = Array.from({ length: sheet.cols * sheet.rows }, () => [])
  for (const c of comps) {
    const col = Math.min(sheet.cols - 1, Math.floor(c.cx / cw)), row = Math.min(sheet.rows - 1, Math.floor(c.cy / ch))
    cells[row * sheet.cols + col].push(c)
  }

  // first pass: crop masks + measure stroke so the whole sheet shares one scale
  const raw = []
  for (let k = 0; k < cells.length; k++) {
    const name = sheet.cells[k]
    if (!name) continue
    if (!cells[k].length) { console.warn(`${sheet.file} cell ${k + 1} (${name}) is empty`); continue }
    const b = cells[k].reduce((a, c) => ({
      minX: Math.min(a.minX, c.minX), minY: Math.min(a.minY, c.minY),
      maxX: Math.max(a.maxX, c.maxX), maxY: Math.max(a.maxY, c.maxY),
    }), { minX: 1e9, minY: 1e9, maxX: 0, maxY: 0 })
    const pad = 14
    const x0 = Math.max(0, b.minX - pad), y0 = Math.max(0, b.minY - pad)
    const x1 = Math.min(img.w, b.maxX + pad + 1), y1 = Math.min(img.h, b.maxY + pad + 1)
    const w = x1 - x0, h = y1 - y0
    // supersample the grey crop, then threshold → smooth binary mask
    const up = await sharp(file).flatten({ background: '#ffffff' }).greyscale()
      .extract({ left: x0, top: y0, width: w, height: h })
      .resize(w * UP, h * UP, { kernel: 'cubic' }).raw().toBuffer()
    const W = w * UP, H = h * UP
    const mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) mask[i] = up[i] < 128 ? 1 : 0
    raw.push({ name, mask, W, H, bw: b.maxX - b.minX + 1, bh: b.maxY - b.minY + 1, stroke: strokeWidth(mask, W, H) / UP })
  }
  for (const e of sheet.extra ?? []) {
    const src = raw.find((r) => r.name === e.from)
    if (src) raw.push({ ...src, name: e.name })
  }
  const strokes = raw.map((r) => r.stroke).sort((a, b) => a - b)
  // The sheet's typical line width. Pinned per sheet ({ pen }) once icons
  // are in use, so adding a cell later can't nudge every existing path.
  const median = sheet.pen ?? strokes[Math.floor(strokes.length / 2)]
  const maxSide = Math.max(...raw.map((r) => Math.max(r.bw, r.bh)))
  // One scale for the sheet (so every icon keeps the same pen), chosen so the
  // biggest drawing fits; then grow the ink until the stroke hits the target.
  const scale = sheet.scale ?? (sheet.maxExtent ?? MAX_EXTENT) / maxSide // units per source px
  const sheetTarget = sheet.target ?? TARGET_STROKE
  const sheetGrow = (sheetTarget / scale - median) / 2
  console.log(`\n${sheet.file}: median stroke ${median.toFixed(1)}px, biggest ${maxSide}px → scale ${scale.toFixed(4)} u/px, grow ${sheetGrow.toFixed(1)}px/side`)

  for (const r of raw) {
    const opt = OPTIONS[r.name] || {}
    if (opt.remix) {
      const m = remix(r.mask, r.W, r.H, opt.remix)
      r.mask = m.mask; r.W = m.W; r.H = m.H
      r.stroke = opt.stroke ?? median
      let a = r.W, b = r.H, c = 0, e = 0
      for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (r.mask[y * r.W + x]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > e) e = y }
      r.bw = (c - a + 1) / UP; r.bh = (e - b + 1) / UP
    }
    // sheet scale, unless the icon asks for its own fit — and never let a
    // drawing overflow the box (the widest doodles get capped individually)
    const cap = (sheet.maxExtent ?? MAX_EXTENT) / Math.max(r.bw, r.bh)
    const s = opt.fit ? opt.fit / Math.max(r.bw, r.bh) : Math.min(scale * (opt.scale ?? 1), cap)
    // Same pen everywhere: drawings with a thinner line get thickened, fatter
    // ones (single-stroke chevrons, plus…) get thinned. Icons that are mostly
    // solid ink measure "fat" without being so — mark them { solid: true }.
    const own = opt.stroke ?? (opt.solid ? median : r.stroke)
    const grow = ((opt.target ?? sheetTarget) * WEIGHT / s - own) / 2 + (opt.grow ?? 0)
    const fat = grow >= 0 ? dilate(r.mask, r.W, r.H, grow * UP) : erode(r.mask, r.W, r.H, -grow * UP)
    // bbox after growing
    let minX = r.W, minY = r.H, maxX = 0, maxY = 0
    for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) if (fat[y * r.W + x]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    const px = Buffer.alloc(r.W * r.H)
    for (let i = 0; i < r.W * r.H; i++) px[i] = fat[i] ? 0 : 255
    const png = await sharp(px, { raw: { width: r.W, height: r.H, channels: 1 } }).blur(UP * (sheet.blur ?? 0.9)).png().toBuffer()
    const tag = await trace(png, sheet.tol)
    const d0 = /d="([^"]+)"/.exec(tag)[1]
    const k = s / UP
    const wU = (maxX - minX + 1) * k, hU = (maxY - minY + 1) * k
    const ox = (BOX - wU) / 2 - minX * k + (opt.dx ?? 0), oy = (BOX - hU) / 2 - minY * k + (opt.dy ?? 0)
    const d = transformPath(d0, (x, y) => [x * k + ox, y * k + oy])
    icons.push({ name: r.name, d, wU, hU })
    console.log(`  ${r.name.padEnd(15)} src ${String(r.bw).padStart(3)}×${String(r.bh).padEnd(3)} stroke ${r.stroke.toFixed(1)}px grow ${grow.toFixed(1)} → ${wU.toFixed(1)}×${hU.toFixed(1)}u, ${d.length}B`)
  }
}

// ── output ────────────────────────────────────────────────────────────────
if (PREVIEW) {
  const sizes = [14, 16, 20]
  const cols = 8, cellW = 150, cellH = 78
  const rows = Math.ceil(icons.length / cols)
  const themes = [['#f6f3e9', '#292b24'], ['#22231e', '#f3eedd']]
  let svg = ''
  themes.forEach(([bg, fg], t) => {
    const top = t * (rows * cellH + 20)
    svg += `<rect x="0" y="${top}" width="${cols * cellW}" height="${rows * cellH + 20}" fill="${bg}"/>`
    icons.forEach((ic, i) => {
      const x = (i % cols) * cellW + 10, y = top + Math.floor(i / cols) * cellH + 12
      let cx = x
      for (const sz of sizes) {
        svg += `<svg x="${cx}" y="${y + (20 - sz) / 2}" width="${sz}" height="${sz}" viewBox="0 0 ${BOX} ${BOX}"><path d="${ic.d}" fill="${fg}" fill-rule="evenodd"/></svg>`
        cx += sz + 12
      }
      svg += `<svg x="${cx + 4}" y="${y - 6}" width="44" height="44" viewBox="0 0 ${BOX} ${BOX}"><path d="${ic.d}" fill="${fg}" fill-rule="evenodd"/></svg>`
      svg += `<text x="${x}" y="${y + 48}" font-family="Helvetica" font-size="10" fill="${fg}" opacity=".6">${ic.name}</text>`
    })
  })
  const Wd = cols * cellW, Hd = themes.length * (rows * cellH + 20)
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}">${svg}</svg>`
  for (const dpr of [1, 2]) {
    const f = PREVIEW.replace(/\.png$/, `@${dpr}x.png`)
    await sharp(Buffer.from(doc), { density: 72 * dpr }).png().toFile(f)
    console.log('preview →', f)
  }
}

if (!DRY) {
  const total = icons.reduce((a, i) => a + i.d.length, 0)
  const body = icons.map((ic) => `export const Ink${ic.name} = ink(\n  '${ic.name}',\n  '${ic.d}',\n)`).join('\n\n')
  const tsx = `// AUTO-GENERATED by scripts/icons/build-huddle-icons.mjs — do not edit by hand.
// Source sheets + prompts: ${SHEET_DIR}/ (see DESIGN.md → 圖示).
//
// Huddle's hand-inked icon family: traced from brush-pen drawings so the
// stroke wobbles like the mascot's outline. Drop-in for lucide icons —
// same \`className\` sizing, inherits \`currentColor\`, inline SVG (works
// offline in the Capacitor shell, no network fetch).
import type { SVGProps } from 'react'

export type InkIconProps = Omit<SVGProps<SVGSVGElement>, 'children'>

function ink(name: string, d: string) {
  function InkIcon(props: InkIconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 ${BOX} ${BOX}"
        width="${BOX}"
        height="${BOX}"
        fill="currentColor"
        fillRule="evenodd"
        aria-hidden="true"
        focusable="false"
        data-ink-icon={name}
        {...props}
      >
        <path d={d} />
      </svg>
    )
  }
  InkIcon.displayName = \`Ink\${name}\`
  return InkIcon
}

${body}
`
  writeFileSync(path.join(ROOT, OUT_FILE), tsx)
  console.log(`\nwrote ${OUT_FILE}: ${icons.length} icons, ${total} bytes of path data`)
}
