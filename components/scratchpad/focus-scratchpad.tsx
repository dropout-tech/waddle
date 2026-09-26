'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateString } from '@/lib/calendar-utils'
import { canvasGeometry, type CanvasGeometry } from '@/lib/scratchpad-canvas'
import { useI18n } from '@/lib/i18n/react'
import { FloatOutButton } from '@/components/floating/float-out-button'
import { ScratchpadCanvas } from './scratchpad-canvas'
import type { ScratchpadItem } from '@/lib/types'

interface FocusScratchpadProps {
  className?: string
  initialDate?: string
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  fill?: boolean
  scratchpadByDate: Record<string, ScratchpadItem[]>
  onAddItem: (date: string, item: ScratchpadItem) => void
  onUpdateItem: (id: string, patch: Partial<ScratchpadItem>) => void
  onDeleteItem: (id: string) => void
  // Kept for existing callers; the whiteboard no longer has a sortable card grid.
  onReorderItems: (date: string, items: ScratchpadItem[]) => void
  onClearDate: (date: string) => void
  onPromoteToTask?: (title: string, description: string | undefined, sourceId: string) => void
}

function placeLegacyItems(items: ScratchpadItem[], previous: Map<string, CanvasGeometry>) {
  const positions = new Map(previous)
  const occupied = items.filter(item => item.metadata?.canvas).map(canvasGeometry)
  for (const item of items) {
    const saved = positions.get(item.id)
    if (!item.metadata?.canvas && saved) occupied.push(saved)
  }
  for (const item of items) {
    if (item.metadata?.canvas || positions.has(item.id)) continue
    let geometry: CanvasGeometry
    let index = 0
    do {
      geometry = { x: 24 + index % 3 * 304, y: 24 + Math.floor(index / 3) * 244, width: 280, height: 220 }
      index += 1
    } while (occupied.some(box => geometry.x < box.x + box.width && geometry.x + geometry.width > box.x && geometry.y < box.y + box.height && geometry.y + geometry.height > box.y))
    positions.set(item.id, geometry)
    occupied.push(geometry)
  }
  return positions
}

/** Present legacy quick cards on the board without migrating or duplicating data.
 * Cache positions for this mounted date so editing one legacy item never moves
 * the others. Actual movement persists geometry through the usual callback. */
function DailyWhiteboard({ items, ...props }: {
  items: ScratchpadItem[]
  date: string
  readOnly: boolean
  fillHeight?: boolean
  onAddItem: FocusScratchpadProps['onAddItem']
  onUpdateItem: FocusScratchpadProps['onUpdateItem']
  onDeleteItem: FocusScratchpadProps['onDeleteItem']
}) {
  const [positions, setPositions] = useState(() => placeLegacyItems(items, new Map<string, CanvasGeometry>()))
  const hasNewLegacyItem = items.some(item => !item.metadata?.canvas && !positions.has(item.id))
  const layout = hasNewLegacyItem ? placeLegacyItems(items, positions) : positions
  // Adjust only when newly loaded legacy IDs arrive, retaining every earlier
  // position. The calculation is pure and does not mutate refs during render.
  if (hasNewLegacyItem) setPositions(layout)
  const visibleItems = items.map(item => item.metadata?.canvas ? item : {
    ...item, metadata: { ...item.metadata, canvas: layout.get(item.id)! },
  })
  return <ScratchpadCanvas {...props} items={visibleItems} />
}

export function FocusScratchpad({ initialDate, className, isOpen, onOpenChange, hideTrigger, fill, scratchpadByDate, onAddItem, onUpdateItem, onDeleteItem, onClearDate }: FocusScratchpadProps) {
  const { t, lang } = useI18n()
  const todayKey = toDateString(new Date())
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExpanded = isOpen !== undefined ? isOpen : internalExpanded
  const setIsExpanded = (next: boolean) => isOpen !== undefined ? onOpenChange?.(next) : setInternalExpanded(next)
  const [selectedDate, setSelectedDate] = useState(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayKey)
  const items = scratchpadByDate[selectedDate] ?? []
  const isToday = selectedDate === todayKey
  const dates = useMemo(() => Array.from(new Set([todayKey, ...Object.keys(scratchpadByDate).filter(date => scratchpadByDate[date]?.length)])).sort().reverse(), [todayKey, scratchpadByDate])
  const dateIndex = dates.indexOf(selectedDate)

  useEffect(() => {
    if (!isExpanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) setIsExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // The canvas/editor handles Escape first and stops propagation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, isOpen, onOpenChange])

  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  const control = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm hover:bg-secondary disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  return <>
    {isExpanded && !fill && <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-popover" onClick={() => setIsExpanded(false)} />}
    <div className={cn('relative z-toast', className)}>
      {!hideTrigger && !isExpanded && <button data-tour="scratchpad" className="absolute left-1/2 top-0 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-b-xl border border-t-0 border-border bg-card px-4 text-sm" onClick={() => { setSelectedDate(todayKey); setIsExpanded(true) }}>{t('白板')}<ChevronDown size={16} /></button>}
      <div className={cn(fill ? 'fixed inset-0 bg-card' : hideTrigger ? 'fixed inset-x-0 top-0 bottom-[58px] bg-card' : 'absolute inset-x-0 top-0 overflow-hidden border-b border-border bg-card', !isExpanded && !fill && 'hidden')} style={hideTrigger && !fill ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}>
        <div className={cn('overflow-y-auto', fill || hideTrigger ? 'flex h-full flex-col' : 'max-h-[85dvh]')}>
          <div className={cn('mx-auto w-full max-w-6xl px-3 py-2 sm:px-4 md:px-6', (fill || hideTrigger) && 'flex min-h-0 flex-1 flex-col max-md:pb-0')}>
            <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1" aria-label={t('白板日期')}>
              <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <button className={control} aria-label={t('上一個日期')} disabled={dateIndex < 0 || dateIndex >= dates.length - 1} onClick={() => setSelectedDate(dates[dateIndex + 1])}><ChevronLeft size={16} /></button>
                <Calendar className="shrink-0" size={14} /><span>{dateLabel}</span>
                {isToday && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-primary">{t('今天')}</span>}
                <button className={control} aria-label={t('下一個日期')} disabled={isToday} onClick={() => setSelectedDate(dateIndex > 0 ? dates[dateIndex - 1] : todayKey)}><ChevronRight size={16} /></button>
              </div>
              <div className="flex items-center gap-1">
                {!fill && <FloatOutButton tab="scratchpad" fallbackUrl="/float/scratchpad" windowName="huddle-scratchpad" width={480} height={620} />}
                {items.length > 0 && isToday && <button className={control} onClick={() => { if (window.confirm(t('確定要清除所有暫存內容嗎？'))) onClearDate(selectedDate) }}><Trash2 size={16} /><span className="max-md:sr-only">{t('清除')}</span></button>}
                {!fill && <button className={control} onClick={() => setIsExpanded(false)}><ChevronUp size={16} /><span className="max-md:sr-only">{t('收起')}</span></button>}
              </div>
            </header>
            <DailyWhiteboard key={selectedDate} items={items} date={selectedDate} readOnly={!isToday} fillHeight={!!(fill || hideTrigger)} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />
          </div>
        </div>
      </div>
    </div>
  </>
}
