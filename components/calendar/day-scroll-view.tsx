'use client'

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Task, TimeBlock } from '@/lib/types'
import { CurrentTimeLine } from './current-time-line'
import { CheckSquare, Coffee, Clock, Crosshair, User, X } from 'lucide-react'

interface DayScrollViewProps {
  selectedDate: Date
  tasks: Task[]
  timeBlocks: TimeBlock[]
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (date: string, startTime: string, endTime: string) => void
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: TimeBlock['type'], label: string, color: string) => void
  onNavigate?: (direction: 'prev' | 'next') => void
  onDateChange?: (date: Date) => void
  startHour?: number
  endHour?: number
}

const SLOT_TYPES = [
  { key: 'task',     label: '任務', icon: CheckSquare, color: '#6B7FD4', description: '建立一般任務' },
  { key: 'break',    label: '午休', icon: Coffee,      color: '#F6A854', description: '休息時間' },
  { key: 'buffer',   label: '緩衝', icon: Clock,       color: '#9BBFAC', description: '彈性緩衝時間' },
  { key: 'focus',    label: '專注', icon: Crosshair,   color: '#D46B8A', description: '專注工作時段' },
  { key: 'personal', label: '個人', icon: User,        color: '#8B8BCC', description: '個人事務' },
] as const

type SlotKey = typeof SLOT_TYPES[number]['key']

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const DAY_WIDTH = 280
const DAYS_TO_RENDER = 7
const CENTER_DAY_INDEX = 3

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snap(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

function overlaps(a: Task, b: Task): boolean {
  const aStart = timeToMinutes(a.scheduledStartTime!)
  const aEnd = timeToMinutes(a.scheduledEndTime!)
  const bStart = timeToMinutes(b.scheduledStartTime!)
  const bEnd = timeToMinutes(b.scheduledEndTime!)
  return aStart < bEnd && aEnd > bStart
}

function calculateTaskColumns(tasks: Task[]): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  const valid = tasks.filter(t => t.scheduledStartTime && t.scheduledEndTime)
  if (!valid.length) return result

  const sorted = [...valid].sort((a, b) => {
    const d = timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!)
    return d !== 0 ? d :
      (timeToMinutes(b.scheduledEndTime!) - timeToMinutes(b.scheduledStartTime!)) -
      (timeToMinutes(a.scheduledEndTime!) - timeToMinutes(a.scheduledStartTime!))
  })

  const visited = new Set<string>()
  const groups: Task[][] = []

  for (const task of sorted) {
    if (visited.has(task.id)) continue
    const group: Task[] = []
    const queue = [task]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur.id)) continue
      visited.add(cur.id)
      group.push(cur)
      for (const other of sorted) {
        if (!visited.has(other.id) && overlaps(cur, other)) queue.push(other)
      }
    }
    groups.push(group)
  }

  for (const group of groups) {
    group.sort((a, b) => timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!))
    const columnEnds: number[] = []
    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      let placed = false
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= taskStart) {
          result.set(task.id, { column: col, totalColumns: 0 })
          columnEnds[col] = timeToMinutes(task.scheduledEndTime!)
          placed = true
          break
        }
      }
      if (!placed) {
        result.set(task.id, { column: columnEnds.length, totalColumns: 0 })
        columnEnds.push(timeToMinutes(task.scheduledEndTime!))
      }
    }
    const total = columnEnds.length
    for (const task of group) {
      const e = result.get(task.id)!
      result.set(task.id, { column: e.column, totalColumns: total })
    }
  }
  return result
}

