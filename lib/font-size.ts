/**
 * 全站字級偏好（裝置層級，localStorage——跟語言同一套邏輯，不進資料庫）。
 *
 * 原理：整個 app 的字都用 rem（Tailwind 的 text-sm/text-base…），rem 錨定
 * 在 <html> 的 font-size。把它從 100% 調成 112.5%，全站文字與 rem 間距
 * 就等比放大，不必動任何元件。
 *
 * 生效路徑有三條，都要顧到：
 *  1. 主視窗：app/layout.tsx 的 head inline script 在 hydration 前先套
 *     （避免開頁閃一下預設字級），之後由 setFontSize() 即時改。
 *  2. 懸浮工作站（Document PiP）：pip-portal 的 mirrorStylesInto 會把
 *     <html> 的 inline style 同步過去。
 *  3. /float/* 便條紙頁與工作站 iframe：本身就是完整頁面，走路徑 1。
 */

export type FontSizeKey = 'sm' | 'md' | 'lg' | 'xl'

export const FONT_SIZE_STORAGE_KEY = 'waddle-font-size-v1'

export const FONT_SIZES: ReadonlyArray<{ key: FontSizeKey; label: string; css: string }> = [
  { key: 'sm', label: '小', css: '87.5%' },   // 14px 基準
  { key: 'md', label: '標準', css: '100%' },  // 16px（預設）
  { key: 'lg', label: '大', css: '112.5%' },  // 18px
  { key: 'xl', label: '特大', css: '125%' },  // 20px
]

export function getFontSize(): FontSizeKey {
  if (typeof window === 'undefined') return 'md'
  try {
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (FONT_SIZES.some((f) => f.key === stored)) return stored as FontSizeKey
  } catch {}
  return 'md'
}

/** 套到 <html>。'md'（預設）清掉 inline style，讓 CSS 自然接手。 */
export function applyFontSize(key: FontSizeKey, doc: Document = document) {
  const entry = FONT_SIZES.find((f) => f.key === key)
  if (!entry) return
  doc.documentElement.style.fontSize = key === 'md' ? '' : entry.css
}

export function setFontSize(key: FontSizeKey) {
  try { window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, key) } catch {}
  applyFontSize(key)
}
