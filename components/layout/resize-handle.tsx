'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  onResize: (delta: number) => void
  className?: string
  /** Pixels moved per arrow-key press (default 16) */
  keyboardStep?: number
}

export function ResizeHandle({ onResize, className, keyboardStep = 16 }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const lastXRef = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    lastXRef.current = e.clientX
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - lastXRef.current
      lastXRef.current = e.clientX
      if (delta !== 0) onResize(delta)
    }

    const handleMouseUp = () => setIsDragging(false)

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
  }, [isDragging, onResize])

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
      aria-label="調整面板寬度"
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
