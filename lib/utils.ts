import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Trigger a tiny haptic tap on devices that support the Vibration API
 * (Android Chrome / FF). Wrapped in a try/catch because some browsers
 * gate vibrate behind a user activation event and may throw.
 *
 * Used to confirm gesture transitions like long-press → drag-start so
 * the user gets physical feedback that the mode changed.
 */
export function haptic(durationMs = 15) {
  if (typeof navigator === 'undefined') return
  if (!('vibrate' in navigator)) return
  try {
    navigator.vibrate?.(durationMs)
  } catch {
    /* ignore — some browsers throw without prior user gesture */
  }
}

/**
 * Lock <body> scroll while a modal / sheet is open. Reference-counted so
 * nested modals (e.g. workspace settings inside settings) don't release
 * the lock prematurely.
 */
let scrollLockCount = 0
let savedBodyOverflow = ''
let savedBodyPaddingRight = ''
export function lockBodyScroll() {
  if (typeof document === 'undefined') return
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow
    savedBodyPaddingRight = document.body.style.paddingRight
    // Compensate for vanishing scrollbar to avoid layout shift on desktop.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount++
}
export function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow
    document.body.style.paddingRight = savedBodyPaddingRight
  }
}


/**
 * Rough perceived-brightness test for a hex color. Returns true when the
 * color is bright enough that white overlays disappear against it (cream,
 * pale yellow, light beige, etc). Uses the standard YIQ-style luminance
 * approximation — fast, no perceptual library dependency.
 *
 * @example isLightColor('#ffe699')  // → true
 * @example isLightColor('#259CCA')  // → false (brand low-chroma blue)
 */
export function isLightColor(hex: string | undefined): boolean {
  if (!hex) return false
  const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return false
  const v = m[1]
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // YIQ-style luminance; threshold tuned so Waddle's warm yellow (#f4d977)
  // counts as "light" and the rest of the default workspace palette does not.
  return (r * 299 + g * 587 + b * 114) / 1000 > 170
}
