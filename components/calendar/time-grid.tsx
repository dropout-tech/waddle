'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import { TimeBlockItem } from './time-block-item'
import { CurrentTimeLine } from './current-time-line'
import { CheckSquare, Coffee, Clock, Crosshair, User, X } from 'lucide-react'

interface TimeGridProps {
  scheduledTasks: Task[]
  timeBlocks: TimeBlock[]
  startHour?: number
  endHour?: number
  onTaskSelect: (task: Task) => void
  onToggleComplete?: (taskId: string) => void
  onCreateTask?: (startTime: string, endTime: string) => void
  onCreateTimeBlock?: (startTime: string, endTime: string, type: TimeBlock['type'], label: string, color: string) => void
  onUpdateTimeBlock?: (id: string, updates: Partial<TimeBlock>) => void
  onDeleteTimeBlock?: (id: string) => void
}

// Slot type options shown in the popup
const SLOT_TYPES = [
  { key: 'task', label: '任務', icon: CheckSquare, color: '#6B7FD4', description: '建立一般任務' },
  { key: 'break', label: '午休', icon: Coffee, color: '#F6A854', description: '休息時間' },
  { key: 'buffer', label: '緩衝', icon: Clock, color: '#9BBFAC', description: '彈性緩衝時間' },
  { key: 'focus', label: '專注', icon: Crosshair, color: '#D46B8A', description: '專注工作時段' },
  { key: 'personal', label: '個人', icon: User, color: '#8B8BCC', description: '個人事務' },
] as const