export function DayScrollView({
  selectedDate,
  tasks,
  timeBlocks,
  onTaskSelect,
  onToggleComplete,
  onCreateTask,
  onCreateTimeBlock,
  onNavigate,
  onDateChange,
  startHour = 6,
  endHour = 22,
}: DayScrollViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const isScrolling = useRef(false)

  // Drag state for creating new slots
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ day: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ day: number; y: number } | null>(null)
  const [pendingSlot, setPendingSlot] = useState<{ date: string; startTime: string; endTime: string; anchorX: number; anchorY: number } | null>(null)

  const todayString = new Date().toISOString().split('T')[0]
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  // Generate dates centered around selectedDate
  const allDates = useMemo(() => {
    const dates: Date[] = []
    const centerDate = new Date(selectedDate)
    
    for (let i = -CENTER_DAY_INDEX; i < DAYS_TO_RENDER - CENTER_DAY_INDEX; i++) {
      const d = new Date(centerDate)
      d.setDate(centerDate.getDate() + i)
      dates.push(d)
    }
    return dates
  }, [selectedDate])

  // Scroll to center on mount and when selectedDate changes
  useEffect(() => {
    const container = scrollContainerRef.current
    const header = headerScrollRef.current
    if (!container || !header) return
    
    const timeColumnWidth = 56
    const targetScrollLeft = CENTER_DAY_INDEX * DAY_WIDTH
    
    container.scrollLeft = targetScrollLeft
    header.scrollLeft = targetScrollLeft
  }, [selectedDate])

  // Sync scroll between header and grid
  const syncScroll = useCallback((source: 'header' | 'grid') => {
    const header = headerScrollRef.current
    const grid = scrollContainerRef.current
    if (!header || !grid) return
    
    if (source === 'grid') {
      header.scrollLeft = grid.scrollLeft
    } else {
      grid.scrollLeft = header.scrollLeft
    }
  }, [])

  // Handle scroll to detect edges
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || isScrolling.current) return

    const scrollLeft = container.scrollLeft
    const maxScroll = container.scrollWidth - container.clientWidth

    if (scrollLeft < DAY_WIDTH * 0.5) {
      isScrolling.current = true
      onNavigate?.('prev')
      requestAnimationFrame(() => { isScrolling.current = false })
    } else if (scrollLeft > maxScroll - DAY_WIDTH * 0.5) {
      isScrolling.current = true
      onNavigate?.('next')
      requestAnimationFrame(() => { isScrolling.current = false })
    }
  }, [onNavigate])

  // Get tasks for a specific date
  const getTasksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(t => t.scheduledDate === dateStr && t.scheduledStartTime)
  }, [tasks])

  // Get time blocks for a specific date
  const getBlocksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return timeBlocks.filter(b => b.date === dateStr)
  }, [timeBlocks])

  // Get all-day tasks
  const getAllDayTasksForDate = useCallback((date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return tasks.filter(t => 
      (t.scheduledDate === dateStr && !t.scheduledStartTime) ||
      (t.dueDate === dateStr && !t.scheduledDate)
    )
  }, [tasks])

  // Time position calculations
  const getTimePosition = useCallback((time: string) => {
    const minutes = timeToMinutes(time)
    return `${minutes - startHour * 60}px`
  }, [startHour])

  const getDurationHeight = useCallback((start: string, end: string) => {
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    return `${Math.max(endMin - startMin, 15)}px`
  }, [])

  // Drag handlers
  const yToTime = useCallback((y: number) => {
    const minutes = snap(startHour * 60 + y)
    return minutesToTime(Math.max(startHour * 60, Math.min(endHour * 60, minutes)))
  }, [startHour, endHour])

  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if ((e.target as HTMLElement).closest('[data-task]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setIsDragging(true)
    setDragStart({ day: dayIndex, y })
    setDragEnd({ day: dayIndex, y })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent, dayIndex: number) => {
    if (!isDragging || !dragStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDragEnd({ day: dayIndex, y })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      return
    }

    if (dragStart.day === dragEnd.day && Math.abs(dragEnd.y - dragStart.y) > 15) {
      const minY = Math.min(dragStart.y, dragEnd.y)
      const maxY = Math.max(dragStart.y, dragEnd.y)
      const startTime = yToTime(minY)
      const endTime = yToTime(maxY)
      const date = allDates[dragStart.day].toISOString().split('T')[0]
      
      // Calculate popup position
      const anchorX = 56 + dragStart.day * DAY_WIDTH + DAY_WIDTH / 2
      const anchorY = minY
      
      setPendingSlot({ date, startTime, endTime, anchorX, anchorY })
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, allDates, yToTime])

  // Handle slot type selection
  const handleSelectType = useCallback((key: SlotKey) => {
    if (!pendingSlot) return
    const { date, startTime, endTime } = pendingSlot
    
    if (key === 'task') {
      onCreateTask?.(date, startTime, endTime)
    } else {
      const meta = SLOT_TYPES.find(s => s.key === key)!
      onCreateTimeBlock?.(date, startTime, endTime, key as TimeBlock['type'], meta.label, meta.color)
    }
    setPendingSlot(null)
  }, [pendingSlot, onCreateTask, onCreateTimeBlock])

  const getDragSelection = useCallback((dayIndex: number) => {
    if (!isDragging || !dragStart || !dragEnd) return null
    if (dragStart.day !== dayIndex) return null
    
    const minY = Math.min(dragStart.y, dragEnd.y)
    const maxY = Math.max(dragStart.y, dragEnd.y)
    return {
      top: minY,
      height: maxY - minY,
      startTime: yToTime(minY),
      endTime: yToTime(maxY),
    }
  }, [isDragging, dragStart, dragEnd, yToTime])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-panel-secondary">
      {/* Fixed Header Row */}
      <div className="flex-shrink-0 flex border-b border-border bg-panel">
        <div className="w-14 flex-shrink-0 border-r border-border" />
        <div 
          ref={headerScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={() => syncScroll('header')}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex" style={{ width: `${DAYS_TO_RENDER * DAY_WIDTH}px` }}>
            {allDates.map((date) => {
              const dateStr = date.toISOString().split('T')[0]
              const isToday = dateStr === todayString
              const allDayTasks = getAllDayTasksForDate(date)
              const weekdayIndex = date.getDay()

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'border-r border-border last:border-r-0',
                    isToday && 'bg-primary/5'
                  )}
                  style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                >
                  <div className={cn(
                    'px-3 py-2 text-center',
                    isToday && 'bg-primary/10'
                  )}>
                    <div className="text-xs text-muted-foreground font-medium">
                      {date.getMonth() + 1}/{date.getDate()} 週{WEEKDAY_NAMES[weekdayIndex]}
                    </div>
                    <div className={cn(
                      'text-2xl font-bold',
                      isToday ? 'text-primary' : 'text-foreground'
                    )}>
                      {date.getDate()}
                    </div>
                  </div>
                  {allDayTasks.length > 0 && (
                    <div className="max-h-[60px] overflow-y-auto px-2 pb-2 space-y-1 border-t border-border/30">
                      {allDayTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onTaskSelect(task)}
                          className={cn(
                            'w-full text-left px-2 py-1 rounded text-xs font-medium truncate transition-all hover:opacity-80',
                            task.isCompleted && 'opacity-50 line-through'
                          )}
                          style={{
                            backgroundColor: task.calendarColor || task.workspaceColor,
                            color: '#fff',
                          }}
                        >
                          {task.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Scrollable Time Grid */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={() => {
          handleScroll()
          syncScroll('grid')
        }}
      >
        <div className="flex" style={{ width: `${56 + DAYS_TO_RENDER * DAY_WIDTH}px` }}>
          {/* Time labels column */}
          <div className="w-14 flex-shrink-0 sticky left-0 z-20 bg-panel border-r border-border">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] relative">
                <span className="absolute -top-2 left-1 right-1 text-[10px] text-muted-foreground font-mono text-right">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {allDates.map((date, dayIndex) => {
            const dateStr = date.toISOString().split('T')[0]
            const isToday = dateStr === todayString
            const dayTasks = getTasksForDate(date)
            const dayBlocks = getBlocksForDate(date)
            const dragSelection = getDragSelection(dayIndex)

            return (
              <div
                key={dateStr}
                className={cn(
                  'relative border-r border-border last:border-r-0 cursor-crosshair',
                  isToday && 'bg-primary/5'
                )}
                style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                onMouseDown={(e) => handleMouseDown(e, dayIndex)}
                onMouseMove={(e) => handleMouseMove(e, dayIndex)}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { if (isDragging) handleMouseUp() }}
              >
                {/* Hour lines */}
                {hours.map((hour) => (
                  <div key={hour} className="h-[60px] border-b border-border/50">
                    <div className="h-[30px] border-b border-dashed border-border/30" />
                  </div>
                ))}

                {/* Time Blocks */}
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    data-task="true"
                    className="absolute left-1 right-1 rounded px-2 py-1 text-xs font-medium overflow-hidden"
                    style={{
                      top: getTimePosition(block.startTime),
                      height: getDurationHeight(block.startTime, block.endTime),
                      backgroundColor: block.color + '30',
                      borderLeft: `3px solid ${block.color}`,
                      color: block.color,
                    }}
                  >
                    <div className="truncate">{block.label}</div>
                    <div className="text-[10px] opacity-70">{block.startTime}-{block.endTime}</div>
                  </div>
                ))}

                {/* Scheduled Tasks with overlap handling */}
                {(() => {
                  const taskColumns = calculateTaskColumns(dayTasks)
                  return dayTasks.map((task) => {
                    const col = taskColumns.get(task.id)
                    const column = col?.column ?? 0
                    const totalColumns = col?.totalColumns ?? 1
                    const widthPercent = 100 / totalColumns
                    const leftPercent = column * widthPercent

                    return (
                      <button
                        key={task.id}
                        data-task="true"
                        onClick={() => onTaskSelect(task)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={cn(
                          'absolute rounded px-2 py-1.5 text-left overflow-hidden transition-all hover:opacity-90 hover:z-10',
                          task.isCompleted && 'opacity-60'
                        )}
                        style={{
                          top: getTimePosition(task.scheduledStartTime!),
                          height: getDurationHeight(task.scheduledStartTime!, task.scheduledEndTime!),
                          left: `calc(${leftPercent}% + 4px)`,
                          width: `calc(${widthPercent}% - 8px)`,
                          backgroundColor: task.calendarColor || task.workspaceColor,
                          color: '#fff',
                        }}
                      >
                        <div className={cn(
                          'text-sm font-semibold leading-tight truncate',
                          task.isCompleted && 'line-through'
                        )}>
                          {task.title}
                        </div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {task.scheduledStartTime}-{task.scheduledEndTime}
                        </div>
                      </button>
                    )
                  })
                })()}

                {/* Drag Selection Preview */}
                {dragSelection && dragSelection.height > 10 && (
                  <div
                    className="absolute left-1 right-1 bg-primary/20 border-2 border-primary border-dashed rounded pointer-events-none z-20 flex flex-col items-center justify-center"
                    style={{
                      top: dragSelection.top,
                      height: dragSelection.height,
                    }}
                  >
                    <span className="text-xs font-mono font-bold text-primary">
                      {dragSelection.startTime} - {dragSelection.endTime}
                    </span>
                  </div>
                )}

                {/* Current time line for today */}
                {isToday && <CurrentTimeLine startHour={startHour} />}
              </div>
            )
          })}
        </div>

        {/* Type picker popup */}
        {pendingSlot && (
          <>
            <div
              className="fixed inset-0 z-30"
              onMouseDown={(e) => { e.stopPropagation(); setPendingSlot(null) }}
            />
            <div
              className="absolute z-40 bg-card border border-border rounded-2xl shadow-2xl p-3 w-64"
              style={{ 
                left: `${Math.min(pendingSlot.anchorX, (scrollContainerRef.current?.clientWidth || 400) - 280)}px`,
                top: `${Math.min(pendingSlot.anchorY, hours.length * 60 - 220)}px`
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-foreground">
                  {pendingSlot.startTime} - {pendingSlot.endTime}
                </span>
                <button onClick={() => setPendingSlot(null)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">選擇時間區塊的類型</p>
              <div className="flex flex-col gap-1">
                {SLOT_TYPES.map(({ key, label, icon: Icon, color, description }) => (
                  <button
                    key={key}
                    onClick={() => handleSelectType(key)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}25` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{label}</div>
                      <div className="text-[10px] text-muted-foreground">{description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
