/**
 * Smart popover positioning with auto-flip when running out of space.
 *
 * Anchor is a viewport-space point (typically the user's click coordinates).
 * The returned position is also in viewport space — render the popover with
 * `position: fixed` and apply `top` / `left`.
 *
 * Strategy:
 *   1. Prefer placing the popover BELOW the anchor with its left edge near
 *      anchor.x.
 *   2. If that would overflow the bottom edge, flip ABOVE the anchor.
 *   3. If horizontally overflows the right, shift left to fit.
 *   4. Always clamp to a `margin` from the viewport edges.
 */
export interface PopoverAnchor {
  x: number
  y: number
}

export interface PopoverSize {
  width: number
  height: number
}

export interface PopoverViewport {
  width: number
  height: number
}

export interface PopoverPosition {
  top: number
  left: number
  /** Which side of the anchor the popover ended up on (for arrow / animation hints) */
  placement: 'below' | 'above'
}

export function positionPopover(
  anchor: PopoverAnchor,
  size: PopoverSize,
  viewport: PopoverViewport,
  options: { margin?: number; gap?: number } = {}
): PopoverPosition {
  const margin = options.margin ?? 8
  const gap = options.gap ?? 8

  // ─── Vertical: try below first, flip above if overflow ─────────────────
  const spaceBelow = viewport.height - anchor.y - gap
  const spaceAbove = anchor.y - gap
  const fitsBelow = size.height + margin <= spaceBelow
  const fitsAbove = size.height + margin <= spaceAbove

  let top: number
  let placement: 'below' | 'above'

  if (fitsBelow) {
    top = anchor.y + gap
    placement = 'below'
  } else if (fitsAbove) {
    top = anchor.y - gap - size.height
    placement = 'above'
  } else {
    // Doesn't fit either way — pick the side with more room and clamp.
    if (spaceBelow >= spaceAbove) {
      top = anchor.y + gap
      placement = 'below'
    } else {
      top = Math.max(margin, anchor.y - gap - size.height)
      placement = 'above'
    }
  }
  // Final vertical clamp to keep within viewport
  top = Math.max(margin, Math.min(top, viewport.height - size.height - margin))

  // ─── Horizontal: align popover's left to anchor.x, flip if overflows ───
  let left = anchor.x
  if (left + size.width + margin > viewport.width) {
    left = anchor.x - size.width
  }
  // Final horizontal clamp
  left = Math.max(margin, Math.min(left, viewport.width - size.width - margin))

  return { top, left, placement }
}
