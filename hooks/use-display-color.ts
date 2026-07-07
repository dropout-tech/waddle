'use client'

import { useCallback } from 'react'
import { useTheme } from 'next-themes'
import { toDarkDisplayColor } from '@/lib/palette'

/**
 * Returns a stable `display(hex)` function that maps a *light-mode* stored
 * hex color (workspace / task / time-block colors are always persisted as
 * their light-mode value — see lib/palette.ts) to the color that should
 * actually be painted on screen for the current resolved theme.
 *
 * - Light mode (default, and before next-themes has resolved on first
 *   client render): passthrough, byte-identical to the pre-dark-mode
 *   behavior.
 * - Dark mode: routed through `toDarkDisplayColor` (lib/palette.ts), which
 *   pulls lightness into a 0.6-0.68 band and caps chroma at ~0.11 in OKLCH
 *   space so saturated light-mode swatches don't read as neon against the
 *   warm-charcoal dark background.
 *
 * `resolvedTheme` is `undefined` until next-themes mounts and reads
 * localStorage, so `isDark` defaults to `false` pre-mount — this matches
 * the server-rendered (light) markup and avoids a hydration mismatch.
 */
export function useDisplayColor() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const display = useCallback(
    (hex: string | undefined | null): string | undefined => {
      if (!hex) return hex ?? undefined
      return isDark ? toDarkDisplayColor(hex) ?? hex : hex
    },
    [isDark]
  )

  return display
}
