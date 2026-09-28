import { isDesktop, isNative } from '@/lib/platform'

/**
 * Web-only PWA helpers (Android Chrome install + service worker gate).
 * Nothing here runs in the Capacitor app or the Electron shell.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    /** Captured by the inline <head> script in app/layout.tsx, before React hydrates. */
    __huddleInstallPrompt?: BeforeInstallPromptEvent | null
  }
  interface Navigator {
    /** iOS Safari: true when launched from a home-screen icon. */
    standalone?: boolean
  }
}

/** The service worker and install UI are for the plain website only. */
export function isPlainWeb(): boolean {
  return typeof window !== 'undefined' && !isNative() && !isDesktop()
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

// ── Install prompt store (useSyncExternalStore-friendly) ────────────────────
const listeners = new Set<() => void>()
let installed = false
const emit = () => listeners.forEach((l) => l())

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined' || installed) return null
  return window.__huddleInstallPrompt ?? null
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let wired = false
/** Keep listening after hydration (the head script only covers the first event). */
export function wireInstallPrompt() {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__huddleInstallPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    window.__huddleInstallPrompt = null
    emit()
  })
  emit()
}

/** Shows Chrome's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const evt = getInstallPrompt()
  if (!evt) return false
  // A prompt event can only be used once.
  window.__huddleInstallPrompt = null
  emit()
  await evt.prompt()
  const choice = await evt.userChoice
  if (choice.outcome === 'accepted') {
    installed = true
    emit()
  }
  return choice.outcome === 'accepted'
}