type SlotKey = typeof SLOT_TYPES[number]['key']

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
  const validTasks = tasks.filter(t => t.scheduledStartTime && t.scheduledEndTime)
  if (validTasks.length === 0) return result

  // Sort by start time, then by longer duration first
  const sorted = [...validTasks].sort((a, b) => {
    const startDiff = timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!)
    if (startDiff !== 0) return startDiff
    return (timeToMinutes(b.scheduledEndTime!) - timeToMinutes(b.scheduledStartTime!)) -
           (timeToMinutes(a.scheduledEndTime!) - timeToMinutes(a.scheduledStartTime!))
  })

  // Build overlap groups (connected components)
  const visited = new Set<string>()
  const groups: Task[][] = []

  for (const task of sorted) {
    if (visited.has(task.id)) continue
    // BFS to find all tasks that overlap (directly or transitively) with this one
    const group: Task[] = []
    const queue = [task]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (visited.has(cur.id)) continue
      visited.add(cur.id)
      group.push(cur)
      for (const other of sorted) {
        if (!visited.has(other.id) && overlaps(cur, other)) {
          queue.push(other)
        }
      }
    }
    groups.push(group)
  }

  // For each group, assign columns using a greedy interval scheduling approach
  for (const group of groups) {
    group.sort((a, b) => timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!))

    // columns[i] = end time (minutes) of last task placed in column i
    const columnEnds: number[] = []

    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      // Find first column where the last task ends at or before this task starts
      let placed = false
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= taskStart) {
          result.set(task.id, { column: col, totalColumns: 0 }) // totalColumns filled in below
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

    // Now set totalColumns for all tasks in this group
    const total = columnEnds.length
    for (const task of group) {
      const entry = result.get(task.id)!
      result.set(task.id, { column: entry.column, totalColumns: total })
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
  onCreateTimeBlock,
  onUpdateTimeBlock,
  onDeleteTimeBlock,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)

  // Type picker popup state — shown after drag ends
  const [pendingSlot, setPendingSlot] = useState<{
    startTime: string
    endTime: string
    anchorY: number // pixel offset inside the grid for popup positioning
  } | null>(null)

  const taskColumns = useMemo(() => calculateTaskColumns(scheduledTasks), [scheduledTasks])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  useEffect(() => {
    if (containerRef.current) {
      const now = new Date()
      const currentHour = now.getHours()
      if (currentHour >= startHour && currentHour < endHour) {
        containerRef.current.scrollTop = Math.max(0, (currentHour - startHour) * 60 - 60)
      }
    }
  }, [startHour, endHour])

  const yToMinutes = (y: number): number => startHour * 60 + y

  const snapToInterval = (minutes: number): number => {
    const snapped = Math.round(minutes / 15) * 15
    // Clamp to valid range (startHour to 23:45)
    return Math.max(startHour * 60, Math.min(23 * 60 + 45, snapped))
  }

  const clampMinutes = (minutes: number): number => {
    return Math.max(startHour * 60, Math.min(23 * 60 + 45, minutes))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only initiate drag on the grid background, not on existing blocks
    if ((e.target as HTMLElement).closest('[data-block]')) return
    if (!gridRef.current) return
    e.preventDefault()

    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0)
    const minutes = snapToInterval(yToMinutes(y))

    setIsDragging(true)
    setDragStart(minutes)
    setDragEnd(minutes + 30)
    setPendingSlot(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !gridRef.current || dragStart === null) return

    const rect = gridRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop || 0)
    const minutes = snapToInterval(yToMinutes(y))
    
    // Clamp end time to max 24:00
    const clampedMinutes = clampMinutes(minutes)
    setDragEnd(clampedMinutes > dragStart ? Math.max(clampedMinutes, dragStart + 15) : dragStart + 30)
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || dragStart === null || dragEnd === null) {
      setIsDragging(false)
      return
    }

    const start = clampMinutes(Math.min(dragStart, dragEnd))
    const end = clampMinutes(Math.max(dragStart, dragEnd))

    // Minimum 15 minutes and ensure end doesn't exceed 24:00
    if (end - start >= 15 && end <= 24 * 60) {
      const anchorY = (start - startHour * 60)
      setPendingSlot({
        startTime: minutesToTime(start),
        endTime: minutesToTime(Math.min(end, 24 * 60)),
        anchorY,
      })
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  // User picks a type from the popup
  const handleSelectType = (key: SlotKey) => {
    if (!pendingSlot) return
    const { startTime, endTime } = pendingSlot

    if (key === 'task') {
      onCreateTask?.(startTime, endTime)
    } else {
      const slotMeta = SLOT_TYPES.find(s => s.key === key)!
      onCreateTimeBlock?.(startTime, endTime, key as TimeBlock['type'], slotMeta.label, slotMeta.color)
    }
    setPendingSlot(null)
  }

  const dragPreview = (() => {
    if (!isDragging || dragStart === null || dragEnd === null) return null
    const start = Math.min(dragStart, dragEnd)
    const end = Math.max(dragStart, dragEnd)
    return {
      top: start - startHour * 60,
      height: end - start,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    }
  })()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative bg-panel-secondary"
      onMouseLeave={() => {
        if (isDragging) handleMouseUp({ clientY: 0 } as React.MouseEvent)
      }}
    >
      <div
        ref={gridRef}
        className="relative"
        style={{ height: `${(endHour - startHour) * 60}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Hour Lines */}
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex"
            style={{ top: `${index * 60}px`, height: '60px' }}
          >
            <div className="w-14 flex-shrink-0 pr-2 text-right select-none">
              <span className="text-[11px] font-mono text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
            <div className="flex-1 relative border-t border-calendar-grid">
              <div
                className="absolute left-0 right-0 border-t border-dashed border-calendar-grid-subtle pointer-events-none"
                style={{ top: '30px' }}
              />
            </div>
          </div>
        ))}

        {/* Drag Preview */}
        {dragPreview && (
          <div
            className="absolute left-14 right-3 bg-primary/15 border-2 border-primary/50 border-dashed rounded-lg flex items-center justify-center pointer-events-none z-20"
            style={{ top: `${dragPreview.top}px`, height: `${dragPreview.height}px` }}
          >
            <span className="text-xs font-medium text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
              {dragPreview.startTime} – {dragPreview.endTime}
            </span>
          </div>
        )}

        {/* Type Picker Popup */}
        {pendingSlot && (
          <>
            {/* Click-away backdrop */}
            <div
              className="fixed inset-0 z-30"
              onMouseDown={(e) => { e.stopPropagation(); setPendingSlot(null) }}
            />
            <div
              className="absolute left-16 z-40 bg-card border border-border rounded-2xl shadow-2xl p-3 w-64"
              style={{
                top: `${Math.min(pendingSlot.anchorY, (endHour - startHour) * 60 - 220)}px`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-foreground">
                  {pendingSlot.startTime} – {pendingSlot.endTime}
                </span>
                <button
                  onClick={() => setPendingSlot(null)}
                  className="p-1 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <p className="text-[10px] text-muted-foreground mb-2">選擇時間區塊的類型</p>

              <div className="flex flex-col gap-1">
                {SLOT_TYPES.map(({ key, label, icon: Icon, color, description }) => (
                  <button
                    key={key}
                    onClick={() => handleSelectType(key)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}25` }}
                    >
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

        {/* Time Blocks */}
        {timeBlocks.map((block) => (
          <div key={block.id} data-block="true">
            <TimeBlockItem
              block={block}
              calendarStartHour={startHour}
              onUpdate={onUpdateTimeBlock}
              onDelete={onDeleteTimeBlock}
            />
          </div>
        ))}

        {/* Scheduled Tasks */}
        {scheduledTasks.map((task) => {
          const columnInfo = taskColumns.get(task.id)
          return (
            <div key={task.id} data-block="true">
              <TaskBlock
                task={task}
                calendarStartHour={startHour}
                onSelect={onTaskSelect}
                onToggleComplete={onToggleComplete}
                column={columnInfo?.column ?? 0}
                totalColumns={columnInfo?.totalColumns ?? 1}
              />
            </div>
          )
        })}

        {/* Current Time Indicator */}
        <CurrentTimeLine calendarStartHour={startHour} />
      </div>
    </div>
  )
}
