'use client'

import { Coffee, Clock, User, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimeBlock } from '@/lib/types'
import { calculateBlockHeight, calculateBlockTop } from '@/lib/task-utils'

interface TimeBlockItemProps {
  block: TimeBlock
  calendarStartHour?: number
  compact?: boolean
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
  compact = false,
}: TimeBlockItemProps) {
  const top = compact ? 0 : calculateBlockTop(block.startTime, calendarStartHour)
  const height = compact ? '100%' : calculateBlockHeight(block.startTime, block.endTime)
  const Icon = typeIcons[block.type]

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden',
        'border-2 border-border/50',
        compact ? 'w-full h-full' : 'absolute left-[60px] right-4'
      )}
      style={{
        ...(compact ? {} : { top: `${top}px`, height: `${height}px` }),
        background: `repeating-linear-gradient(
          135deg,
          ${block.color}30,
          ${block.color}30 8px,
          ${block.color}15 8px,
          ${block.color}15 16px
        )`,
      }}
    >
      <div className={cn(
        'h-full flex items-center gap-2',
        compact ? 'p-1' : 'p-2'
      )}>
        <Icon className={cn(
          'text-muted-foreground',
          compact ? 'w-3 h-3' : 'w-4 h-4'
        )} />
        {!compact && (
          <>
            <span className="text-xs font-medium text-muted-foreground">
              {block.label}
            </span>
            <span className="text-[10px] text-muted-foreground/70 font-mono ml-auto">
              {block.startTime} - {block.endTime}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
