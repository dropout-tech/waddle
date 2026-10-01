'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

interface ResizeHandleProps {
  /** Arrow keys (and mouse drags when onDrag is not given): incremental px. */
  onResize: (delta: number) => void
  /**
   * Mouse drag, absolute: called with the TOTAL px moved since the press, so
   * the owner can apply `widthAtPress + total` and clamp. Incremental deltas
   * kept accumulating while the width was pinned at its min/max, so the
   * divider drifted away from the cursor on the way back.
   */
  onDragStart?: () => void
  onDrag?: (totalDelta: number) => void
  onDragEnd?: () => void
  className?: string
  /** Pixels moved per arrow-key press (default 16) */
  keyboardStep?: number
}

export function ResizeHandle({ onResize, onDragStart, onDrag, onDragEnd, className, keyboardStep = 16 }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const lastXRef = useRef(0)
  const startXRef = useRef(0)
  const { t } = useI18n()

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    lastXRef.current = e.clientX
    startXRef.current = e.clientX
    onDragStart?.()
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (onDrag) {
        onDrag(e.clientX - startXRef.current)
        return
      }
      const delta = e.clientX - lastXRef.current
      lastXRef.current = e.clientX
      if (delta !== 0) onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      onDragEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, onResize, onDrag, onDragEnd])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onResize(-keyboardStep)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onResize(keyboardStep)
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('調整面板寬度')}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'w-1.5 bg-primary',
        className
      )}
    >
      <div className="h-full w-full flex items-center justify-center">
        <div
          className={cn(
            'w-0.5 h-12 rounded-full bg-muted-foreground/30 transition-opacity',
            isDragging && 'opacity-0'
          )}
        />
      </div>
    </div>
  )
}
