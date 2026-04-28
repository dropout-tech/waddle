'use client'

import { useMemo, useState, useRef, useCallback } from 'react'
import { Clock, Inbox, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'
import { formatEstimatedTime } from '@/lib/task-utils'

interface WeekViewProps {
  selectedDate: Date
  tasks: Task[]
  pendingTasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  startHour?: number
  endHour?: number
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function WeekView({
  selectedDate,
  tasks,
  pendingTasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  startHour = 6,
  endHour = 22,
}: WeekViewProps) {
  const [pendingZoneOpen, setPendingZoneOpen] = useState(true)
  // Drag state for creating new tasks
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Get the week dates (Sunday to Saturday)
  const weekDates = useMemo(() => {
    const dates: Date[] = []
    const start = new Date(selectedDate)
    const day = start.getDay()
    start.setDate(start.getDate() - day) // Go to Sunday
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate])

  const hours = useMemo(() => {
    const h = []
    for (let i = startHour; i <= endHour; i++) {
      h.push(i)
    }
    return h
  }, [startHour, endHour])

  const today = new Date()
  const todayString = today.toISOString().split('T')[0]

  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(
      (t) => t.scheduledDate === dateStr && t.scheduledStartTime && t.scheduledEndTime
    )
  }

  // Get time blocks for a specific date
  const getTimeBlocksForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return timeBlocks.filter((tb) => tb.date === dateStr)
  }

  // Calculate position for a time
  const getTimePosition = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    const hourOffset = h - startHour
    const minuteOffset = m / 60
    return (hourOffset + minuteOffset) * 60 // 60px per hour
  }

  // Calculate height for duration
  const getDurationHeight = (start: string, end: string) => {
    const startPos = getTimePosition(start)
    const endPos = getTimePosition(end)
    return endPos - startPos
  }

  // Convert Y position to time string
  const yToTime = useCallback((y: number) => {
    const totalMinutes = startHour * 60 + Math.round(y / 60 * 60)
    // Round to nearest 15 minutes
    const roundedMinutes = Math.round(totalMinutes / 15) * 15
    const hours = Math.floor(roundedMinutes / 60)
    const minutes = roundedMinutes % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }, [startHour])

  // Handle mouse down on grid to start drag
  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (!gridRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = Math.max(0, Math.min(e.clientY - rect.top, hours.length * 60))
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart, hours.length])

  // Handle mouse up to finish drag and create task
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    // Only create if dragged on same day and has some height
    if (dragStart.day === dragEnd.day && Math.abs(dragEnd.y - dragStart.y) > 15) {
      const minY = Math.min(dragStart.y, dragEnd.y)
      const maxY = Math.max(dragStart.y, dragEnd.y)
      const startTime = yToTime(minY)
      const endTime = yToTime(maxY)
      const date = weekDates[dragStart.day].toISOString().split('T')[0]
      
      onCreateTask?.(date, startTime, endTime)
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, weekDates, yToTime, onCreateTask])

  // Calculate drag selection box
  const getDragSelection = (dayIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd || dragStart.day !== dayIndex) {
      return null
    }
    const minY = Math.min(dragStart.y, dragEnd.y)
    const maxY = Math.max(dragStart.y, dragEnd.y)
    const startTime = yToTime(minY)
    const endTime = yToTime(maxY)
    return { top: minY, height: maxY - minY, startTime, endTime }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Pending Tasks Zone - Collapsible */}
      <div className="flex-shrink-0 border-b border-border bg-muted/20">
        <button
          onClick={() => setPendingZoneOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              待排程
            </span>
            {pendingTasks.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                {pendingTasks.length}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
              pendingZoneOpen && 'rotate-180'
            )}
          />
        </button>

        {pendingZoneOpen && (
          <div className="px-4 pb-3">
            {pendingTasks.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground/50">
                <Inbox className="w-4 h-4" />
                <span className="text-xs">沒有待排程的任務</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    className={cn(
                      'group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-grab',
                      'bg-card border border-border hover:border-primary/30 hover:shadow-sm',
                      task.isCompleted && 'opacity-50'
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => onToggleComplete?.(task.id)}
                      aria-label={task.isCompleted ? '標記為未完成' : '標記為完成'}
                      className={cn(
                        'flex-shrink-0 w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center transition-all',
                        task.isCompleted
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30 hover:border-primary/50'
                      )}
                    >
                      {task.isCompleted && (
                        <Check className="w-2 h-2 text-primary-foreground" strokeWidth={3} />
                      )}
                    </button>

                    {/* Color dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: task.workspaceColor }}
                    />

                    {/* Title */}
                    <button
                      onClick={() => onTaskSelect(task)}
                      className={cn(
                        'truncate max-w-[140px] font-medium text-foreground text-left',
                        task.isCompleted && 'line-through text-muted-foreground'
                      )}
                    >
                      {task.title}
                    </button>

                    {task.estimatedMinutes && (
                      <span className="text-[10px] font-mono text-muted-foreground/70 flex-shrink-0">
                        {formatEstimatedTime(task.estimatedMinutes)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Week Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Header Row */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-panel">
          {/* Time column header */}
          <div className="w-16 flex-shrink-0 p-2 text-xs text-muted-foreground text-center border-r border-border">
            時間
          </div>
          
          {/* Day headers */}
          {weekDates.map((date, i) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const isSelected = date.toDateString() === selectedDate.toDateString()
            
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 p-2 text-center border-r border-border last:border-r-0',
                  isToday && 'bg-primary/10',
                  isSelected && 'bg-secondary'
                )}
              >
                <div className="text-xs text-muted-foreground">
                  週{WEEKDAYS[i]}
                </div>
                <div className={cn(
                  'text-sm font-bold mt-0.5',
                  isToday && 'text-primary'
                )}>
                  {date.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Time Grid */}
        <div className="relative flex" ref={gridRef}>
          {/* Time labels column */}
          <div className="w-16 flex-shrink-0 border-r border-border bg-panel">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[60px] relative border-b border-border"
              >
                <span className="absolute -top-2.5 left-2 text-[10px] text-muted-foreground font-mono">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const dayTasks = getTasksForDate(date)
            const dayBlocks = getTimeBlocksForDate(date)
            const dragSelection = getDragSelection(dayIndex)

            return (
              <div
                key={dayIndex}
                className={cn(
                  'flex-1 relative border-r border-border last:border-r-0 cursor-crosshair',
                  isToday && 'bg-primary/5'
                )}
                onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                onMouseMove={(e) => handleMouseMove(e, dayIndex)}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  if (isDragging) handleMouseUp()
                }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-[60px] border-b border-border"
                  />
                ))}

                {/* Time Blocks */}
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="absolute left-1 right-1 pointer-events-none"
                    style={{
                      top: getTimePosition(block.startTime),
                      height: getDurationHeight(block.startTime, block.endTime),
                    }}
                  >
                    <TimeBlockItem block={block} compact />
                  </div>
                ))}

                {/* Tasks */}
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="absolute left-1 right-1"
                    style={{
                      top: getTimePosition(task.scheduledStartTime!),
                      height: getDurationHeight(task.scheduledStartTime!, task.scheduledEndTime!),
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <TaskBlock
                      task={task}
                      onSelect={onTaskSelect}
                      onToggleComplete={onToggleComplete}
                      compact
                    />
                  </div>
                ))}

                {/* Drag Selection Preview */}
                {dragSelection && (
                  <div
                    className="absolute left-1 right-1 bg-primary/20 border-2 border-primary border-dashed rounded-lg pointer-events-none z-20 flex flex-col items-center justify-center"
                    style={{
                      top: dragSelection.top,
                      height: dragSelection.height,
                    }}
                  >
                    <span className="text-[10px] font-mono font-bold text-primary">
                      {dragSelection.startTime} - {dragSelection.endTime}
                    </span>
                    <span className="text-[9px] text-primary/80 mt-0.5">
                      拖曳建立任務
                    </span>
                  </div>
                )}

                {/* Current time line for today */}
                {isToday && (
                  <CurrentTimeLine startHour={startHour} />
                )}
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </div>
  )
}
