'use client'

import { useState } from 'react'
import { Sun, Leaf, Plus, X, Settings2, PanelLeftClose, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'
import { WorkspaceSettingsModal } from '@/components/modals/workspace-settings-modal'
import { WorkspaceIcon, PRESET_ICONS, PRESET_ICON_NAMES } from '@/lib/workspace-icons'

interface PanelHeaderProps {
  workspaces: Workspace[]
  isExpanded?: boolean
  onWorkspaceClick: (workspaceId: string) => void
  onAddWorkspace?: (name: string, color: string, icon: string) => void
  onUpdateWorkspaceColor?: (workspaceId: string, color: string) => void
  onUpdateWorkspace?: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onDeleteWorkspace?: (workspaceId: string) => void
  onArchiveWorkspace?: (workspaceId: string) => void
  onClosePanel?: () => void
  onToggleExpand?: () => void
}

const PRESET_COLORS = [
  '#c9847a', '#8fae8b', '#a8927f', '#7da2b8', '#c4a4b5', '#d4a76a',
]

export function PanelHeader({
  workspaces,
  isExpanded = false,
  onWorkspaceClick,
  onAddWorkspace,
  onUpdateWorkspaceColor,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onArchiveWorkspace,
  onClosePanel,
  onToggleExpand,
}: PanelHeaderProps) {
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null)
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null)
  const settingsWorkspace = workspaces.find((w) => w.id === settingsWorkspaceId) ?? null
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [selectedIcon, setSelectedIcon] = useState(PRESET_ICON_NAMES[0])
  const today = new Date()

  // Count pending tasks per workspace
  const getWorkspaceCount = (workspace: Workspace) => {
    let count = 0
    for (const category of workspace.categories) {
      count += category.tasks.filter((t) => !t.isCompleted).length
    }
    return count
  }

  // Get total pending tasks
  const totalPending = workspaces.reduce((sum, ws) => sum + getWorkspaceCount(ws), 0)

  const handleAddWorkspace = () => {
    if (newName.trim() && onAddWorkspace) {
      onAddWorkspace(newName.trim(), selectedColor, selectedIcon)
      setNewName('')
      setSelectedColor(PRESET_COLORS[0])
      setSelectedIcon(PRESET_ICON_NAMES[0])
      setIsAdding(false)
    }
  }

  return (
    <div className="relative px-5 py-5 border-b border-border bg-card">
      {/* Row 1: Brand + Weather */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <Leaf className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                FlowDesk
              </h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5">
                your daily planner
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Weather Widget - Minimal */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/50 border border-border">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-medium text-foreground">26°</span>
          </div>

          {/* Expand/Collapse Right Panel Button */}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                isExpanded 
                  ? "bg-primary/10 text-primary hover:bg-primary/20" 
                  : "hover:bg-secondary text-muted-foreground"
              )}
              title={isExpanded ? "顯示日曆" : "展開任務面板"}
            >
              {isExpanded ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Close Panel Button */}
          {onClosePanel && !isExpanded && (
            <button
              onClick={onClosePanel}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title="收起面板"
            >
              <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Date Display - Japanese style */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground tabular-nums">
            {today.getDate()}
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">
              {today.toLocaleDateString('zh-TW', { month: 'long' })}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {today.toLocaleDateString('zh-TW', { weekday: 'long' })}
            </span>
          </div>
          <div className="ml-auto">
            <span className="stamp text-primary border-primary">
              {totalPending} 待辦
            </span>
          </div>
        </div>
      </div>

      {/* Workspace Badges - Clean pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {workspaces
          .filter((w) => !w.isArchived)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((workspace) => {
            const count = getWorkspaceCount(workspace)
            return (
              <button
                key={workspace.id}
                onClick={() => onWorkspaceClick(workspace.id)}
                className={cn(
                  'group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                  'border bg-card hover:bg-muted/50'
                )}
                style={{ borderColor: `${workspace.color}40`, color: workspace.color }}
              >
                <WorkspaceIcon 
                  icon={workspace.icon} 
                  fallback={workspace.name}
                  color={workspace.color} 
                  size="xs" 
                />
                <span className="font-semibold">{workspace.name}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{ backgroundColor: `${workspace.color}18` }}
                >
                  {count}
                </span>
                
                {/* Settings icon - appears on hover */}
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    setSettingsWorkspaceId(workspace.id)
                  }}
                  className="ml-0.5 p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/60 transition-all cursor-pointer"
                >
                  <Settings2 className="w-3 h-3" />
                </span>
              </button>
            )
          })}

        {/* Add Workspace Button */}
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
        >
          <Plus className="w-3 h-3" />
          <span>新增</span>
        </button>
      </div>

      {/* Workspace Settings Modal */}
      {settingsWorkspace && (
        <WorkspaceSettingsModal
          workspace={settingsWorkspace}
          isOpen={!!settingsWorkspaceId}
          onClose={() => setSettingsWorkspaceId(null)}
          onUpdate={(id, updates) => {
            onUpdateWorkspace?.(id, updates)
            if (updates.color) onUpdateWorkspaceColor?.(id, updates.color)
          }}
          onDelete={onDeleteWorkspace}
          onArchive={onArchiveWorkspace}
        />
      )}

      {/* Add Workspace Modal */}
      {isAdding && (
        <div className="absolute inset-x-0 top-full mt-2 mx-4 p-4 bg-card border border-border rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">新增工作區</span>
            <button
              onClick={() => setIsAdding(false)}
              className="p-1 rounded hover:bg-secondary"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddWorkspace()
              else if (e.key === 'Escape') setIsAdding(false)
            }}
            placeholder="工作區名稱..."
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />

          {/* Color Picker */}
          <div className="mb-3">
            <span className="text-xs text-muted-foreground mb-1.5 block">顏色</span>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-all',
                    selectedColor === color && 'ring-2 ring-offset-2 ring-primary'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Icon Picker */}
          <div className="mb-4">
            <span className="text-xs text-muted-foreground mb-1.5 block">圖示</span>
            <div className="flex gap-2 flex-wrap">
              {PRESET_ICONS.map(({ value, label }) => (
                <button
                  key={label}
                  onClick={() => setSelectedIcon(value)}
                  title={label}
                  className={cn(
                    'w-8 h-8 rounded-lg border flex items-center justify-center text-base transition-all',
                    selectedIcon === value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {value || <span className="text-muted-foreground text-xs">無</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddWorkspace}
            disabled={!newName.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            建立工作區
          </button>
        </div>
      )}
    </div>
  )
}
