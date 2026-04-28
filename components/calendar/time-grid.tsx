'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { Task, TimeBlock } from '@/lib/types'
import { TaskBlock } from './task-block'
import type { TaskDragStart } from './task-block'
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
  onRescheduleTask?: (taskId: string, newStart: string, newEnd: string) => void
}

const SLOT_TYPES = [
  { key: 'task',     label: '任務', icon: CheckSquare, color: '#6B7FD4', description: '建立一般任務' },
  { key: 'break',    label: '午休', icon: Coffee,      color: '#F6A854', description: '休息時間' },
  { key: 'buffer',   label: '緩衝', icon: Clock,       color: '#9BBFAC', description: '彈性緩衝時間' },
  { key: 'focus',    label: '專注', icon: Crosshair,   color: '#D46B8A', description: '專注工作時段' },
  { key: 'personal', label: '個人', icon: User,        color: '#8B8BCC', description: '個人事務' },
] as const

type SlotKey = typeof SLOT_TYPES[number]['key']

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

function clamp(minutes: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, minutes))
}

function overlaps(a: Task, b: Task): boolean {
  const aStart = timeToMinutes(a.scheduledStartTime!)
  const aEnd   = timeToMinutes(a.scheduledEndTime!)
  const bStart = timeToMinutes(b.scheduledStartTime!)
  const bEnd   = timeToMinutes(b.scheduledEndTime!)
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

// ─── Task drag state ─────────────────────────────────────────────────────────
interface ActiveTaskDrag extends TaskDragStart {
  currentStart: number
  currentEnd: number
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
  onRescheduleTask,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef      = useRef<HTMLDivElement>(null)

  // ── New-slot drag (background) ──────────────────────────────────────────
  const [isSlotDragging, setIsSlotDragging] = useState(false)
  const [slotDragStart, setSlotDragStart]   = useState<number | null>(null)
  const [slotDragEnd, setSlotDragEnd]       = useState<number | null>(null)
  const [pendingSlot, setPendingSlot]       = useState<{ startTime: string; endTime: string; anchorY: number } | null>(null)

  // ── Task block drag (move / resize) ─────────────────────────────────────
  const [activeTaskDrag, setActiveTaskDrag] = useState<ActiveTaskDrag | null>(null)

  const taskColumns = useMemo(() => calculateTaskColumns(scheduledTasks), [scheduledTasks])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  const MIN = startHour * 60
  const MAX = 24 * 60  // allow up to midnight

  // Scroll to current time on mount
  useEffect(() => {
    if (containerRef.current) {
      const now = new Date()
      const h = now.getHours()
      if (h >= startHour && h < endHour) {
        containerRef.current.scrollTop = Math.max(0, (h - startHour) * 60 - 60)
      }
    }
  }, [startHour, endHour])

  // ── Grid Y → minutes ─────────────────────────────────────────────────
  const yToMinutes = useCallback((clientY: number): number => {
    if (!gridRef.current) return MIN
    const rect = gridRef.current.getBoundingClientRect()
    const scrollTop = containerRef.current?.scrollTop ?? 0
    return MIN + (clientY - rect.top + scrollTop)
  }, [MIN])

  // ── Mouse handlers ────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    // Skip if clicking on an existing block
    if ((e.target as HTMLElement).closest('[data-block]')) return
    if (e.button !== 0) return
    e.preventDefault()
    const minutes = snap(yToMinutes(e.clientY))
    setIsSlotDragging(true)
    setSlotDragStart(minutes)
    setSlotDragEnd(minutes + 30)
    setPendingSlot(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const curY = yToMinutes(e.clientY)

    // Task block drag
    if (activeTaskDrag) {
      const snappedY = snap(curY)
      const duration = activeTaskDrag.originalEnd - activeTaskDrag.originalStart

      if (activeTaskDrag.dragType === 'move') {
        // Offset preserves where inside the block the user grabbed
        const newStart = clamp(snap(curY - activeTaskDrag.offsetY), MIN, MAX - 15)
        const newEnd   = clamp(newStart + duration, MIN + 15, MAX)
        setActiveTaskDrag(prev => prev ? { ...prev, currentStart: newStart, currentEnd: newEnd } : null)
        return
      }
      if (activeTaskDrag.dragType === 'resize-top') {
        const newStart = clamp(snappedY, MIN, activeTaskDrag.currentEnd - 15)
        setActiveTaskDrag(prev => prev ? { ...prev, currentStart: newStart } : null)
        return
      }
      if (activeTaskDrag.dragType === 'resize-bottom') {
        const newEnd = clamp(snappedY, activeTaskDrag.currentStart + 15, MAX)
        setActiveTaskDrag(prev => prev ? { ...prev, currentEnd: newEnd } : null)
        return
      }
    }

    // New-slot drag
    if (isSlotDragging && slotDragStart !== null) {
      const clamped = clamp(snap(curY), MIN, MAX - 15)
      setSlotDragEnd(clamped > slotDragStart ? Math.max(clamped, slotDragStart + 15) : slotDragStart + 30)
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    // Commit task drag
    if (activeTaskDrag) {
      const { taskId, currentStart, currentEnd } = activeTaskDrag
      onRescheduleTask?.(taskId, minutesToTime(currentStart), minutesToTime(currentEnd))
      setActiveTaskDrag(null)
      return
    }

    // Commit new-slot drag
    if (!isSlotDragging || slotDragStart === null || slotDragEnd === null) {
      setIsSlotDragging(false)
      return
    }
    const start = clamp(Math.min(slotDragStart, slotDragEnd), MIN, MAX)
    const end   = clamp(Math.max(slotDragStart, slotDragEnd), MIN, MAX)
    if (end - start >= 15) {
      setPendingSlot({
        startTime: minutesToTime(start),
        endTime: minutesToTime(Math.min(end, MAX)),
        anchorY: start - MIN,
      })
    }
    setIsSlotDragging(false)
    setSlotDragStart(null)
    setSlotDragEnd(null)
  }

  // Cancel drag on leave
  const handleMouseLeave = () => {
    if (activeTaskDrag) {
      const { taskId, currentStart, currentEnd } = activeTaskDrag
      onRescheduleTask?.(taskId, minutesToTime(currentStart), minutesToTime(currentEnd))
      setActiveTaskDrag(null)
    }
    if (isSlotDragging) {
      handleMouseUp({ clientY: 0 } as React.MouseEvent)
    }
  }

  const handleTaskDragStart = useCallback((info: TaskDragStart) => {
    setActiveTaskDrag({
      ...info,
      currentStart: info.originalStart,
      currentEnd:   info.originalEnd,
    })
    setPendingSlot(null)
  }, [])

  const handleSelectType = (key: SlotKey) => {
    if (!pendingSlot) return
    const { startTime, endTime } = pendingSlot
    if (key === 'task') {
      onCreateTask?.(startTime, endTime)
    } else {
      const meta = SLOT_TYPES.find(s => s.key === key)!
      onCreateTimeBlock?.(startTime, endTime, key as TimeBlock['type'], meta.label, meta.color)
    }
    setPendingSlot(null)
  }

  // Slot drag preview
  const slotPreview = (() => {
    if (!isSlotDragging || slotDragStart === null || slotDragEnd === null) return null
    const start = Math.min(slotDragStart, slotDragEnd)
    const end   = Math.max(slotDragStart, slotDragEnd)
    return { top: start - MIN, height: end - start, startTime: minutesToTime(start), endTime: minutesToTime(end) }
  })()

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto relative bg-panel-secondary"
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={gridRef}
        className="relative"
        style={{
          height: `${(endHour - startHour) * 60}px`,
          cursor: activeTaskDrag
            ? activeTaskDrag.dragType === 'move' ? 'grabbing' : 'ns-resize'
            : 'default',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Hour lines */}
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

        {/* New-slot drag preview */}
        {slotPreview && (
          <div
            className="absolute left-14 right-3 bg-primary/15 border-2 border-primary/50 border-dashed rounded-lg flex items-center justify-center pointer-events-none z-20"
            style={{ top: `${slotPreview.top}px`, height: `${slotPreview.height}px` }}
          >
            <span className="text-xs font-medium text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
              {slotPreview.startTime} – {slotPreview.endTime}
            </span>
          </div>
        )}

        {/* Type picker popup */}
        {pendingSlot && (
          <>
            <div
              className="fixed inset-0 z-30"
              onMouseDown={(e) => { e.stopPropagation(); setPendingSlot(null) }}
            />
            <div
              className="absolute left-16 z-40 bg-card border border-border rounded-2xl shadow-2xl p-3 w-64"
              style={{ top: `${Math.min(pendingSlot.anchorY, (endHour - startHour) * 60 - 220)}px` }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-foreground">
                  {pendingSlot.startTime} – {pendingSlot.endTime}
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
          const col = taskColumns.get(task.id)
          const isDraggingThis = activeTaskDrag?.taskId === task.id

          // Compute live preview override while dragging
          const dragOverride = isDraggingThis && activeTaskDrag
            ? {
                top: activeTaskDrag.currentStart - MIN,
                height: activeTaskDrag.currentEnd - activeTaskDrag.currentStart,
              }
            : null

          return (
            <TaskBlock
              key={task.id}
              task={task}
              calendarStartHour={startHour}
              onSelect={onTaskSelect}
              onToggleComplete={onToggleComplete}
              onDragStart={handleTaskDragStart}
              column={col?.column ?? 0}
              totalColumns={col?.totalColumns ?? 1}
              dragOverride={dragOverride}
              isDragging={isDraggingThis}
            />
          )
        })}

        {/* Current Time Indicator */}
        <CurrentTimeLine calendarStartHour={startHour} />
      </div>
    </div>
  )
}
