'use client'

import { useState } from 'react'
import { X, Trash2, Archive, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/lib/types'

const PRESET_COLORS = [
  '#c9847a', '#8fae8b', '#a8927f', '#7da2b8', '#c4a4b5', '#d4a76a',
  '#e07b5a', '#6b9e78', '#9b7cb6', '#5b9ec9', '#d4845a', '#7aad9e',
  '#b07bb5', '#c4a95a', '#7a9ec9', '#d47a8b',
]

const PRESET_ICONS = ['⭐', '❤️', '🔥', '⚡', '📚', '🎵', '🌍', '🎯', '💡', '🚀', '🌱', '💎', '🏆', '🎨', '📝', '⚙️']

interface WorkspaceSettingsModalProps {
  workspace: Workspace
  isOpen: boolean
  onClose: () => void
  onUpdate: (workspaceId: string, updates: Partial<Pick<Workspace, 'name' | 'color' | 'icon'>>) => void
  onArchive?: (workspaceId: string) => void
  onDelete?: (workspaceId: string) => void
}

export function WorkspaceSettingsModal({
  workspace,
  isOpen,
  onClose,
  onUpdate,
  onArchive,
  onDelete,
}: WorkspaceSettingsModalProps) {
  const [name, setName] = useState(workspace.name)
  const [color, setColor] = useState(workspace.color)
  const [icon, setIcon] = useState(workspace.icon)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!isOpen) return null

  const hasChanges =
    name !== workspace.name || color !== workspace.color || icon !== workspace.icon

  const handleSave = () => {
    if (!name.trim()) return
    onUpdate(workspace.id, { name: name.trim(), color, icon })
    onClose()
  }

  const taskCount = workspace.categories.reduce(
    (sum, cat) => sum + cat.tasks.filter((t) => !t.isCompleted).length,
    0
  )
  const totalTasks = workspace.categories.reduce((sum, cat) => sum + cat.tasks.length, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm mx-4 overflow-hidden">

        {/* Color accent top bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}40` }}
            >
              {icon || <span style={{ color }} className="text-xs font-bold">{name.charAt(0)}</span>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">工作區設定</p>
              <p className="text-sm font-semibold text-foreground leading-tight">{workspace.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="關閉"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">

          {/* Stats */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{taskCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">待完成</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{totalTasks}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">全部任務</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums">{workspace.categories.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">分類數</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              名稱
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              placeholder="工作區名稱..."
            />
          </div>

          {/* Icon */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              圖示
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map((ic, idx) => (
                <button
                  key={`icon-${idx}`}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    'w-8 h-8 rounded-lg border text-base flex items-center justify-center transition-all hover:scale-110',
                    icon === ic
                      ? 'border-primary/60 bg-primary/10 scale-110'
                      : 'border-border hover:border-border/80 bg-muted/30'
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
              顏色
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                >
                  {color === c && <Check className="w-3 h-3 text-white drop-shadow" strokeWidth={3} />}
                </button>
              ))}
            </div>
            {/* Custom color picker */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">自訂顏色</span>
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border border-border opacity-0 absolute inset-0"
                />
                <div
                  className="w-7 h-7 rounded-full border-2 border-border cursor-pointer flex items-center justify-center text-[10px] font-mono text-white/70 overflow-hidden"
                  style={{ backgroundColor: color }}
                >
                  #
                </div>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">{color}</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 space-y-3">
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!name.trim() || !hasChanges}
            className={cn(
              'w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
              hasChanges && name.trim()
                ? 'text-white shadow-sm hover:brightness-110'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
            style={hasChanges && name.trim() ? { backgroundColor: color } : {}}
          >
            儲存變更
          </button>

          {/* Danger zone */}
          <div className="flex gap-2">
            {onArchive && (
              <button
                onClick={() => { onArchive(workspace.id); onClose() }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                封存
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  if (confirmDelete) {
                    onDelete(workspace.id)
                    onClose()
                  } else {
                    setConfirmDelete(true)
                    setTimeout(() => setConfirmDelete(false), 3000)
                  }
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all',
                  confirmDelete
                    ? 'border-red-400 bg-red-50 text-red-600 dark:bg-red-950/30'
                    : 'border-border text-muted-foreground hover:border-red-300 hover:text-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20'
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? '確認刪除' : '刪除'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
