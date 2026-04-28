'use client'

import { useRef, useEffect } from 'react'

interface UseSwipeNavigationOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 60 */
  threshold?: number
  /** If horizontal movement exceeds this ratio vs vertical, it's a swipe. Default: 2.0 */
  directionRatio?: number
  /** Element ref to attach native (non-React) listeners to */
  elementRef: React.RefObject<HTMLElement | null>
  /** Also enable mouse drag navigation (default: true for week/month views) */
  enableMouseDrag?: boolean
}

/**
 * Attaches native pointer event listeners directly to the element so they fire
 * even when child elements call stopPropagation on React synthetic events.
 * Distinguishes horizontal swipe (navigate) from vertical drag (scroll/create).
 */
export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  directionRatio = 2.0,
  elementRef,
  enableMouseDrag = true,
}: UseSwipeNavigationOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const pointerId = useRef<number | null>(null)
  const pointerType = useRef<string | null>(null)
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
      // For mouse, only track if enableMouseDrag is true
      if (e.pointerType === 'mouse' && !enableMouseDrag) return
      
      startX.current = e.clientX
      startY.current = e.clientY
      pointerId.current = e.pointerId
      pointerType.current = e.pointerType
      committed.current = null
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return
      if (startX.current === null || startY.current === null) return
      if (committed.current) return

      const dx = Math.abs(e.clientX - startX.current)
      const dy = Math.abs(e.clientY - startY.current)

      // Commit direction once we have enough movement to tell
      // For mouse, require more horizontal movement to not interfere with task creation
      const minMove = pointerType.current === 'mouse' ? 15 : 8
      if (dx > minMove || dy > minMove) {
        committed.current = dx > dy * directionRatio ? 'horizontal' : 'vertical'
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return
      if (startX.current === null || committed.current !== 'horizontal') {
        startX.current = null
        startY.current = null
        pointerId.current = null
        pointerType.current = null
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
      pointerType.current = null
      committed.current = null
    }

    const onPointerCancel = () => {
      startX.current = null
      startY.current = null
      pointerId.current = null
      pointerType.current = null
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
  }, [elementRef, threshold, directionRatio, enableMouseDrag])
}
