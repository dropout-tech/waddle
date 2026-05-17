'use client'

import { useState, useMemo } from 'react'
import { X, Clock, Coffee, Save, Layers, Plus, Trash2, GripVertical, ChevronRight, CheckSquare, Crosshair, User, Pencil, Bell, AlertTriangle, Calendar, Sparkles, Moon, Eye, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import type { UserSettings, TimeBlock, SlotType, Workspace, NotificationSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getTaskCompleteSoundEnabled,
  setTaskCompleteSoundEnabled,
  playTaskCompleteSound,
} from '@/lib/task-sound'
import {
  getReminderLead,
  setReminderLead,
  ensureNotificationPermission,
  type ReminderLead,
} from '@/lib/meeting-reminder'

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

// Default notification settings
const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  overdue: {
    enabled: true,
    criticalDays: 7,
    showInBell: true,
    dailyDigest: true,
  },
  dueSoon: {
    enabled: true,
    daysBeforeDue: 3,
    notifyOnDueDay: true,
    notifyDayBefore: true,
  },
  staleTasks: {
    enabled: true,
    daysUntilStale: 14,
    includeUnscheduled: true,
    includeNoDueDate: true,
  },
  highPriority: {
    enabled: true,
    minUrgency: 8,
    alertWhenTooMany: true,
    maxBeforeAlert: 5,
  },
  scheduling: {
    enabled: true,
    remindUnscheduled: true,
    percentThreshold: 50,
    dailyPlanningReminder: false,
    planningReminderTime: '08:00',
  },
  workspaceOverrides: {},
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    allowUrgent: true,
  },
  appearance: {
    showBadgeCount: true,
    groupByType: true,
    autoCollapse: false,
    maxVisible: 10,
  },
}

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
  const [activeTab, setActiveTab] = useState<'general' | 'slotTypes' | 'notifications'>('general')
  // Task-complete sound is a per-device pref stored in localStorage (same
  // pattern as timer sound), so it lives outside localSettings/UserSettings.
  const [taskSoundEnabled, setTaskSoundEnabledState] = useState<boolean>(() => getTaskCompleteSoundEnabled())
  // Meeting reminder lead time (5/10/15 mins, or null = off). Per-device.
  const [reminderLead, setReminderLeadState] = useState<ReminderLead>(() => getReminderLead())
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

  // Slot type management.
  //
  // Each add/edit/delete writes through immediately. The previous design
  // only updated localSettings and required the user to click 儲存 at the
  // bottom of the modal — closing without saving silently lost any newly
  // added slot type, which was the source of "I added a custom type and
  // it disappeared after refresh" reports. Now every action persists in
  // the same call so reload always reflects the latest state.
  const persistSlotTypes = (nextSlotTypes: SlotType[]) => {
    const nextSettings = { ...localSettings, slotTypes: nextSlotTypes }
    setLocalSettings(nextSettings)
    onSave(nextSettings, localTimeBlocks)
  }

  const handleAddSlotType = () => {
    if (!newSlotType.label) return
    // DB column is uuid — must be a real UUID, not a Date.now()-derived string.
    const id = crypto.randomUUID()
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
    persistSlotTypes([...localSettings.slotTypes, newType])
    setNewSlotType({ label: '', description: '', icon: 'Clock', iconType: 'lucide', color: '#6B7FD4', parentId: 'timeblock', workspaceId: undefined })
    setCustomIconInput('')
    setIsAddingNew(false)
  }

  const handleUpdateSlotType = (updated: SlotType) => {
    persistSlotTypes(localSettings.slotTypes.map(s => s.id === updated.id ? updated : s))
    setEditingSlotType(null)
  }

  const handleDeleteSlotType = (id: string) => {
    persistSlotTypes(localSettings.slotTypes.filter(s => s.id !== id))
  }

  // Generate workspace-based slot types for display
  const workspaceSlotTypes: SlotType[] = useMemo(() => {
    return workspaces
      .filter(ws => !ws.isArchived)
      .map((ws, index) => ({
        id: `ws-${ws.id}`,
        key: `ws-${ws.id}`,
        label: ws.name,
        description: `新增任務到「${ws.name}」`,
        icon: ws.icon,
        iconType: 'emoji' as const,
        color: ws.color,
        sortOrder: index,
        isBuiltIn: true,
        workspaceId: ws.id,
      }))
  }, [workspaces])

  // Base time block types
  const baseSlotTypes: SlotType[] = useMemo(() => [
    { id: 'timeblock', key: 'timeblock', label: '時間區塊', description: '各類時間安排', icon: 'Layers', iconType: 'lucide' as const, color: '#9CA3AF', sortOrder: workspaceSlotTypes.length, isBuiltIn: true },
    { id: 'break', key: 'break', label: '午休', description: '休息時間', icon: 'Coffee', iconType: 'lucide' as const, color: '#F6A854', parentId: 'timeblock', sortOrder: 0, isBuiltIn: true },
    { id: 'buffer', key: 'buffer', label: '緩衝', description: '彈性緩衝時間', icon: 'Clock', iconType: 'lucide' as const, color: '#9BBFAC', parentId: 'timeblock', sortOrder: 1, isBuiltIn: true },
    { id: 'focus', key: 'focus', label: '專注', description: '專注工作時段', icon: 'Crosshair', iconType: 'lucide' as const, color: '#D46B8A', parentId: 'timeblock', sortOrder: 2, isBuiltIn: true },
  ], [workspaceSlotTypes.length])

  // Combine all slot types for display
  const allSlotTypes = useMemo(() => {
    const customTypes = localSettings.slotTypes?.filter(s => !s.isBuiltIn) || []
    return [...workspaceSlotTypes, ...baseSlotTypes, ...customTypes]
  }, [workspaceSlotTypes, baseSlotTypes, localSettings.slotTypes])

  // Get slot types organized by parent
  const topLevelTypes = allSlotTypes.filter(s => !s.parentId)
  const getChildTypes = (parentId: string) => allSlotTypes.filter(s => s.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)

  // Render icon based on type (lucide or emoji/custom)
  const renderSlotIcon = (slotType: SlotType, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
    const circleSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
    const textSize = size === 'sm' ? 'text-sm' : 'text-base'
    
    if (slotType.iconType === 'lucide') {
      const IconComp = ICON_MAP[slotType.icon] || Clock
      return <IconComp className={sizeClass} style={{ color: slotType.color }} />
    }
    // emoji or custom text - fallback to colored circle if empty
    if (!slotType.icon) {
      return <div className={`${circleSize} rounded-full`} style={{ backgroundColor: slotType.color }} />
    }
    return <span className={textSize}>{slotType.icon}</span>
  }

  useBodyScrollLock(isOpen)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — full-screen sheet on mobile, centered card on desktop */}
      <div className="relative w-full h-[100dvh] flex flex-col bg-card overflow-hidden animate-in fade-in duration-200 md:h-auto md:max-h-[90vh] md:max-w-lg md:mx-4 md:rounded-2xl md:shadow-2xl md:border md:border-border md:zoom-in-95">
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
            onClick={() => setActiveTab('notifications')}
            className={cn(
              'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'notifications'
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            提醒設定
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
            時間區塊
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 flex-1 min-h-0 md:flex-initial md:min-h-[unset] md:max-h-[60vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1.25rem)] md:pb-5">
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

          {/* Visible day count per view — keeps day-mode (1-3) and
              week-mode (5-7) ranges deliberately disjoint so the two
              views always feel like distinct "zoom levels".
              Auto-saves on click (same pattern as slot types) so the
              calendar reflects the change immediately without needing
              the user to find the 儲存 button. */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="w-4 h-4" />
              檢視範圍
            </h3>
            <p className="text-xs text-muted-foreground">控制日視圖與週視圖一次能看到幾天（變更立即生效）</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground">日視圖</div>
                  <div className="text-[10px] text-muted-foreground">適合單日聚焦或近 1-3 天規劃</div>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        const next = { ...localSettings, dayViewDays: n }
                        setLocalSettings(next)
                        onSave(next, localTimeBlocks)
                      }}
                      className={cn(
                        'min-w-[40px] h-8 px-2 rounded-md text-xs font-medium transition-colors',
                        localSettings.dayViewDays === n
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      )}
                    >
                      {n} 天
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-foreground">週視圖</div>
                  <div className="text-[10px] text-muted-foreground">5 天=工作週，7 天=完整週</div>
                </div>
                <div className="flex gap-1">
                  {[5, 6, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        const next = { ...localSettings, weekViewDays: n }
                        setLocalSettings(next)
                        onSave(next, localTimeBlocks)
                      }}
                      className={cn(
                        'min-w-[40px] h-8 px-2 rounded-md text-xs font-medium transition-colors',
                        localSettings.weekViewDays === n
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      )}
                    >
                      {n} 天
                    </button>
                  ))}
                </div>
              </div>
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

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Extended Features */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">延伸功能</h3>
            
            {/* Auto sync workspace tasks */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm text-foreground">自動同步工作區任務</div>
                <div className="text-xs text-muted-foreground">從日曆建立任務時自動同步到左側工作區</div>
              </div>
              <input
                type="checkbox"
                checked={localSettings.lunchBreak?.enabled ?? true}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  lunchBreak: { ...prev.lunchBreak, enabled: e.target.checked }
                }))}
                className="w-4 h-4 rounded border-border accent-primary"
              />
            </label>

            {/* Show completed tasks */}
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm text-foreground">顯示已完成任務</div>
                <div className="text-xs text-muted-foreground">在日曆上顯示已完成的任務</div>
              </div>
              <input
                type="checkbox"
                checked={localSettings.bufferTime?.enabled ?? true}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  bufferTime: { ...prev.bufferTime, enabled: e.target.checked }
                }))}
                className="w-4 h-4 rounded border-border accent-primary"
              />
            </label>

            {/* Task-complete sound */}
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  任務完成音效
                </div>
                <div className="text-xs text-muted-foreground">勾選任務時播放可愛的提示音</div>
              </div>
              <input
                type="checkbox"
                checked={taskSoundEnabled}
                onChange={(e) => {
                  const next = e.target.checked
                  setTaskSoundEnabledState(next)
                  setTaskCompleteSoundEnabled(next)
                  if (next) playTaskCompleteSound()
                }}
                className="w-4 h-4 rounded border-border accent-primary"
              />
            </label>

            {/* Meeting reminder lead time */}
            <div className="space-y-2">
              <div>
                <div className="text-sm text-foreground">會議提醒</div>
                <div className="text-xs text-muted-foreground">
                  在會議開始前透過瀏覽器通知提醒你（需要授權通知權限）
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  [null, '關閉'],
                  [5, '5 分鐘'],
                  [10, '10 分鐘'],
                  [15, '15 分鐘'],
                ] as const).map(([value, label]) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={async () => {
                      if (value !== null) {
                        // Permission request has to live inside the click
                        // handler — browsers gate it on a user gesture.
                        const granted = await ensureNotificationPermission()
                        if (!granted) {
                          alert('通知權限被拒，請在瀏覽器設定中允許 Waddle 顯示通知後再試')
                          return
                        }
                      }
                      setReminderLeadState(value)
                      setReminderLead(value)
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      reminderLead === value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Keep today's completed in list */}
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex-1 pr-4">
                <div className="text-sm text-foreground">保留今日已完成任務</div>
                <div className="text-xs text-muted-foreground">
                  關掉的話，勾選完成後該任務馬上從列表消失（仍可在「已完成」中看到）
                </div>
              </div>
              <input
                type="checkbox"
                checked={localSettings.keepCompletedTodayInList ?? true}
                onChange={(e) =>
                  setLocalSettings(prev => ({ ...prev, keepCompletedTodayInList: e.target.checked }))
                }
                className="w-4 h-4 rounded border-border accent-primary"
              />
            </label>

            {/* Default task duration */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground">預設任務時長</div>
                <div className="text-xs text-muted-foreground">拖曳建立任務時的預設持續時間</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={localSettings.bufferTime?.defaultDuration ?? 30}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    bufferTime: { ...prev.bufferTime, defaultDuration: parseInt(e.target.value) || 30 }
                  }))}
                  className="h-8 w-20 text-center"
                />
                <span className="text-xs text-muted-foreground">分鐘</span>
              </div>
            </div>
          </div>
          </>)}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <NotificationsSettingsTab
              settings={localSettings}
              workspaces={workspaces}
              onUpdate={(notifications) => setLocalSettings(prev => ({ ...prev, notifications }))}
            />
          )}

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
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4">
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

