'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'
import { Plus } from 'lucide-react'

interface TimeGridProps {
  scheduledTasks: Task[]
  timeBlocks: TimeBlock[]
  startHour?: number
  endHour?: number
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (startTime: string, endTime: string) => void
}

// Helper to convert time string to minutes since midnight
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Helper to convert minutes to time string
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Calculate overlapping columns for tasks
function calculateTaskColumns(tasks: Task[]): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  
  // Filter tasks with valid time range
  const validTasks = tasks.filter(t => t.scheduledStartTime && t.scheduledEndTime)
  if (validTasks.length === 0) return result

  // Sort by start time, then by end time (longer tasks first)
  const sorted = [...validTasks].sort((a, b) => {
    const startA = timeToMinutes(a.scheduledStartTime!)
    const startB = timeToMinutes(b.scheduledStartTime!)
    if (startA !== startB) return startA - startB
    const endA = timeToMinutes(a.scheduledEndTime!)
    const endB = timeToMinutes(b.scheduledEndTime!)
    return endB - endA // Longer tasks first
  })

  // Group overlapping tasks
  const groups: Task[][] = []
  
  for (const task of sorted) {
    const taskStart = timeToMinutes(task.scheduledStartTime!)
    const taskEnd = timeToMinutes(task.scheduledEndTime!)
    
    // Find a group this task overlaps with
    let foundGroup = false
    for (const group of groups) {
      const overlaps = group.some(t => {
        const tStart = timeToMinutes(t.scheduledStartTime!)
        const tEnd = timeToMinutes(t.scheduledEndTime!)
        return taskStart < tEnd && taskEnd > tStart
      })
      
      if (overlaps) {
        group.push(task)
        foundGroup = true
        break
      }
    }
    
    if (!foundGroup) {
      groups.push([task])
    }
  }

  // Merge overlapping groups
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        // Check if any task in group i overlaps with any task in group j
        const overlaps = groups[i].some(ti => {
          const tiStart = timeToMinutes(ti.scheduledStartTime!)
          const tiEnd = timeToMinutes(ti.scheduledEndTime!)
          return groups[j].some(tj => {
            const tjStart = timeToMinutes(tj.scheduledStartTime!)
            const tjEnd = timeToMinutes(tj.scheduledEndTime!)
            return tiStart < tjEnd && tiEnd > tjStart
          })
        })
        
        if (overlaps) {
          groups[i].push(...groups[j])
          groups.splice(j, 1)
          merged = true
          break
        }
      }
      if (merged) break
    }
  }

  // Assign columns within each group
  for (const group of groups) {
    // Sort group by start time
    group.sort((a, b) => {
      const startA = timeToMinutes(a.scheduledStartTime!)
      const startB = timeToMinutes(b.scheduledStartTime!)
      if (startA !== startB) return startA - startB
      const endA = timeToMinutes(a.scheduledEndTime!)
      const endB = timeToMinutes(b.scheduledEndTime!)
      return endB - endA
    })

    const columns: Task[][] = []
    
    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      
      // Find the first column where this task fits (no overlap with last task in column)
      let placed = false
      for (let col = 0; col < columns.length; col++) {
        const lastInColumn = columns[col][columns[col].length - 1]
        const lastEnd = timeToMinutes(lastInColumn.scheduledEndTime!)
        
        if (taskStart >= lastEnd) {
          columns[col].push(task)
          placed = true
          break
        }
      }
      
      if (!placed) {
        columns.push([task])
      }
    }
    
    // Assign column info to each task
    const totalColumns = columns.length
    for (let col = 0; col < columns.length; col++) {
      for (const task of columns[col]) {
        result.set(task.id, { column: col, totalColumns })
      }
    }
  }

  return result
}

