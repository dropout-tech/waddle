'use client'

import { useEffect } from 'react'

/**
 * Soft-keyboard awareness for the phone shell.
 *
 * While the on-screen keyboard is up we set `data-keyboard="open"` on
 * <html>; globals.css hides every `[data-hide-on-keyboard]` element (bottom
 * tab bar, floating 專注計時 capsule, the calendar ＋ button). Reason: the
 * iOS app runs Keyboard resize mode `Native` (native-shell.tsx), so the
 * WebView shrinks and anything `fixed; bottom:0` rides up to sit right on
 * top of the keyboard — covering what the user is typing (owner report
 * 2026-09-26, 白板 tab).
 *
 * Detection:
 * - Native (Capacitor): Keyboard plugin keyboardWillShow / keyboardWillHide.
 * - Web (mobile Safari / Chrome): visualViewport shrinks well below the
 *   layout viewport while an editable element has focus.
 *
 * When it opens, the focused field is scrolled into view so it is not left
 * behind the keyboard or another floating element.
 */
export function useSoftKeyboard() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    let nativeOpen = false
    let scrollTimer: number | undefined

    const isEditable = (el: Element | null): el is HTMLElement => {
      if (!el || !(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
      if (el.tagName !== 'INPUT') return false
      const type = (el as HTMLInputElement).type
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(type)
    }

    const setOpen = (open: boolean) => {
      const was = root.dataset.keyboard === 'open'
      if (open === was) return
      if (open) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
      if (open) {
        window.clearTimeout(scrollTimer)
        // Wait a frame or two for the layout to settle (tab bar removed,
        // WebView resized) before measuring.
        scrollTimer = window.setTimeout(() => {
          const el = document.activeElement
          if (isEditable(el)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }, 80)
      }
    }

    // ── Web: visualViewport ────────────────────────────────────
    const vv = window.visualViewport
    const onViewport = () => {
      if (nativeOpen || !vv) return
      const covered = window.innerHeight - vv.height
      setOpen(covered > 150 && isEditable(document.activeElement))
    }
    // Focus leaving every field closes it even if the viewport event lags.
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (!isEditable(document.activeElement) && !nativeOpen) setOpen(false)
      }, 0)
    }
    vv?.addEventListener('resize', onViewport)
    document.addEventListener('focusout', onFocusOut)

    // ── Native: Capacitor Keyboard plugin ──────────────────────
    let removeNative: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (!Capacitor.isNativePlatform()) return
        const { Keyboard } = await import('@capacitor/keyboard')
        if (cancelled) return
        const show = await Keyboard.addListener('keyboardWillShow', () => {
          nativeOpen = true
          setOpen(true)
        })
        const hide = await Keyboard.addListener('keyboardWillHide', () => {
          nativeOpen = false
          setOpen(false)
        })
        removeNative = () => {
          void show.remove()
          void hide.remove()
        }
        if (cancelled) removeNative()
      } catch {
        /* keyboard plugin unavailable — web path still works */
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(scrollTimer)
      vv?.removeEventListener('resize', onViewport)
      document.removeEventListener('focusout', onFocusOut)
      removeNative?.()
      delete root.dataset.keyboard
    }
  }, [])
}