// Notifications Settings Tab Component
function NotificationsSettingsTab({
  settings,
  workspaces,
  onUpdate,
}: {
  settings: UserSettings
  workspaces: Workspace[]
  onUpdate: (notifications: NotificationSettings) => void
}) {
  const notifications = settings.notifications || DEFAULT_NOTIFICATION_SETTINGS
  
  const updateField = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    onUpdate({ ...notifications, [key]: value })
  }

  const updateNestedField = <K extends keyof NotificationSettings>(
    key: K,
    field: string,
    value: unknown
  ) => {
    const current = notifications[key] as Record<string, unknown>
    onUpdate({
      ...notifications,
      [key]: { ...current, [field]: value },
    })
  }

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">啟用任務提醒</div>
            <div className="text-xs text-muted-foreground">接收任務相關的智慧提醒通知</div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={notifications.enabled}
            onChange={(e) => updateField('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>

      {notifications.enabled && (
        <>
          {/* Overdue Tasks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold text-foreground">過期任務提醒</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">啟用過期任務提醒</span>
                <input
                  type="checkbox"
                  checked={notifications.overdue.enabled}
                  onChange={(e) => updateNestedField('overdue', 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.overdue.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">嚴重過期天數</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={notifications.overdue.criticalDays}
                        onChange={(e) => updateNestedField('overdue', 'criticalDays', parseInt(e.target.value) || 7)}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">天</span>
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">顯示在通知鈴鐺</span>
                    <input
                      type="checkbox"
                      checked={notifications.overdue.showInBell}
                      onChange={(e) => updateNestedField('overdue', 'showInBell', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">每日摘要提醒</span>
                    <input
                      type="checkbox"
                      checked={notifications.overdue.dailyDigest}
                      onChange={(e) => updateNestedField('overdue', 'dailyDigest', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Due Soon */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">即將到期提醒</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">啟用即將到期提醒</span>
                <input
                  type="checkbox"
                  checked={notifications.dueSoon.enabled}
                  onChange={(e) => updateNestedField('dueSoon', 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.dueSoon.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">提前提醒天數</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={14}
                        value={notifications.dueSoon.daysBeforeDue}
                        onChange={(e) => updateNestedField('dueSoon', 'daysBeforeDue', parseInt(e.target.value) || 3)}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">天</span>
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">到期當天特別提醒</span>
                    <input
                      type="checkbox"
                      checked={notifications.dueSoon.notifyOnDueDay}
                      onChange={(e) => updateNestedField('dueSoon', 'notifyOnDueDay', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">到期前一天提醒</span>
                    <input
                      type="checkbox"
                      checked={notifications.dueSoon.notifyDayBefore}
                      onChange={(e) => updateNestedField('dueSoon', 'notifyDayBefore', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Stale Tasks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-foreground">閒置任務提醒</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">提醒閒置過久的任務</span>
                <input
                  type="checkbox"
                  checked={notifications.staleTasks.enabled}
                  onChange={(e) => updateNestedField('staleTasks', 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.staleTasks.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">閒置天數門檻</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={7}
                        max={60}
                        value={notifications.staleTasks.daysUntilStale}
                        onChange={(e) => updateNestedField('staleTasks', 'daysUntilStale', parseInt(e.target.value) || 14)}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">天</span>
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">包含未排程任務</span>
                    <input
                      type="checkbox"
                      checked={notifications.staleTasks.includeUnscheduled}
                      onChange={(e) => updateNestedField('staleTasks', 'includeUnscheduled', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">包含無截止日任務</span>
                    <input
                      type="checkbox"
                      checked={notifications.staleTasks.includeNoDueDate}
                      onChange={(e) => updateNestedField('staleTasks', 'includeNoDueDate', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* High Priority */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-semibold text-foreground">高優先任務提醒</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">啟用高優先任務提醒</span>
                <input
                  type="checkbox"
                  checked={notifications.highPriority.enabled}
                  onChange={(e) => updateNestedField('highPriority', 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.highPriority.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">最低優先等級</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={notifications.highPriority.minUrgency}
                        onChange={(e) => updateNestedField('highPriority', 'minUrgency', parseInt(e.target.value) || 8)}
                        className="h-8 w-16 text-center"
                      />
                      <span className="text-xs text-muted-foreground">/ 10</span>
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">高優先任務過多時提醒</span>
                    <input
                      type="checkbox"
                      checked={notifications.highPriority.alertWhenTooMany}
                      onChange={(e) => updateNestedField('highPriority', 'alertWhenTooMany', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                  
                  {notifications.highPriority.alertWhenTooMany && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">超過幾個時提醒</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={3}
                          max={20}
                          value={notifications.highPriority.maxBeforeAlert}
                          onChange={(e) => updateNestedField('highPriority', 'maxBeforeAlert', parseInt(e.target.value) || 5)}
                          className="h-8 w-16 text-center"
                        />
                        <span className="text-xs text-muted-foreground">個</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Scheduling Reminders */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-green-500" />
              <h3 className="text-sm font-semibold text-foreground">排程提醒</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">提醒未排程任務</span>
                <input
                  type="checkbox"
                  checked={notifications.scheduling.remindUnscheduled}
                  onChange={(e) => updateNestedField('scheduling', 'remindUnscheduled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.scheduling.remindUnscheduled && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">未排程比例門檻</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={90}
                      step={10}
                      value={notifications.scheduling.percentThreshold}
                      onChange={(e) => updateNestedField('scheduling', 'percentThreshold', parseInt(e.target.value) || 50)}
                      className="h-8 w-16 text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              )}
              
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">每日規劃提醒</span>
                <input
                  type="checkbox"
                  checked={notifications.scheduling.dailyPlanningReminder}
                  onChange={(e) => updateNestedField('scheduling', 'dailyPlanningReminder', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.scheduling.dailyPlanningReminder && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">提醒時間</span>
                  <Input
                    type="time"
                    value={notifications.scheduling.planningReminderTime}
                    onChange={(e) => updateNestedField('scheduling', 'planningReminderTime', e.target.value)}
                    className="h-8 w-28"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Quiet Hours */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-semibold text-foreground">勿擾時段</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">啟用勿擾時段</span>
                <input
                  type="checkbox"
                  checked={notifications.quietHours.enabled}
                  onChange={(e) => updateNestedField('quietHours', 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              {notifications.quietHours.enabled && (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">時段</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={notifications.quietHours.startTime}
                        onChange={(e) => updateNestedField('quietHours', 'startTime', e.target.value)}
                        className="h-8 w-28"
                      />
                      <span className="text-xs text-muted-foreground">至</span>
                      <Input
                        type="time"
                        value={notifications.quietHours.endTime}
                        onChange={(e) => updateNestedField('quietHours', 'endTime', e.target.value)}
                        className="h-8 w-28"
                      />
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">允許緊急通知</span>
                    <input
                      type="checkbox"
                      checked={notifications.quietHours.allowUrgent}
                      onChange={(e) => updateNestedField('quietHours', 'allowUrgent', e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Workspace Overrides */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-foreground">工作區設定</h3>
            </div>
            <p className="text-xs text-muted-foreground pl-6">為不同工作區設定不同的提醒規則</p>
            
            <div className="space-y-2 pl-6">
              {workspaces.filter(ws => !ws.isArchived).map((workspace) => {
                const override = notifications.workspaceOverrides[workspace.id] || {
                  enabled: true,
                  overduePriority: 'default' as const,
                }
                
                return (
                  <div
                    key={workspace.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: workspace.color }}
                      />
                      <span className="text-sm font-medium">{workspace.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <select
                        value={override.overduePriority}
                        onChange={(e) => {
                          const newOverrides = {
                            ...notifications.workspaceOverrides,
                            [workspace.id]: {
                              ...override,
                              overduePriority: e.target.value as 'high' | 'medium' | 'low' | 'default',
                            },
                          }
                          updateField('workspaceOverrides', newOverrides)
                        }}
                        className="h-7 px-2 text-xs rounded-md bg-background border border-border"
                      >
                        <option value="default">預設</option>
                        <option value="high">高優先</option>
                        <option value="medium">中優先</option>
                        <option value="low">低優先</option>
                      </select>
                      
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={override.enabled}
                          onChange={(e) => {
                            const newOverrides = {
                              ...notifications.workspaceOverrides,
                              [workspace.id]: {
                                ...override,
                                enabled: e.target.checked,
                              },
                            }
                            updateField('workspaceOverrides', newOverrides)
                          }}
                          className="w-4 h-4 rounded border-border accent-primary"
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Appearance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-500" />
              <h3 className="text-sm font-semibold text-foreground">顯示設定</h3>
            </div>
            
            <div className="space-y-3 pl-6">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">顯示通知數量徽章</span>
                <input
                  type="checkbox"
                  checked={notifications.appearance.showBadgeCount}
                  onChange={(e) => updateNestedField('appearance', 'showBadgeCount', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-foreground">按類型分組顯示</span>
                <input
                  type="checkbox"
                  checked={notifications.appearance.groupByType}
                  onChange={(e) => updateNestedField('appearance', 'groupByType', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
              </label>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">最多顯示通知數</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={5}
                    max={50}
                    value={notifications.appearance.maxVisible}
                    onChange={(e) => updateNestedField('appearance', 'maxVisible', parseInt(e.target.value) || 10)}
                    className="h-8 w-16 text-center"
                  />
                  <span className="text-xs text-muted-foreground">個</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
