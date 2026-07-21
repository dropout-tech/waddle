'use client'

import { useState } from 'react'
import { Search, Filter, X, ChevronDown, AlignJustify, Minus, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Density, MetaField } from './task-panel'
import { useI18n } from '@/lib/i18n/react'

export interface FilterState {
  search: string
  urgency: number[] // empty = all
  showCompleted: boolean
  workspaceIds: string[] // empty = all
}

const DENSITY_OPTIONS: { value: Density; icon: React.ReactNode; label: string }[] = [
  { value: 'compact', icon: <Minus className="w-3.5 h-3.5" />, label: '精簡' },
  { value: 'comfortable', icon: <AlignJustify className="w-3.5 h-3.5" />, label: '詳細' },
]

const META_FIELD_LABELS: Record<MetaField, string> = {
  duration: '花費時間',
  date: '日期',
  time: '時間段',
}

interface FilterBarProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  workspaces: { id: string; name: string; color: string }[]
  density: Density
  onDensityChange: (d: Density) => void
  metaOrder: MetaField[]
  onMetaOrderChange: (order: MetaField[]) => void
}

export function FilterBar({ filters, onFiltersChange, workspaces, density, onDensityChange, metaOrder, onMetaOrderChange }: FilterBarProps) {
  const { t } = useI18n()
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [draggingField, setDraggingField] = useState<MetaField | null>(null)
  const [dragOverField, setDragOverField] = useState<MetaField | null>(null)

  const hasActiveFilters =
    filters.urgency.length > 0 ||
    !filters.showCompleted ||
    filters.workspaceIds.length > 0

  const clearFilters = () => {
    onFiltersChange({
      ...filters,
      urgency: [],
      showCompleted: true,
      workspaceIds: [],
    })
  }

  const toggleUrgency = (level: number) => {
    const current = filters.urgency
    const updated = current.includes(level)
      ? current.filter((u) => u !== level)
      : [...current, level]
    onFiltersChange({ ...filters, urgency: updated })
  }

  const toggleWorkspace = (id: string) => {
    const current = filters.workspaceIds
    const updated = current.includes(id)
      ? current.filter((w) => w !== id)
      : [...current, id]
    onFiltersChange({ ...filters, workspaceIds: updated })
  }

  return (
    <div className="px-3 pb-3 border-b border-border bg-card/50">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder={t('搜尋任務...')}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {filters.search && (
          <button
            onClick={() => onFiltersChange({ ...filters, search: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filter Toggle + Density Toggle */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            hasActiveFilters
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <Filter className="w-3 h-3" />
          <span>{t('篩選')}</span>
          {hasActiveFilters && (
            <span className="ml-1 px-1 py-0.5 rounded bg-primary text-primary-foreground text-[10px]">
              {filters.urgency.length + filters.workspaceIds.length + (filters.showCompleted ? 0 : 1)}
            </span>
          )}
          <ChevronDown
            className={cn('w-3 h-3 transition-transform', showFilterPanel && 'rotate-180')}
          />
        </button>

        <div className="flex items-center gap-0.5">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mr-2 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              {t('清除')}
            </button>
          )}
          {/* Density Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onDensityChange(opt.value)}
                title={t(opt.label)}
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-md transition-all',
                  density === opt.value
                    ? 'bg-card shadow-sm text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="mt-3 p-3 rounded-lg border border-border bg-card space-y-3">
          {/* Urgency Filter */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('急迫度 (1-10)')}
            </span>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => toggleUrgency(level)}
                  className={cn(
                    'w-6 h-6 rounded text-[10px] font-bold transition-all',
                    filters.urgency.includes(level)
                      ? level <= 3
                        ? 'bg-urgency-low text-foreground'
                        : level <= 5
                        ? 'bg-urgency-medium text-foreground'
                        : level <= 8
                        ? 'bg-urgency-high text-white'
                        : 'bg-urgency-critical text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Workspace Filter */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('工作區')}
            </span>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => toggleWorkspace(ws.id)}
                  className={cn(
                    'px-2 py-1 rounded text-[10px] font-medium transition-all border',
                    filters.workspaceIds.includes(ws.id)
                      ? 'border-current'
                      : 'border-transparent bg-muted text-muted-foreground'
                  )}
                  style={
                    filters.workspaceIds.includes(ws.id)
                      ? { backgroundColor: `${ws.color}20`, color: ws.color }
                      : {}
                  }
                >
                  {ws.name}
                </button>
              ))}
            </div>
          </div>

          {/* Show Completed Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('顯示已完成')}
            </span>
            <button
              onClick={() => onFiltersChange({ ...filters, showCompleted: !filters.showCompleted })}
              className={cn(
                'w-9 h-5 rounded-full transition-colors relative',
                filters.showCompleted ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                  filters.showCompleted ? 'translate-x-[18px]' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>

          {/* Meta Info Order */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {t('資訊顯示順序')}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5">
              {metaOrder.map((field, index) => (
                <div
                  key={field}
                  draggable
                  onDragStart={() => setDraggingField(field)}
                  onDragEnd={() => {
                    if (draggingField && dragOverField && draggingField !== dragOverField) {
                      const from = metaOrder.indexOf(draggingField)
                      const to = metaOrder.indexOf(dragOverField)
                      const next = [...metaOrder]
                      next.splice(from, 1)
                      next.splice(to, 0, draggingField)
                      onMetaOrderChange(next)
                    }
                    setDraggingField(null)
                    setDragOverField(null)
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverField(field) }}
                  onDragLeave={() => setDragOverField(null)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium cursor-grab active:cursor-grabbing select-none transition-all',
                    draggingField === field
                      ? 'opacity-40 border-primary/40 bg-primary/5'
                      : dragOverField === field
                      ? 'border-primary bg-primary/10 text-primary scale-105'
                      : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  )}
                >
                  <GripVertical className="w-2.5 h-2.5 opacity-50" />
                  <span className="text-[9px] text-muted-foreground/60 font-mono mr-0.5">{index + 1}</span>
                  {t(META_FIELD_LABELS[field])}
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground/50 mt-1">{t('拖曳調整顯示順序')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
