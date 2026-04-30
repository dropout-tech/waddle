'use client'

import { useState } from 'react'
import { X, Clock, Coffee, Save, Layers, Plus, Trash2, GripVertical, ChevronRight, CheckSquare, Crosshair, User, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UserSettings, TimeBlock, SlotType, Workspace } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Map icon names to components
const ICON_MAP: Record<string, React.ElementType> = {
  CheckSquare,
  Coffee,
  Clock,
  Crosshair,
  User,
  Layers,
}

const AVAILABLE_ICONS = [
  { name: 'CheckSquare', icon: CheckSquare },
  { name: 'Coffee', icon: Coffee },
  { name: 'Clock', icon: Clock },
  { name: 'Crosshair', icon: Crosshair },
  { name: 'User', icon: User },
  { name: 'Layers', icon: Layers },
]

interface SettingsModalProps {
  isOpen: boolean
  settings: UserSettings
  timeBlocks: TimeBlock[]
  workspaces: Workspace[]
  onClose: () => void
  onSave: (settings: UserSettings, timeBlocks: TimeBlock[]) => void
}

const PRESET_COLORS = [
  '#FF6B6B', '#4A90D9', '#66BB6A', '#FFB74D', '#9575CD',
  '#4DD0E1', '#F06292', '#AED581', '#FFD54F', '#90A4AE',
]

