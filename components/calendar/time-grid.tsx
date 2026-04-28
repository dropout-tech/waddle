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

function calculateTaskColumns(tasks: Task[]): Map<string, { column: number; totalColumns: number }> {
  const result = new Map<string, { column: number; totalColumns: number }>()
  const validTasks = tasks.filter(t => t.scheduledStartTime && t.scheduledEndTime)
  if (validTasks.length === 0) return result

  const sorted = [...validTasks].sort((a, b) => {
    const startA = timeToMinutes(a.scheduledStartTime!)
    const startB = timeToMinutes(b.scheduledStartTime!)
    if (startA !== startB) return startA - startB
    return timeToMinutes(b.scheduledEndTime!) - timeToMinutes(a.scheduledEndTime!)
  })

  const groups: Task[][] = []
  for (const task of sorted) {
    const taskStart = timeToMinutes(task.scheduledStartTime!)
    const taskEnd = timeToMinutes(task.scheduledEndTime!)
    let foundGroup = false
    for (const group of groups) {
      if (group.some(t => taskStart < timeToMinutes(t.scheduledEndTime!) && taskEnd > timeToMinutes(t.scheduledStartTime!))) {
        group.push(task)
        foundGroup = true
        break
      }
    }
    if (!foundGroup) groups.push([task])
  }

  // Merge overlapping groups
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const overlaps = groups[i].some(ti =>
          groups[j].some(tj =>
            timeToMinutes(ti.scheduledStartTime!) < timeToMinutes(tj.scheduledEndTime!) &&
            timeToMinutes(ti.scheduledEndTime!) > timeToMinutes(tj.scheduledStartTime!)
          )
        )
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

  for (const group of groups) {
    group.sort((a, b) => timeToMinutes(a.scheduledStartTime!) - timeToMinutes(b.scheduledStartTime!))
    const columns: Task[][] = []
    for (const task of group) {
      const taskStart = timeToMinutes(task.scheduledStartTime!)
      let placed = false
      for (let col = 0; col < columns.length; col++) {
        if (timeToMinutes(columns[col][columns[col].length - 1].scheduledEndTime!) <= taskStart) {
          columns[col].push(task)
          placed = true
          break
        }
      }
      if (!placed) columns.push([task])
    }
    for (let col = 0; col < columns.length; col++) {
      for (const task of columns[col]) {
        result.set(task.id, { column: col, totalColumns: columns.length })
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

  const snapToInterval = (minutes: number): number => Math.round(minutes / 15) * 15

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

    setDragEnd(minutes > dragStart ? Math.max(minutes, dragStart + 15) : dragStart + 30)
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || dragStart === null || dragEnd === null) {
      setIsDragging(false)
      return
    }

    const start = Math.min(dragStart, dragEnd)
    const end = Math.max(dragStart, dragEnd)

    // Minimum 15 minutes
    if (end - start >= 15) {
      const rect = gridRef.current?.getBoundingClientRect()
      const anchorY = (start - startHour * 60)
      setPendingSlot({
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
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
