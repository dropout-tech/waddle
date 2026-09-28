/**
 * 專注計時的「浮動顯示」（影片子母畫面）。
 *
 * 桌面 Chrome / Edge 另有更好的 Document PiP 懸浮工作站（lib/floating-hub.ts），
 * 其餘環境（iOS App 的 WKWebView、Safari、Android Chrome）只有「影片」能進
 * 子母畫面——所以把倒數畫在 <canvas> 上，captureStream() 接到一支看不見的
 * <video>，再把那支影片送進 PiP。
 *
 * 時間永遠由 session 的牆鐘資料（startedAt / pausedMs / pausedAt）現算，
 * 不吃 React 的 tick：App 進背景時 React 的計時器可能被放慢，這裡自己每秒重畫。
 */
import { formatTime } from './timer-format'

export interface FocusPipModel {
  state: 'running' | 'paused' | 'completed'
  mode: 'pomodoro' | 'stopwatch'
  phase: 'work' | 'break'
  startedAt: number
  pausedMs: number
  pausedAt: number | null
  targetSeconds: number
  label: string
  color: string
  /** 已翻譯的狀態字：專注中／休息中／已暫停／完成。 */
  status: string
}

type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
  webkitPresentationMode?: string
}

const W = 640
const H = 360
const CREAM = '#fdf8ec'
const INK = '#2b2926'

let model: FocusPipModel | null = null
let canvas: HTMLCanvasElement | null = null
let video: WebkitVideo | null = null
let ticker: number | null = null
let mascot: HTMLImageElement | null = null
let open = false
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

export function subscribeFocusPip(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const isFocusPipOpen = () => open
export const focusPipServerOpen = () => false

/** 這個環境能不能把影片送進子母畫面（而且 canvas 能轉成串流）。 */
export function videoPipSupported(): boolean {
  if (typeof document === 'undefined') return false
  if (typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return false
  if (document.pictureInPictureEnabled && 'requestPictureInPicture' in HTMLVideoElement.prototype) return true
  const probe = document.createElement('video') as WebkitVideo
  return typeof probe.webkitSupportsPresentationMode === 'function'
    && probe.webkitSupportsPresentationMode('picture-in-picture')
}

function secondsShown(m: FocusPipModel, now: number): number {
  const runningMs = (m.pausedAt ?? now) - m.startedAt - m.pausedMs
  const runningSec = Math.max(0, Math.floor(runningMs / 1000))
  if (m.state === 'completed') return m.mode === 'pomodoro' ? 0 : runningSec
  return m.mode === 'pomodoro' ? Math.max(0, m.targetSeconds - runningSec) : runningSec
}

function progressOf(m: FocusPipModel, shown: number): number {
  if (m.mode === 'stopwatch') return (shown % 3600) / 3600
  return Math.min(1, Math.max(0, (m.targetSeconds - shown) / Math.max(1, m.targetSeconds)))
}

/** 等寬畫數字：避免每秒數字寬度不同造成左右抖動。 */
function drawDigits(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  const cell = ctx.measureText('0').width
  const colon = cell * 0.55
  const widths = [...text].map((ch) => (ch === ':' ? colon : cell))
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, x + widths[i] / 2, ch === ':' ? cy - cell * 0.08 : cy)
    x += widths[i]
  })
}

function draw() {
  if (!canvas || !model) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const m = model
  const shown = secondsShown(m, Date.now())
  const paused = m.state === 'paused'
  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, W, H)

  // 左邊：進度環＋企鵝
  const rx = 150, ry = H / 2, r = 104
  ctx.lineCap = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(43,41,38,0.10)'
  ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.stroke()
  const p = progressOf(m, shown)
  if (p > 0) {
    ctx.strokeStyle = paused ? 'rgba(43,41,38,0.35)' : m.color
    ctx.beginPath(); ctx.arc(rx, ry, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke()
  }
  if (mascot?.complete && mascot.naturalWidth) {
    const s = 150
    ctx.globalAlpha = paused ? 0.55 : 1
    ctx.drawImage(mascot, rx - s / 2, ry - s / 2, s, s)
    ctx.globalAlpha = 1
  }

  // 右邊：大數字＋狀態＋標題
  const tx = 450
  ctx.fillStyle = paused ? 'rgba(43,41,38,0.55)' : INK
  const time = formatTime(shown)
  ctx.font = `700 ${time.length > 5 ? 84 : 112}px ui-rounded, -apple-system, "SF Pro Rounded", system-ui, sans-serif`
  drawDigits(ctx, time, tx, ry - 6)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 30px -apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif'
  ctx.fillStyle = paused ? INK : m.color
  ctx.fillText(m.status, tx, ry - 82)
  ctx.font = '500 26px -apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(43,41,38,0.6)'
  const label = m.label.length > 14 ? `${m.label.slice(0, 13)}…` : m.label
  ctx.fillText(label, tx, ry + 96)
}

