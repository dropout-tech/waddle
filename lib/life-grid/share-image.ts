/**
 * 「分享我的一年」— draws the year as a 1080×1920 (IG story) PNG on a plain
 * canvas and hands it to the platform share sheet.
 *
 * Privacy by default: the image carries ONLY the year, the colored day
 * blocks, a few axis numerals and the small Huddle penguin mark. No line the
 * user wrote ever touches the canvas (the drawer never receives the text).
 */
import { MOOD_COLORS } from '@/lib/palette'
import { isNative } from '@/lib/platform'
import { saveOrShareBlob } from '@/lib/share'
import { daysInMonth, dateKey, type Mood } from './compute'

export const SHARE_WIDTH = 1080
export const SHARE_HEIGHT = 1920

const PAPER = '#f6f3e9'
const INK = '#292b24'
const MUTED = '#66645a'
const EMPTY = '#e7e0cc' // a past day without a line — quiet, not a "miss"
const FUTURE = '#e0d8c0'
const BRAND = '#cf5731'

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Small deterministic PRNG so the "hand-cut" wobble is the same every export. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A rounded rect whose corners and edges wobble a little — squares cut by hand. */
function wobblyRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rand: () => number) {
  const j = () => (rand() - 0.5) * 2.2
  const rr = () => r * (0.75 + rand() * 0.5)
  const [r1, r2, r3, r4] = [rr(), rr(), rr(), rr()]
  ctx.beginPath()
  ctx.moveTo(x + r1 + j(), y + j())
  ctx.quadraticCurveTo(x + w / 2, y + j(), x + w - r2 + j(), y + j())
  ctx.quadraticCurveTo(x + w + j(), y + j(), x + w + j(), y + r2)
  ctx.quadraticCurveTo(x + w + j(), y + h / 2, x + w + j(), y + h - r3)
  ctx.quadraticCurveTo(x + w + j(), y + h + j(), x + w - r3, y + h + j())
  ctx.quadraticCurveTo(x + w / 2, y + h + j(), x + r4, y + h + j())
  ctx.quadraticCurveTo(x + j(), y + h + j(), x + j(), y + h - r4)
  ctx.quadraticCurveTo(x + j(), y + h / 2, x + j(), y + r1)
  ctx.quadraticCurveTo(x + j(), y + j(), x + r1, y)
  ctx.closePath()
}

/**
 * Render the year. `moods` maps YYYY-MM-DD → mood (null = written without a
 * mood); dates absent from the map are unwritten. `today` decides which
 * unwritten days are "past" (paper-dim) vs "future" (outline only).
 */
export async function drawLifeGridImage(year: number, moods: ReadonlyMap<string, Mood | null>, today: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_WIDTH
  canvas.height = SHARE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')

  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif'

  const rand = rng(year)
  const [texture, penguin] = await Promise.all([loadImage('/art/paper-texture.jpg'), loadImage('/art/penguin/happy.webp')])

  // Paper
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)

  // Year + the single terracotta accent stroke under it
  const left = 96
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 168px ${family}`
  ctx.fillText(String(year), left - 6, 318)
  ctx.fillStyle = BRAND
  wobblyRect(ctx, left, 352, 132, 12, 6, rand)
  ctx.fill()

  // Grid: months across (12 columns), days down (31 rows) — portrait fits a story.
  const gridLeft = 168
  const gridRight = SHARE_WIDTH - left
  const gridTop = 486
  const gridBottom = 1560
  const colPitch = (gridRight - gridLeft) / 12
  const rowPitch = (gridBottom - gridTop) / 31
  const cellW = colPitch - 12
  const cellH = rowPitch - 7
  const radius = 9

  ctx.fillStyle = MUTED
  ctx.font = `500 28px ${family}`
  ctx.textAlign = 'center'
  for (let m = 1; m <= 12; m++) ctx.fillText(String(m), gridLeft + (m - 1) * colPitch + cellW / 2, gridTop - 26)
  ctx.textAlign = 'right'
  for (const d of [1, 10, 20, 31]) ctx.fillText(String(d), gridLeft - 22, gridTop + (d - 1) * rowPitch + cellH / 2 + 10)
  ctx.textAlign = 'left'

  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      const date = dateKey(year, m, d)
      const x = gridLeft + (m - 1) * colPitch
      const y = gridTop + (d - 1) * rowPitch
      wobblyRect(ctx, x, y, cellW, cellH, radius, rand)
      if (moods.has(date)) {
        const mood = moods.get(date)
        ctx.fillStyle = mood ? MOOD_COLORS[mood].hex : MUTED
        ctx.fill()
        // faint dry-brush brown edge, like the app's ink outlines
        ctx.strokeStyle = 'rgba(74, 59, 44, 0.32)'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (date <= today) {
        ctx.fillStyle = EMPTY
        ctx.fill()
      } else {
        ctx.strokeStyle = FUTURE
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  // Paper grain over everything drawn so far (the fills read as grainy
  // flat paint, the same look as the illustrations).
  if (texture) {
    const pattern = ctx.createPattern(texture, 'repeat')
    if (pattern) {
      ctx.save()
      ctx.globalAlpha = 0.45
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT)
      ctx.restore()
    }
  }
  ctx.save()
  ctx.fillStyle = 'rgba(74, 59, 44, 0.05)'
  for (let i = 0; i < 9000; i++) ctx.fillRect(rand() * SHARE_WIDTH, rand() * SHARE_HEIGHT, 1.6, 1.6)
  ctx.restore()

  // Signature: the hand-drawn Huddle penguin + wordmark
  const markH = 200
  const markY = SHARE_HEIGHT - 96 - markH
  let textX = left
  if (penguin) {
    const w = (penguin.naturalWidth / penguin.naturalHeight) * markH
    ctx.drawImage(penguin, left - 10, markY, w, markH)
    textX = left - 10 + w + 14
  }
  ctx.fillStyle = INK
  ctx.font = `600 52px ${family}`
  ctx.fillText('Huddle', textX, markY + markH * 0.62)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

const isCancel = (e: unknown) => {
  const name = (e as { name?: string })?.name
  const msg = String((e as { message?: string })?.message ?? '')
  return name === 'AbortError' || /cancel/i.test(msg)
}

/**
 * iOS/Android: native share sheet (file written to the app cache first, see
 * lib/share.ts). Web: Web Share with the PNG when the browser can share
 * files (phones, Safari), otherwise a normal download.
 */
export async function shareLifeGridImage(blob: Blob, filename: string): Promise<ShareOutcome> {
  if (isNative()) {
    try {
      await saveOrShareBlob(blob, filename)
      return 'shared'
    } catch (e) {
      if (isCancel(e)) return 'cancelled'
      throw e
    }
  }
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if (isCancel(e)) return 'cancelled'
      // Some browsers advertise file sharing but refuse at call time — fall through to download.
    }
  }
  await saveOrShareBlob(blob, filename)
  return 'downloaded'
}
