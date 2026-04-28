'use client'

import { useRef, useCallback, useEffect } from 'react'

interface UseSwipeNavigationOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 50 */
  threshold?: number
  /** If horizontal movement exceeds this ratio vs vertical, it's a swipe. Default: 1.5 */
  directionRatio?: number
  /** Element ref to attach native (non-React) listeners to */
  elementRef: React.RefObject<HTMLElement>
}

/**
 * Attaches native pointer event listeners directly to the element so they fire
 * even when child elements call stopPropagation on React synthetic events.
 * Distinguishes horizontal swipe (navigate) from vertical drag (scroll/create).
 */
export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  directionRatio = 1.5,
  elementRef,
}: UseSwipeNavigationOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const pointerId = useRef<number | null>(null)
  const committed = useRef<'horizontal' | 'vertical' | null>(null)

  // Keep callbacks in refs so we don't re-attach listeners on every render
  const onSwipeLeftRef = useRef(onSwipeLeft)
  const onSwipeRightRef = useRef(onSwipeRight)
  useEffect(() => { onSwipeLeftRef.current = onSwipeLeft }, [onSwipeLeft])
  useEffect(() => { onSwipeRightRef.current = onSwipeRight }, [onSwipeRight])

  useEffect(() => {
    const el = elementRef.current
    if (!el) return

    const onPointerDown = (e: PointerEvent) => {
      // Only track touch pointers for navigation (mouse drag is used for creating slots)
      if (e.pointerType !== 'touch') return
      startX.current = e.clientX
      startY.current = e.clientY
      pointerId.current = e.pointerId
      committed.current = null
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return
      if (startX.current === null || startY.current === null) return
      if (committed.current) return

      const dx = Math.abs(e.clientX - startX.current)
      const dy = Math.abs(e.clientY - startY.current)

      // Commit direction once we have enough movement to tell
      if (dx > 8 || dy > 8) {
        committed.current = dx > dy * directionRatio ? 'horizontal' : 'vertical'
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return
      if (startX.current === null || committed.current !== 'horizontal') {
        startX.current = null
        startY.current = null
        pointerId.current = null
        committed.current = null
        return
      }

      const dx = e.clientX - startX.current
      if (Math.abs(dx) >= threshold) {
        if (dx < 0) onSwipeLeftRef.current()
        else onSwipeRightRef.current()
      }

      startX.current = null
      startY.current = null
      pointerId.current = null
      committed.current = null
    }

    const onPointerCancel = () => {
      startX.current = null
      startY.current = null
      pointerId.current = null
      committed.current = null
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    el.addEventListener('pointermove', onPointerMove, { passive: true })
    el.addEventListener('pointerup', onPointerUp, { passive: true })
    el.addEventListener('pointercancel', onPointerCancel, { passive: true })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [elementRef, threshold, directionRatio])
}