function ensureElements(): WebkitVideo | null {
  if (video && canvas) return video
  if (typeof document === 'undefined') return null
  canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  if (!mascot) {
    mascot = new Image()
    mascot.onload = () => draw()
    mascot.src = '/huddle-mascot.png'
  }
  draw()
  const v = document.createElement('video') as WebkitVideo
  v.muted = true
  v.defaultMuted = true
  v.playsInline = true
  v.autoplay = true
  v.setAttribute('muted', '')
  v.setAttribute('playsinline', '')
  v.setAttribute('aria-hidden', 'true')
  v.dataset.focusPip = ''
  // 看不見但仍在畫面上：有些瀏覽器拒絕把 display:none 的影片送進 PiP。
  Object.assign(v.style, {
    position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px',
    opacity: '0.01', pointerEvents: 'none', zIndex: '-1',
  })
  v.srcObject = canvas.captureStream()
  v.addEventListener('leavepictureinpicture', () => { open = false; emit() })
  v.addEventListener('enterpictureinpicture', () => { open = true; emit() })
  v.addEventListener('webkitpresentationmodechanged', () => {
    const now = v.webkitPresentationMode === 'picture-in-picture'
    if (now !== open) { open = now; emit() }
  })
  // 子母畫面的播放/暫停鈕會停掉影片；計時還在跑就接著播，畫面才不會停格。
  v.addEventListener('pause', () => { if (open && model?.state === 'running') void v.play().catch(() => {}) })
  document.body.appendChild(v)
  video = v
  void v.play().catch(() => {})
  ticker = window.setInterval(draw, 1000)
  return v
}

function dispose() {
  if (ticker != null) window.clearInterval(ticker)
  ticker = null
  const v = video
  video = null
  canvas = null
  if (!v) return
  const stream = v.srcObject as MediaStream | null
  stream?.getTracks().forEach((t) => t.stop())
  v.srcObject = null
  v.remove()
}

/**
 * 同步目前的 session（null＝沒在計時 → 關掉子母畫面並釋放資源）。
 * `prepare` 為 true 時先把影片備好：iOS 要求「點下去的那一刻」影片已能播放，
 * 等點了才載入會被當成不是使用者觸發而拒絕。
 */
export function setFocusPipModel(next: FocusPipModel | null, prepare = false) {
  model = next
  if (!next) {
    void closeFocusPip().finally(dispose)
    return
  }
  if (video || prepare) ensureElements()
  draw()
}

/** 開啟子母畫面。**必須在點擊事件的同一個 tick 呼叫**。 */
export async function openFocusPip(): Promise<void> {
  const v = ensureElements()
  if (!v || !model) throw new Error('no-session')
  draw()
  const playing = v.play()
  if (document.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function') {
    // 影片還沒拿到第一格時 requestPictureInPicture 會丟 InvalidStateError——先等它。
    if (v.readyState < 1) await playing
    await v.requestPictureInPicture()
  } else if (v.webkitSetPresentationMode) {
    v.webkitSetPresentationMode('picture-in-picture')
    await playing.catch(() => {})
  } else {
    throw new Error('unsupported')
  }
  open = true
  emit()
}

export async function closeFocusPip(): Promise<void> {
  const v = video
  if (!open || !v) return
  open = false
  emit()
  try {
    if (document.pictureInPictureElement === v) await document.exitPictureInPicture()
    else if (v.webkitPresentationMode === 'picture-in-picture') v.webkitSetPresentationMode?.('inline')
  } catch { /* 已經被使用者關掉 */ }
}
