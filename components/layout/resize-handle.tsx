'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  onResize: (delta: number) => void
  className?: string
}

export function ResizeHandle({ onResize, className }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.clientX)
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return
      const delta = e.clientX - startX
      onResize(delta)
      setStartX(e.clientX)
    },
    [isDragging, startX, onResize]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      className={cn(
        'w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all',
        isDragging && 'w-1.5 bg-primary',
        className
      )}
      onMouseDown={handleMouseDown}
    >
      {/* Visual indicator */}
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