export function TimeGrid({
  scheduledTasks,
  timeBlocks,
  startHour = 7,
  endHour = 23,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [hoverTime, setHoverTime] = useState<{ hour: number; half: boolean } | null>(null)
  
  // Drag to create state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)

  // Calculate task columns for overlapping display
  const taskColumns = useMemo(() => calculateTaskColumns(scheduledTasks), [scheduledTasks])

  // Generate hour slots
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  )

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (containerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      if (currentHour >= startHour && currentHour < endHour) {
        const scrollPosition = (currentHour - startHour) * 60 - 60
        containerRef.current.scrollTop = Math.max(0, scrollPosition)
      }
    }
  }, [startHour, endHour])

  // Convert Y position to minutes
  const yToMinutes = (y: number): number => {
    const minutesFromStart = Math.round(y / 60 * 60) // 60px per hour
    return startHour * 60 + minutesFromStart
  }

  // Snap to 15-minute intervals
  const snapToInterval = (minutes: number): number => {
    return Math.round(minutes / 15) * 15
  }

  // Handle mouse down for drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onCreateTask || !gridRef.current) return
    
    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0)
    const minutes = snapToInterval(yToMinutes(y))
    
    setIsDragging(true)
    setDragStart(minutes)
    setDragEnd(minutes + 30) // Default 30 min duration
  }

  // Handle mouse move during drag
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !gridRef.current || dragStart === null) return
    
    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0)
    const minutes = snapToInterval(yToMinutes(y))
    
    // Ensure minimum 15 minute duration
    if (minutes > dragStart) {
      setDragEnd(Math.max(minutes, dragStart + 15))
    } else {
      setDragEnd(dragStart + 30)
    }
  }

  // Handle mouse up to complete drag
  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragEnd !== null && onCreateTask) {
      const startTime = minutesToTime(Math.min(dragStart, dragEnd))
      const endTime = minutesToTime(Math.max(dragStart, dragEnd))
      onCreateTask(startTime, endTime)
    }
    
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  // Handle click on time slot
  const handleTimeSlotClick = (hour: number, isHalfHour: boolean) => {
    if (!onCreateTask || isDragging) return
    const startMinute = isHalfHour ? 30 : 0
    const endHourCalc = isHalfHour ? hour + 1 : hour
    const endMinute = isHalfHour ? 0 : 30
    const startTime = `${String(hour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`
    const endTime = `${String(endHourCalc).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    onCreateTask(startTime, endTime)
  }

  // Handle mouse move for hover effect
  const handleHoverMove = (e: React.MouseEvent, hour: number) => {
    if (isDragging) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const isHalfHour = relativeY >= 30
    setHoverTime({ hour, half: isHalfHour })
  }

  // Calculate drag preview position and height
  const getDragPreview = () => {
    if (!isDragging || dragStart === null || dragEnd === null) return null
    
    const start = Math.min(dragStart, dragEnd)
    const end = Math.max(dragStart, dragEnd)
    const top = (start - startHour * 60) // Convert to pixels
    const height = end - start
    
    return { top, height, startTime: minutesToTime(start), endTime: minutesToTime(end) }
  }

  const dragPreview = getDragPreview()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative bg-panel-secondary"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHoverTime(null)
        if (isDragging) handleMouseUp()
      }}
    >
      {/* Time Grid Container */}
      <div
        ref={gridRef}
        className="relative"
        style={{ height: `${(endHour - startHour) * 60}px` }}
        onMouseMove={handleMouseMove}
      >
        {/* Hour Lines */}
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex"
            style={{ top: `${index * 60}px`, height: '60px' }}
          >
            {/* Hour Label */}
            <div className="w-14 flex-shrink-0 pr-2 text-right">
              <span className="text-[11px] font-mono text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>

            {/* Grid Lines - Clickable/Draggable area */}
            <div
              className="flex-1 relative border-t border-calendar-grid cursor-crosshair"
              onMouseMove={(e) => handleHoverMove(e, hour)}
              onMouseDown={handleMouseDown}
            >
              {/* First half hour */}
              <div
                className="absolute left-0 right-0 top-0 h-[30px] hover:bg-primary/5 transition-colors"
                onClick={() => !isDragging && handleTimeSlotClick(hour, false)}
              >
                {hoverTime?.hour === hour && !hoverTime.half && !isDragging && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Plus className="w-3 h-3" />
                      <span>點擊或拖曳</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Half-hour dashed line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-calendar-grid-subtle pointer-events-none"
                style={{ top: '30px' }}
              />

              {/* Second half hour */}
              <div
                className="absolute left-0 right-0 top-[30px] h-[30px] hover:bg-primary/5 transition-colors"
                onClick={() => !isDragging && handleTimeSlotClick(hour, true)}
              >
                {hoverTime?.hour === hour && hoverTime.half && !isDragging && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-1 text-[10px] text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Plus className="w-3 h-3" />
                      <span>點擊或拖曳</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Drag Preview */}
        {dragPreview && (
          <div
            className="absolute left-[56px] right-3 bg-primary/20 border-2 border-primary border-dashed rounded-lg flex items-center justify-center pointer-events-none z-20"
            style={{
              top: `${dragPreview.top}px`,
              height: `${dragPreview.height}px`,
            }}
          >
            <span className="text-xs font-medium text-primary">
              {dragPreview.startTime} - {dragPreview.endTime}
            </span>
          </div>
        )}

        {/* Time Blocks (breaks, buffers) */}
        {timeBlocks.map((block) => (
          <TimeBlockItem
            key={block.id}
            block={block}
            calendarStartHour={startHour}
          />
        ))}

        {/* Scheduled Tasks with column support */}
        {scheduledTasks.map((task) => {
          const columnInfo = taskColumns.get(task.id)
          return (
            <TaskBlock
              key={task.id}
              task={task}
              calendarStartHour={startHour}
              onSelect={onTaskSelect}
              onToggleComplete={onToggleComplete}
              column={columnInfo?.column ?? 0}
              totalColumns={columnInfo?.totalColumns ?? 1}
            />
          )
        })}

        {/* Current Time Indicator */}
        <CurrentTimeLine calendarStartHour={startHour} />
      </div>
    </div>
  )
}
