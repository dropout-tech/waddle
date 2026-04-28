'use client'

import { Coffee, Clock, User, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimeBlock } from '@/lib/types'
import { calculateBlockHeight, calculateBlockTop } from '@/lib/task-utils'

interface TimeBlockItemProps {
  block: TimeBlock
  calendarStartHour?: number
}

const typeIcons = {
  break: Coffee,
  buffer: Clock,
  personal: User,
  focus: Target,
}

const typeLabels = {
  break: '休息',
  buffer: '緩衝',
  personal: '私人',
  focus: '專注',
}

export function TimeBlockItem({
  block,
  calendarStartHour = 7,
}: TimeBlockItemProps) {
  const top = calculateBlockTop(block.startTime, calendarStartHour)
  const height = calculateBlockHeight(block.startTime, block.endTime)
  const Icon = typeIcons[block.type]

  return (
    <div
      className={cn(
        'absolute left-[60px] right-4 rounded-lg overflow-hidden',
        'border border-border/50'
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        background: `repeating-linear-gradient(
          135deg,
          ${block.color}20,
          ${block.color}20 8px,
          ${block.color}10 8px,
          ${block.color}10 16px
        )`,
      }}
    >
      <div className="p-2 h-full flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {block.label}
        </span>
        <span className="text-[10px] text-muted-foreground/70 font-mono ml-auto">
          {block.startTime} - {block.endTime}
        </span>
      </div>
    </div>
  )
}
