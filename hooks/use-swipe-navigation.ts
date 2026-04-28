'use client'

import { useRef, useCallback } from 'react'

interface UseSwipeNavigationOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 60 */
  threshold?: number
  /** Maximum vertical drift allowed before cancelling. Default: 80 */
  verticalThreshold?: number
}

/**
 * Returns ref + event handlers to attach to a scrollable container.
 * Supports both touch (mobile) and mouse drag (desktop) swipe gestures.
 * Ignores vertical scrolling — only fires when the gesture is primarily horizontal.
 */
export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  verticalThreshold = 80,
}: UseSwipeNavigationOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const isSwiping = useRef(false)

  // ── Touch ──────────────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isSwiping.current = false
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current

      // Only fire if horizontal movement dominates and exceeds threshold
      if (Math.abs(dx) > threshold && Math.abs(dy) < verticalThreshold) {
        if (dx < 0) onSwipeLeft()
        else onSwipeRight()
      }
      startX.current = null
      startY.current = null
    },
    [onSwipeLeft, onSwipeRight, threshold, verticalThreshold]
  )

  // ── Mouse (desktop drag) ────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only initiate on left-button drag on the background (not on task blocks)
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-task],[data-no-swipe]')) return
    startX.current = e.clientX
    startY.current = e.clientY
    isSwiping.current = false
  }, [])

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (startX.current === null || startY.current === null) return
      const dx = e.clientX - startX.current
      const dy = e.clientY - startY.current

      if (Math.abs(dx) > threshold && Math.abs(dy) < verticalThreshold) {
        if (dx < 0) onSwipeLeft()
        else onSwipeRight()
      }
      startX.current = null
      startY.current = null
    },
    [onSwipeLeft, onSwipeRight, threshold, verticalThreshold]
  )

  return { onTouchStart, onTouchEnd, onMouseDown, onMouseUp }
}
