'use client'

import { useState } from 'react'
import { X, Calendar, Clock, AlertCircle, FileText, Save, Check, Trash2, Palette, FolderTree, ChevronDown, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import { formatEstimatedTime } from '@/lib/task-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const PRESET_COLORS = [
  '#FF6B6B', '#4A90D9', '#66BB6A', '#FFB74D', '#9575CD',
  '#4DD0E1', '#F06292', '#AED581', '#FFD54F', '#90A4AE',
]

interface TaskDetailModalProps {
  task: Task
  workspaces?: Workspace[]
  isOpen: boolean
  onClose: () => void
  onSave: (updates: Partial<Task>, newCategoryId?: string) => void
  onToggleComplete?: (taskId: string) => void
  onDelete?: (taskId: string) => void
}

export function TaskDetailModal({
  task,
  workspaces = [],
  isOpen,
  onClose,
  onSave,
  onToggleComplete,
  onDelete,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [urgency, setUrgency] = useState(task.urgency)
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task.estimatedMinutes?.toString() || ''
  )
  const [dueDate, setDueDate] = useState(task.dueDate || '')
  const [scheduledDate, setScheduledDate] = useState(task.scheduledDate || '')
  const [scheduledStartTime, setScheduledStartTime] = useState(
    task.scheduledStartTime || ''
  )
  const [scheduledEndTime, setScheduledEndTime] = useState(
    task.scheduledEndTime || ''
  )
  const [notes, setNotes] = useState(task.notes || '')
  const [calendarColor, setCalendarColor] = useState(task.calendarColor || task.workspaceColor)
  const [selectedCategoryId, setSelectedCategoryId] = useState(task.categoryId)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  
  // Recurrence settings
  const [isRecurring, setIsRecurring] = useState(task.isRecurring || false)
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>(
    task.recurrence?.type || 'weekly'
  )
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    task.recurrence?.interval?.toString() || '1'
  )
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    task.recurrence?.daysOfWeek || []
  )
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(task.recurrence?.endDate || '')

  // Find current selected category info
  const selectedCategory = workspaces
    .flatMap((w) => w.categories.map((c) => ({ ...c, workspace: w })))
    .find((c) => c.id === selectedCategoryId)

  if (!isOpen) return null

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  const handleSave = () => {
    const updates: Partial<Task> = {
      title,
      description: description || undefined,
      urgency,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
      dueDate: dueDate || undefined,
      scheduledDate: scheduledDate || undefined,
      scheduledStartTime: scheduledStartTime || undefined,
      scheduledEndTime: scheduledEndTime || undefined,
      notes: notes || undefined,
      calendarColor,
      isRecurring,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            interval: parseInt(recurrenceInterval) || 1,
            daysOfWeek: recurrenceType === 'weekly' ? recurrenceDays : undefined,
            endDate: recurrenceEndDate || undefined,
          }
        : undefined,
    }

    // If category changed, include the new category info
    if (selectedCategoryId !== task.categoryId && selectedCategory) {
      updates.categoryId = selectedCategoryId
      updates.workspaceId = selectedCategory.workspace.id
      updates.workspaceName = selectedCategory.workspace.name
      updates.workspaceColor = selectedCategory.workspace.color
      updates.categoryName = selectedCategory.name
      if (!calendarColor || calendarColor === task.workspaceColor) {
        updates.calendarColor = selectedCategory.workspace.color
      }
    }

    onSave(updates, selectedCategoryId !== task.categoryId ? selectedCategoryId : undefined)
    onClose()
  }

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
          <div className="flex items-center gap-3">
            {/* Completion Checkbox */}
            <button
              onClick={() => onToggleComplete?.(task.id)}
              className={cn(
                'flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110',
                task.isCompleted
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground/40 hover:border-primary'
              )}
              title={task.isCompleted ? '標記為未完成' : '標記為完成'}
            >
              {task.isCompleted && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </button>
            {/* Category Selector */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedCategory?.workspace.color || task.workspaceColor }}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedCategory?.workspace.name || task.workspaceName} / {selectedCategory?.name || task.categoryName}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>

              {/* Category Dropdown */}
              {showCategoryPicker && workspaces.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-card rounded-xl border border-border shadow-xl z-50 py-2 max-h-64 overflow-y-auto">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: workspace.color }}
                        />
                        {workspace.name}
                      </div>
                      {workspace.categories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => {
                            setSelectedCategoryId(category.id)
                            setShowCategoryPicker(false)
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2',
                            selectedCategoryId === category.id && 'bg-primary/10 text-primary'
                          )}
                        >
                          <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
                          {category.name}
                          {selectedCategoryId === category.id && (
                            <Check className="w-3.5 h-3.5 ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                onClick={() => {
                  onDelete(task.id)
                  onClose()
                }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="刪除任務"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任務名稱"
              className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 bg-transparent"
            />
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Urgency */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5" />
                急迫度
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                  <button
                    key={level}
                    onClick={() => setUrgency(level)}
                    className={cn(
                      'w-6 h-6 rounded text-xs font-medium transition-all',
                      urgency === level
                        ? level <= 3
                          ? 'bg-emerald-500 text-white'
                          : level <= 6
                          ? 'bg-amber-500 text-white'
                          : 'bg-red-500 text-white'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Estimated Time */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                預估時間 (分鐘)
              </label>
              <Input
                type="number"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="60"
                className="h-9"
              />
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                截止日期
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Scheduled Date */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                排程日期
              </label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                開始時間
              </label>
              <Input
                type="time"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
                className="h-9 font-mono"
              />
            </div>

            {/* End Time */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                結束時間
              </label>
              <Input
                type="time"
                value={scheduledEndTime}
                onChange={(e) => setScheduledEndTime(e.target.value)}
                className="h-9 font-mono"
              />
            </div>
          </div>

          {/* Calendar Color */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Palette className="w-3.5 h-3.5" />
              日曆顏色
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setCalendarColor(color)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all',
                    calendarColor === color
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={calendarColor}
                onChange={(e) => setCalendarColor(e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer"
                title="自訂顏色"
              />
            </div>
          </div>

          {/* Recurrence Settings */}
          <div className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Repeat className="w-3.5 h-3.5" />
                重複設定
              </label>
              <button
                onClick={() => setIsRecurring(!isRecurring)}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors',
                  isRecurring ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    isRecurring ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {isRecurring && (
              <div className="space-y-4 pt-2">
                {/* Recurrence Type */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'daily', label: '每天' },
                    { value: 'weekly', label: '每週' },
                    { value: 'monthly', label: '每月' },
                    { value: 'custom', label: '自訂' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRecurrenceType(option.value as typeof recurrenceType)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        recurrenceType === option.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {/* Interval (for custom) */}
                {recurrenceType === 'custom' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">每</span>
                    <Input
                      type="number"
                      min="1"
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(e.target.value)}
                      className="w-16 h-8 text-center"
                    />
                    <span className="text-xs text-muted-foreground">天重複一次</span>
                  </div>
                )}

                {/* Days of Week (for weekly) */}
                {recurrenceType === 'weekly' && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">選擇重複的星期</span>
                    <div className="flex gap-1.5">
                      {WEEKDAY_LABELS.map((label, index) => (
                        <button
                          key={index}
                          onClick={() => toggleRecurrenceDay(index)}
                          className={cn(
                            'w-8 h-8 rounded-full text-xs font-medium transition-all',
                            recurrenceDays.includes(index)
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End Date */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">結束日期 (可選)</label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="添加任務描述..."
              className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-input bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              備註
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="添加備註..."
              className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-input bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
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
