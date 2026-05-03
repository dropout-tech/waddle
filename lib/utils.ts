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
