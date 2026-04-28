'use client'

import { useState } from 'react'
import { Search, Filter, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FilterState {
  search: string
  urgency: number[] // empty = all
  showCompleted: boolean
  workspaceIds: string[] // empty = all
}

interface FilterBarProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  workspaces: { id: string; name: string; color: string }[]
}

export function FilterBar({ filters, onFiltersChange, workspaces }: FilterBarProps) {
  const [showFilterPanel, setShowFilterPanel] = useState(false)

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
          placeholder="搜尋任務..."
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

      {/* Filter Toggle */}
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
          <span>篩選</span>
          {hasActiveFilters && (
            <span className="ml-1 px-1 py-0.5 rounded bg-primary text-primary-foreground text-[10px]">
              {filters.urgency.length + filters.workspaceIds.length + (filters.showCompleted ? 0 : 1)}
            </span>
          )}
          <ChevronDown
            className={cn('w-3 h-3 transition-transform', showFilterPanel && 'rotate-180')}
          />
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            清除全部
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="mt-3 p-3 rounded-lg border border-border bg-card space-y-3">
          {/* Urgency Filter */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              急迫度
            </span>
            <div className="flex gap-1 mt-1.5">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => toggleUrgency(level)}
                  className={cn(
                    'w-7 h-7 rounded text-xs font-medium transition-all',
                    filters.urgency.includes(level)
                      ? level <= 2
                        ? 'bg-emerald-500 text-white'
                        : level <= 3
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-500 text-white'
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
              工作區
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
              顯示已完成
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
        </div>
      )}
    </div>
  )
}
