/**
 * 懸浮視窗（子母畫面／便條紙）底層工具。
 *
 * 兩種懸浮視窗，各有各的取捨——UI 會照這裡的能力偵測自動挑：
 *
 *  1. **Document Picture-in-Picture**（`openPipWindow`）
 *     真正「永遠置頂、蓋在所有軟體上面」的小視窗。Chrome / Edge 116+ 桌面版
 *     才有；Safari 與 Firefox 目前沒有。瀏覽器規定**同時只能存在一個**——
 *     再開一個會把前一個關掉，所以整個 app 只讓計時器用它。
 *     它給的是一份空白 document，不能導向網址，內容要由呼叫端把 DOM
 *     （React portal）塞進去，樣式也要自己搬（見 `mirrorStylesInto`）。
 *
 *  2. **一般彈出視窗**（`openPopupWindow`）
 *     `window.open` 開的獨立小視窗。可以同時開很多個、能自由拖到任何位置、
 *     能縮放，但**不會置頂**——切到別的軟體就會被蓋住。它載入的是真正的
 *     網址，所以內容是一個完整的頁面，樣式與登入狀態都自動跟著走。
 *
 * 兩者都只在桌面瀏覽器有意義；Capacitor 的 iOS 殼內兩者都不可用，呼叫端
 * 應先用 `canFloat()` 擋掉。
 */

import { isNative } from './platform'

/** Chrome 的 Document PiP 進入點，尚未進 TypeScript 的 lib.dom。 */
interface DocumentPictureInPicture {
  requestWindow(options?: {
    width?: number
    height?: number
    disallowReturnToOpener?: boolean
    preferInitialWindowPlacement?: boolean
  }): Promise<Window>
  readonly window: Window | null
}

function pipApi(): DocumentPictureInPicture | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture
  return api ?? null
}

/** 這個瀏覽器支不支援「永遠置頂」的懸浮視窗。 */
export function supportsPip(): boolean {
  return pipApi() !== null
}

/**
 * 這個環境能不能開任何一種懸浮視窗。手機與 app 殼內一律不行——沒有「視窗」
 * 的概念，`window.open` 只會變成換頁或被攔截。
 */
export function canFloat(): boolean {
  if (typeof window === 'undefined') return false
  // 原生殼（iOS app）：window.open 會被 WebView 導去系統瀏覽器。
  // 注意不能用 `window.Capacitor` 判斷——@capacitor/core 在 web 版也會掛上
  // 那個物件，只是 isNativePlatform() 回 false（踩過這個坑）。
  if (isNative()) return false
  // 觸控為主、沒有 hover 的裝置＝手機／平板，沒有可拖曳的視窗。
  if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) return false
  return true
}

/**
 * 把主視窗目前所有的 CSS 搬進目標視窗，並持續同步（開發時 HMR 會新增
 * <style>，正式站則是一次搬完就不動了）。
 *
 * 同源的 stylesheet 直接把 cssText 複製過去（最快、不必再抓一次網路）；
 * 跨來源的讀不到 cssRules 會丟 SecurityError，退而求其次複製 <link>。
 *
 * 回傳停止同步的函式。
 */
export function mirrorStylesInto(target: Window): () => void {
  const doc = target.document

  const copySheet = (sheet: CSSStyleSheet) => {
    try {
      const cssText = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
      const style = doc.createElement('style')
      style.textContent = cssText
      doc.head.appendChild(style)
    } catch {
      if (!sheet.href) return
      const link = doc.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      if (sheet.media.mediaText) link.media = sheet.media.mediaText
      doc.head.appendChild(link)
    }
  }

  for (const sheet of Array.from(document.styleSheets)) copySheet(sheet as CSSStyleSheet)

  // 主題（.dark）、字體變數（body 上的 --font-*）與 data-viewport 都靠
  // class/dataset 生效，跟著複製一份，否則 PiP 內會是無襯線預設字＋淺色。
  const syncAttributes = () => {
    doc.documentElement.className = document.documentElement.className
    doc.documentElement.dataset.viewport = 'desktop'
    doc.body.className = document.body.className
    // PiP 視窗本身就是內容，撐滿並禁止外層捲動。
    doc.body.style.margin = '0'
    doc.body.style.overflow = 'hidden'
    doc.body.style.height = '100%'
    doc.documentElement.style.height = '100%'
  }
  syncAttributes()

  const themeObserver = new MutationObserver(syncAttributes)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // 開發模式下 Next.js 會邊改邊塞新的 <style>；正式站幾乎不會觸發。
  const headObserver = new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of Array.from(rec.addedNodes)) {
        if (node instanceof HTMLStyleElement) {
          const clone = doc.createElement('style')
          clone.textContent = node.textContent
          doc.head.appendChild(clone)
        } else if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
          const clone = doc.createElement('link')
          clone.rel = 'stylesheet'
          clone.href = node.href
          doc.head.appendChild(clone)
        }
      }
    }
  })
  headObserver.observe(document.head, { childList: true })

  return () => {
    themeObserver.disconnect()
    headObserver.disconnect()
  }
}

/**
 * 開一個永遠置頂的懸浮視窗。**必須在使用者手勢（click）的同一個 tick 呼叫**
 * ——瀏覽器要求 transient user activation，放進 setTimeout / 等別的 await
 * 之後才呼叫會被拒絕。
 *
 * 不支援時回傳 null，由呼叫端退回 `openPopupWindow`。
 */
export async function openPipWindow(opts: { width: number; height: number }): Promise<Window | null> {
  const api = pipApi()
  if (!api) return null
  try {
    return await api.requestWindow({
      width: opts.width,
      height: opts.height,
      // 每次開回到「上次的位置」比固定右下角自然，使用者拖過就記得。
      preferInitialWindowPlacement: false,
    })
  } catch {
    // 使用者拒絕、或已有另一個 PiP 正在關閉中。
    return null
  }
}

/** 目前開著的置頂懸浮視窗（沒有就是 null）。 */
export function currentPipWindow(): Window | null {
  return pipApi()?.window ?? null
}

/**
 * 開一個普通的小視窗。會盡量避開螢幕邊緣，並讓連續開的多張便條錯開位置，
 * 不要整疊在同一個座標上。
 */
export function openPopupWindow(
  url: string,
  opts: { width: number; height: number; name?: string; index?: number },
): Window | null {
  if (typeof window === 'undefined') return null
  const stagger = (opts.index ?? 0) * 32
  const screenW = window.screen?.availWidth ?? 1440
  const screenH = window.screen?.availHeight ?? 900
  const left = Math.max(0, Math.min(screenW - opts.width - 24, screenW - opts.width - 40 - stagger))
  const top = Math.max(0, Math.min(screenH - opts.height - 24, 80 + stagger))
  const features = [
    `popup=yes`,
    `width=${opts.width}`,
    `height=${opts.height}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
  // name 給了就會重用同一個視窗（同一則筆記不會開出兩張），沒給就每次新開。
  const win = window.open(url, opts.name ?? '_blank', features)
  win?.focus()
  return win
}
