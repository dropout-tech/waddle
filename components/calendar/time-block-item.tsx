'use client'

import { memo, useState, useRef } from 'react'
import { Coffee, Clock, User, Target, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimeBlock } from '@/lib/types'
import { calculateBlockHeight, calculateBlockTop } from '@/lib/task-utils'
import { useI18n } from '@/lib/i18n/react'

interface TimeBlockItemProps {
  block: TimeBlock
  calendarStartHour?: number
  compact?: boolean
  onUpdate?: (id: string, updates: Partial<TimeBlock>) => void
  onDelete?: (id: string) => void
}

const typeIcons: Record<string, React.ElementType> = {
  break: Coffee,
  buffer: Clock,
  personal: User,
  focus: Target,
}

const typeLabels: Record<string, string> = {
  break: '休息',
  buffer: '緩衝',
  personal: '私人',
  focus: '專注',
}

// Helper functions
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function TimeBlockItemImpl({
  block,
  calendarStartHour = 7,
  compact = false,
  onUpdate,
  onDelete,
}: TimeBlockItemProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [originalStart, setOriginalStart] = useState(0)
  const [originalEnd, setOriginalEnd] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  const top = compact ? 0 : calculateBlockTop(block.startTime, calendarStartHour)
  const height = compact ? '100%' : calculateBlockHeight(block.startTime, block.endTime)
  const Icon = typeIcons[block.type] ?? Clock

  // Handle drag start (move whole block)
  const handleDragStart = (e: React.MouseEvent) => {
    if (!onUpdate || compact) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStartY(e.clientY)
    setOriginalStart(timeToMinutes(block.startTime))
    setOriginalEnd(timeToMinutes(block.endTime))

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragStartY
      const deltaMinutes = Math.round(deltaY / 60 * 60 / 15) * 15 // Snap to 15 min
      const newStart = Math.max(calendarStartHour * 60, originalStart + deltaMinutes)
      const duration = originalEnd - originalStart
      const newEnd = newStart + duration

      onUpdate(block.id, {
        startTime: minutesToTime(newStart),
        endTime: minutesToTime(newEnd),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Handle resize (bottom edge)
  const handleResizeStart = (e: React.MouseEvent) => {
    if (!onUpdate || compact) return
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setDragStartY(e.clientY)
    setOriginalEnd(timeToMinutes(block.endTime))

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragStartY
      const deltaMinutes = Math.round(deltaY / 60 * 60 / 15) * 15
      const startMinutes = timeToMinutes(block.startTime)
      const newEnd = Math.max(startMinutes + 15, originalEnd + deltaMinutes)

      onUpdate(block.id, {
        endTime: minutesToTime(newEnd),
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-xl overflow-hidden group',
        'border-2 border-border/50',
        compact ? 'w-full h-full' : 'absolute left-[60px] right-4',
        (isDragging || isResizing) && 'z-30 shadow-lg',
        onUpdate && !compact && 'cursor-move'
      )}
      style={{
        ...(compact ? {} : { top: `${top}px`, height: `${height}px` }),
        background: `repeating-linear-gradient(
          135deg,
          ${block.color}40,
          ${block.color}40 8px,
          ${block.color}20 8px,
          ${block.color}20 16px
        )`,
      }}
      onMouseDown={onUpdate && !compact ? handleDragStart : undefined}
    >
      <div className={cn(
        'h-full flex items-center gap-2 relative',
        compact ? 'p-1' : 'p-2'
      )}>
        {/* Drag handle */}
        {onUpdate && !compact && (
          <div className="opacity-60 md:opacity-0 md:group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
        
        <Icon className={cn(
          'text-muted-foreground',
          compact ? 'w-3 h-3' : 'w-4 h-4'
        )} />
        
        {!compact && (
          <>
            <span className="text-xs font-medium text-muted-foreground">
              {block.label || t(typeLabels[block.type])}
            </span>
            <span className="text-[10px] text-muted-foreground/70 font-mono ml-auto mr-1">
              {block.startTime} - {block.endTime}
            </span>
            
            {/* Delete button */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(block.id)
                }}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
              >
                <span className="text-xs">×</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Resize handle (bottom) */}
      {onUpdate && !compact && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/20 transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}
    </div>
  )
}

export const TimeBlockItem = memo(TimeBlockItemImpl)
