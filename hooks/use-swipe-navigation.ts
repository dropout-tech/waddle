'use client'

import { useRef, useEffect } from 'react'

/**
 * Module-level flag that any in-calendar drag interaction (task block, time
 * block, new-slot creation) flips during its lifetime so the panel-level swipe
 * gesture knows to abort. This avoids the bug where a horizontal task drag
 * (≥60 px) would also fire onSwipeLeft/Right and silently change selectedDate,
 * making tasks appear to "jump weeks" after drop.
 */
let dragActiveCount = 0
export function beginGestureSuppression() {
  dragActiveCount++
}
export function endGestureSuppression() {
  dragActiveCount = Math.max(0, dragActiveCount - 1)
}
function isDragActive() {
  return dragActiveCount > 0
}

interface UseSwipeNavigationOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  /** Minimum horizontal distance (px) to trigger a swipe. Default: 60 */
  threshold?: number
  /** If horizontal movement exceeds this ratio vs vertical, it's a swipe. Default: 2.0 */
  directionRatio?: number
  /** Element ref to attach native (non-React) listeners to */
  elementRef: React.RefObject<HTMLElement | null>
  /** Also enable mouse drag navigation (default: false on desktop). Touch
   * swipe always works regardless of this flag. */
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
  enableMouseDrag = false,
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
      // Skip if any in-calendar drag has already started (e.g. task block,
      // time block, new-slot drag). This is the safety net that prevents
      // tasks from appearing to jump weeks when dragged horizontally.
      if (isDragActive()) return

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
      // Final guard: if a drag started after onPointerDown was tracked, do
      // not navigate.
      if (
        startX.current === null ||
        committed.current !== 'horizontal' ||
        isDragActive()
      ) {
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
