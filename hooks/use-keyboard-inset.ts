'use client'

import { useEffect, useState } from 'react'

/**
 * Pixels of the layout viewport currently covered from the bottom — i.e. the
 * on-screen keyboard's height (plus any other bottom overlay the browser
 * reports through the Visual Viewport API).
 *
 * Why this works across both runtimes:
 *  - Mobile web / PWA: the soft keyboard shrinks `visualViewport` but NOT the
 *    layout viewport, so `innerHeight - visualViewport.height` == keyboard
 *    height. A `position: fixed; bottom: <inset>` element then sits right above
 *    the keyboard.
 *  - Native Capacitor shell (KeyboardResize.Native): the WebView itself
 *    resizes, so `innerHeight` shrinks together with `visualViewport` and the
 *    computed inset stays ≈ 0 — `bottom: 0` already lands above the keyboard.
 *    The formula self-corrects; we never double-count.
 *
 * Returns 0 when the Visual Viewport API is unavailable (older browsers, SSR,
 * headless) — so any consumer degrades to plain bottom-anchored layout with no
 * regression.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined
    if (!vv) return

    const update = () => {
      // offsetTop accounts for the page being scrolled within the visual
      // viewport; clamp so rubber-band scrolling can't report a negative inset.
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered > 1 ? Math.round(covered) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