export function SettingsModal({
  isOpen,
  settings,
  timeBlocks,
  workspaces,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings)
  const [localTimeBlocks, setLocalTimeBlocks] = useState<TimeBlock[]>(timeBlocks)
  const [activeTab, setActiveTab] = useState<'general' | 'slotTypes'>('general')
  const [editingSlotType, setEditingSlotType] = useState<SlotType | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newSlotType, setNewSlotType] = useState<Partial<SlotType>>({
    label: '',
    description: '',
    icon: 'Clock',
    iconType: 'lucide',
    color: '#6B7FD4',
    parentId: 'timeblock',
    workspaceId: undefined,
  })
  const [customIconInput, setCustomIconInput] = useState('')

  // Common emojis for quick selection
  const COMMON_EMOJIS = ['🎯', '💼', '📝', '🏠', '💡', '🎨', '📚', '🏃', '🍽️', '☕', '💤', '🎮']

  // Find or create lunch break block
  const lunchBlock = localTimeBlocks.find(tb => tb.type === 'break') || {
    id: 'tb-lunch',
    date: '',
    startTime: localSettings.lunchBreak.startTime,
    endTime: localSettings.lunchBreak.endTime,
    type: 'break' as const,
    label: '午休',
    color: localSettings.lunchBreak.color,
    isRecurring: true,
  }

  // Find or create buffer block
  const bufferBlock = localTimeBlocks.find(tb => tb.type === 'buffer') || {
    id: 'tb-buffer',
    date: '',
    startTime: '16:00',
    endTime: '16:30',
    type: 'buffer' as const,
    label: '緩衝時間',
    color: localSettings.bufferTime.color,
    isRecurring: false,
  }

  const handleSave = () => {
    // Update time blocks with new settings
    const updatedBlocks = localTimeBlocks.map(tb => {
      if (tb.type === 'break') {
        return {
          ...tb,
          startTime: localSettings.lunchBreak.startTime,
          endTime: localSettings.lunchBreak.endTime,
          color: localSettings.lunchBreak.color,
        }
      }
      if (tb.type === 'buffer') {
        return {
          ...tb,
          color: localSettings.bufferTime.color,
        }
      }
      return tb
    })

    onSave(localSettings, updatedBlocks)
    onClose()
  }

  // Slot type management
  const handleAddSlotType = () => {
    if (!newSlotType.label) return
    const id = `slot-${Date.now()}`
    const maxSort = Math.max(0, ...localSettings.slotTypes.filter(s => s.parentId === newSlotType.parentId).map(s => s.sortOrder))
    const newType: SlotType = {
      id,
      key: id,
      label: newSlotType.label,
      description: newSlotType.description || '',
      icon: newSlotType.icon || 'Clock',
      iconType: newSlotType.iconType || 'lucide',
      color: newSlotType.color || '#6B7FD4',
      parentId: newSlotType.parentId,
      sortOrder: maxSort + 1,
      isBuiltIn: false,
      workspaceId: newSlotType.workspaceId,
    }
    setLocalSettings(prev => ({
      ...prev,
      slotTypes: [...prev.slotTypes, newType],
    }))
    setNewSlotType({ label: '', description: '', icon: 'Clock', iconType: 'lucide', color: '#6B7FD4', parentId: 'timeblock', workspaceId: undefined })
    setCustomIconInput('')
    setIsAddingNew(false)
  }

  const handleUpdateSlotType = (updated: SlotType) => {
    setLocalSettings(prev => ({
      ...prev,
      slotTypes: prev.slotTypes.map(s => s.id === updated.id ? updated : s),
    }))
    setEditingSlotType(null)
  }

  const handleDeleteSlotType = (id: string) => {
    setLocalSettings(prev => ({
      ...prev,
      slotTypes: prev.slotTypes.filter(s => s.id !== id),
    }))
  }

  // Get slot types organized by parent
  const topLevelTypes = localSettings.slotTypes?.filter(s => !s.parentId) || []
  const getChildTypes = (parentId: string) => localSettings.slotTypes?.filter(s => s.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder) || []

  // Render icon based on type (lucide or emoji/custom)
  const renderSlotIcon = (slotType: SlotType, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
    const textSize = size === 'sm' ? 'text-sm' : 'text-base'
    
    if (slotType.iconType === 'lucide') {
      const IconComp = ICON_MAP[slotType.icon] || Clock
      return <IconComp className={sizeClass} style={{ color: slotType.color }} />
    }
    // emoji or custom text
    return <span className={textSize}>{slotType.icon}</span>
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">設定</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'general'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            一般設定
          </button>
          <button
            onClick={() => setActiveTab('slotTypes')}
            className={cn(
              'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'slotTypes'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            時間區塊類型
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {activeTab === 'general' && (<>
          {/* Calendar Time Range */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4" />
              日曆顯示時間範圍
            </h3>
            <p className="text-xs text-muted-foreground">設定日曆顯示的時間區間</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">開始時間</label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={localSettings.calendarStartHour}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    calendarStartHour: parseInt(e.target.value) || 0
                  }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">結束時間</label>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={localSettings.calendarEndHour}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    calendarEndHour: parseInt(e.target.value) || 24
                  }))}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Default View Mode */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="w-4 h-4" />
              預設視圖模式
            </h3>
            <p className="text-xs text-muted-foreground">開啟日曆時的預設顯示模式</p>
            <div className="flex gap-2">
              {[
                { key: 'day', label: '日' },
                { key: 'week', label: '週' },
                { key: 'month', label: '月' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setLocalSettings(prev => ({
                    ...prev,
                    defaultView: key as 'day' | 'week' | 'month'
                  }))}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    localSettings.defaultView === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Week Start Day */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="w-4 h-4" />
              每週開始日
            </h3>
            <p className="text-xs text-muted-foreground">設定週視圖的第一天</p>
            <div className="flex gap-2">
              {[
                { day: 0, label: '週日' },
                { day: 1, label: '週一' },
              ].map(({ day, label }) => (
                <button
                  key={day}
                  onClick={() => setLocalSettings(prev => ({
                    ...prev,
                    weekStartDay: day
                  }))}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    localSettings.weekStartDay === day
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          </>)}

          {/* Slot Types Tab */}
          {activeTab === 'slotTypes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers className="w-4 h-4" />
                  時間區塊類型管理
                </h3>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsAddingNew(true)}
                  className="h-8 gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增類型
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                自訂日曆上可建立的時間區塊類型，支援分類結構
              </p>

              {/* Add new slot type form */}
              {isAddingNew && (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                  <div className="text-sm font-medium text-foreground">新增類型</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="名稱"
                      value={newSlotType.label || ''}
                      onChange={(e) => setNewSlotType(prev => ({ ...prev, label: e.target.value }))}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder="描述"
                      value={newSlotType.description || ''}
                      onChange={(e) => setNewSlotType(prev => ({ ...prev, description: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">圖示:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setNewSlotType(prev => ({ ...prev, icon: emoji, iconType: 'emoji' }))}
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all',
                            newSlotType.icon === emoji && newSlotType.iconType === 'emoji'
                              ? 'bg-primary/20 ring-2 ring-primary scale-110'
                              : 'bg-secondary hover:bg-secondary/80 hover:scale-105'
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="自訂 emoji 或文字"
                        value={customIconInput}
                        onChange={(e) => {
                          setCustomIconInput(e.target.value)
                          if (e.target.value) {
                            setNewSlotType(prev => ({ ...prev, icon: e.target.value, iconType: 'emoji' }))
                          }
                        }}
                        className="h-8 text-sm flex-1"
                      />
                      <span className="text-[10px] text-muted-foreground">輸入 emoji 或文字作為圖示</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">顏色:</span>
                    <div className="flex gap-1">
                      {PRESET_COLORS.slice(0, 6).map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewSlotType(prev => ({ ...prev, color }))}
                          className={cn(
                            'w-6 h-6 rounded-full border-2 transition-all',
                            newSlotType.color === color ? 'border-foreground scale-110' : 'border-transparent'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <input
                        type="color"
                        value={newSlotType.color || '#6B7FD4'}
                        onChange={(e) => setNewSlotType(prev => ({ ...prev, color: e.target.value }))}
                        className="w-6 h-6 rounded-full cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">關聯工作區 (選填):</span>
                    <p className="text-[10px] text-muted-foreground">若選擇工作區，建立的項目會同步到左側任務欄</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setNewSlotType(prev => ({ ...prev, workspaceId: undefined }))}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                          !newSlotType.workspaceId
                            ? 'bg-secondary ring-1 ring-foreground/20'
                            : 'bg-secondary/50 hover:bg-secondary'
                        )}
                      >
                        無 (純時間區塊)
                      </button>
                      {workspaces.filter(w => !w.isArchived).map((ws) => (
                        <button
                          key={ws.id}
                          onClick={() => setNewSlotType(prev => ({ ...prev, workspaceId: ws.id }))}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                            newSlotType.workspaceId === ws.id
                              ? 'ring-1 ring-foreground/20'
                              : 'hover:opacity-80'
                          )}
                          style={{
                            backgroundColor: newSlotType.workspaceId === ws.id ? ws.color + '30' : ws.color + '15',
                            color: ws.color,
                          }}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setIsAddingNew(false)} className="h-7">
                      取消
                    </Button>
                    <Button size="sm" onClick={handleAddSlotType} className="h-7">
                      新增
                    </Button>
                  </div>
                </div>
              )}

              {/* Slot types list */}
              <div className="space-y-2">
                {topLevelTypes.sort((a, b) => a.sortOrder - b.sortOrder).map((type) => {
                  const children = getChildTypes(type.id)
                  const isEditing = editingSlotType?.id === type.id

                  return (
                    <div key={type.id} className="rounded-lg border border-border overflow-hidden">
                      {/* Parent type row */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: type.color + '20' }}
                        >
                          {renderSlotIcon(type)}
                        </div>
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              value={editingSlotType.label}
                              onChange={(e) => setEditingSlotType(prev => prev ? { ...prev, label: e.target.value } : null)}
                              className="h-7 text-sm flex-1"
                            />
                            <Button size="sm" variant="ghost" onClick={() => setEditingSlotType(null)} className="h-7 px-2">
                              取消
                            </Button>
                            <Button size="sm" onClick={() => handleUpdateSlotType(editingSlotType)} className="h-7 px-2">
                              儲存
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">{type.label}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{type.description}</div>
                            </div>
                            {!type.isBuiltIn && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditingSlotType(type)}
                                  className="p-1.5 rounded hover:bg-secondary transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSlotType(type.id)}
                                  className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              </div>
                            )}
                            {children.length > 0 && (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </>
                        )}
                      </div>

                      {/* Child types */}
                      {children.length > 0 && (
                        <div className="divide-y divide-border">
                          {children.map((child) => {
                            const isChildEditing = editingSlotType?.id === child.id

                            return (
                              <div
                                key={child.id}
                                className="flex items-center gap-2 px-3 py-2 pl-6 bg-card hover:bg-secondary/20 transition-colors"
                              >
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: child.color + '20' }}
                                >
                                  {renderSlotIcon(child, 'sm')}
                                </div>
                                {isChildEditing ? (
                                  <div className="flex-1 flex items-center gap-2">
                                    <Input
                                      value={editingSlotType.label}
                                      onChange={(e) => setEditingSlotType(prev => prev ? { ...prev, label: e.target.value } : null)}
                                      className="h-7 text-sm flex-1"
                                    />
                                    <Button size="sm" variant="ghost" onClick={() => setEditingSlotType(null)} className="h-7 px-2">
                                      取消
                                    </Button>
                                    <Button size="sm" onClick={() => handleUpdateSlotType(editingSlotType)} className="h-7 px-2">
                                      儲存
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-foreground">{child.label}</div>
                                      <div className="text-[10px] text-muted-foreground truncate">{child.description}</div>
                                    </div>
                                    {!child.isBuiltIn && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => setEditingSlotType(child)}
                                          className="p-1.5 rounded hover:bg-secondary transition-colors"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSlotType(child.id)}
                                          className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            儲存
          </Button>
        </div>
      </div>
    </div>
  )
}
