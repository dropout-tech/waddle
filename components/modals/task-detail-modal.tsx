'use client'

import { useState, useRef, useMemo } from 'react'
import { X, Calendar, Clock, AlertCircle, FileText, Save, Check, Trash2, Palette, FolderTree, ChevronDown, Repeat, List, CheckSquare, ListChecks, Link2, Users, MapPin, Video } from 'lucide-react'
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from '@/lib/meeting-utils'
import { cn } from '@/lib/utils'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import type { Task, Workspace } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderNotesWithLinks } from '@/lib/notes-render'
import { toDateString } from '@/lib/calendar-utils'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const PRESET_COLORS = [
  '#FF6B6B', '#4A90D9', '#66BB6A', '#FFB74D', '#9575CD',
  '#4DD0E1', '#F06292', '#AED581', '#FFD54F', '#90A4AE',
]

interface TaskDetailModalProps {
  task: Task
  workspaces?: Workspace[]
  isOpen: boolean
  /** 'edit' (default) edits an existing task; 'create' uses task as a draft and saves as a new task. */
  mode?: 'edit' | 'create'
  onClose: () => void
  onSave: (updates: Partial<Task>, newCategoryId?: string) => void
  onToggleComplete?: (taskId: string) => void
  onDelete?: (taskId: string) => void
}

export function TaskDetailModal({
  task,
  workspaces = [],
  isOpen,
  mode = 'edit',
  onClose,
  onSave,
  onToggleComplete,
  onDelete,
}: TaskDetailModalProps) {
  const isCreate = mode === 'create'
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

  // 加入左側任務欄 — undefined ≡ true (legacy tasks default to visible).
  const [showInTaskList, setShowInTaskList] = useState(task.showInTaskList !== false)

  // Meeting metadata (migration 0008). The toggle drives whether the
  // attendee / location / URL inputs are shown; saving with isMeeting=false
  // also clears the three text fields so a former-meeting task doesn't
  // carry a ghost of its metadata around.
  const [isMeeting, setIsMeeting] = useState<boolean>(task.isMeeting === true)
  const [attendees, setAttendees] = useState(task.attendees || '')
  const [location, setLocation] = useState(task.location || '')
  const [meetingUrl, setMeetingUrl] = useState(task.meetingUrl || '')

  // Find current selected category info
  const selectedCategory = workspaces
    .flatMap((w) => w.categories.map((c) => ({ ...c, workspace: w })))
    .find((c) => c.id === selectedCategoryId)

  useBodyScrollLock(isOpen)

  if (!isOpen) return null

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  const handleSave = () => {
    // Send `''` (not `undefined`) for cleared fields so taskToRow writes
    // DB NULL — otherwise the mapper drops the key and the old value
    // sticks around. Same goes for meeting fields when isMeeting is off.
    const updates: Partial<Task> = {
      title,
      description: description || '',
      urgency,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
      dueDate: dueDate || '',
      scheduledDate: scheduledDate || '',
      scheduledStartTime: scheduledStartTime || '',
      scheduledEndTime: scheduledEndTime || '',
      notes: notes || '',
      calendarColor,
      // A task with no schedule must show in the list — otherwise it would
      // be invisible everywhere. Force-true in that case.
      showInTaskList: scheduledDate ? showInTaskList : true,
      isMeeting,
      attendees: isMeeting ? (attendees || '') : '',
      location: isMeeting ? (location || '') : '',
      meetingUrl: isMeeting ? (meetingUrl || '') : '',
      isRecurring,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            interval: parseInt(recurrenceInterval) || 1,
            daysOfWeek: recurrenceType === 'weekly' ? recurrenceDays : undefined,
            endDate: recurrenceEndDate || '',
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
          <div className="flex items-center gap-3">
            {/* Completion Checkbox (edit mode only) */}
            {!isCreate && (
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
            )}
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

              {/* Category Dropdown — desktop: 16rem popover anchored to
                  the trigger; mobile: full-width sheet with side margins
                  so it never overflows on narrow phones (320 px screens
                  ran 64 px past the right edge before this). */}
              {showCategoryPicker && workspaces.length > 0 && (
                <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+72px)] max-h-[60vh] md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-64 md:max-h-64 bg-card rounded-xl border border-border shadow-xl z-[60] py-2 overflow-y-auto">
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
            {!isCreate && onDelete && (
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
        <div className="p-5 space-y-5 flex-1 min-h-0 md:flex-initial md:min-h-[unset] md:max-h-[60vh] overflow-y-auto">
          {/* Title */}
          <div>
            <Input
              autoFocus={isCreate}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isCreate ? '輸入任務標題…' : '任務名稱'}
              className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 bg-transparent"
            />
          </div>

          {/* Urgency — visual slider with color-coded level */}
          <UrgencySlider value={urgency} onChange={setUrgency} />

          {/* Time block: scheduled date + start/end + duration + quick presets */}
          <TimeBlockSection
            scheduledDate={scheduledDate}
            startTime={scheduledStartTime}
            endTime={scheduledEndTime}
            onScheduledDateChange={setScheduledDate}
            onStartTimeChange={setScheduledStartTime}
            onEndTimeChange={setScheduledEndTime}
          />

          {/* List visibility toggle — uncheck for recurring meetings the user
              wants on the calendar but not in the left task list. Only
              meaningful for scheduled tasks; unscheduled ones must show in
              the list or they'd be invisible everywhere. */}
          {(() => {
            const canToggle = !!scheduledDate
            const effective = canToggle ? showInTaskList : true
            return (
              <button
                type="button"
                onClick={() => canToggle && setShowInTaskList(!showInTaskList)}
                aria-pressed={effective}
                aria-disabled={!canToggle}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-secondary/30 border border-border transition-colors text-left',
                  canToggle ? 'hover:bg-secondary/50' : 'opacity-60 cursor-not-allowed'
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <ListChecks className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">加入左側任務欄</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {canToggle
                        ? '關閉後此任務僅顯示在日曆上，例如例行會議'
                        : '需先排程才能僅顯示在日曆'}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                    effective ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                      effective ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </span>
              </button>
            )
          })()}

          {/* Secondary metadata grid */}
          <div className="grid grid-cols-2 gap-4">
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
                onClick={() => {
                  const next = !isRecurring
                  setIsRecurring(next)
                  // Recurring tasks would otherwise spawn unbounded copies in
                  // the left task panel. Auto-hide on enable so the calendar
                  // stays the source of truth for repeats; user can still
                  // re-enable the toggle below if they prefer it visible.
                  if (next) setShowInTaskList(false)
                }}
                aria-pressed={isRecurring}
                className={cn(
                  'relative w-10 h-5 flex-shrink-0 rounded-full transition-colors',
                  isRecurring ? 'bg-primary' : 'bg-muted'
                )}
                style={{ padding: 0, appearance: 'none' as const }}
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

          {/* Meeting toggle + fields. Placed above Description because it
              changes what kind of task this is — a higher-level switch — and
              the related fields read better grouped at the top than buried
              with the body text. */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsMeeting((v) => !v)}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all',
                isMeeting
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:bg-muted/40',
              )}
              aria-pressed={isMeeting}
            >
              <div className="flex items-center gap-2">
                <Users className={cn('w-4 h-4', isMeeting ? 'text-primary' : 'text-muted-foreground')} />
                <div className="text-left">
                  <div className="text-sm font-medium text-foreground">標記為會議</div>
                  <div className="text-[10px] text-muted-foreground">
                    在日曆上顯示專屬樣式，可記錄參與者 / 地點 / 視訊連結
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
                  isMeeting ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-background transition-transform',
                    isMeeting ? 'translate-x-[18px]' : 'translate-x-0.5',
                  )}
                />
              </div>
            </button>

            {isMeeting && (
              <div className="space-y-2.5 pl-1 pr-1 pt-1">
                {/* Attendees */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Users className="w-3 h-3" />
                    參與者
                  </label>
                  <Input
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    placeholder="例：Alice、Bob、團隊全員"
                    className="h-9"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    地點
                  </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="例：會議室 A / 線上"
                    className="h-9"
                  />
                </div>

                {/* Meeting URL */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Video className="w-3 h-3" />
                    視訊連結
                  </label>
                  <Input
                    type="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    className="h-9"
                  />
                  {(() => {
                    const provider = detectMeetingProvider(meetingUrl)
                    if (!provider) return null
                    return (
                      <div className="text-[10px] text-muted-foreground">
                        已偵測：{MEETING_PROVIDER_LABEL[provider]}
                      </div>
                    )
                  })()}
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

          {/* Notes — supports bullet/checklist via toolbar */}
          <NotesEditor value={notes} onChange={setNotes} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            {isCreate ? '建立任務' : '儲存'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Urgency: 1-10 with a colored slider track + emphasized current-level chip.
// Buckets map to Waddle urgency tokens (warm OKLCH; sage -> warm orange ->
// terracotta). No pure red, even at level 10.
// ────────────────────────────────────────────────────────────────────────────

const URGENCY_BUCKETS = [
  // chipText is the foreground color when a number sits on top of `color`.
  // Light urgency tokens (sage / yellow-green) fail WCAG with pure white,
  // so low/medium chips read against the warm charcoal foreground instead.
  { label: '低', range: [1, 3], color: 'bg-urgency-low', text: 'text-urgency-low', chipText: 'text-foreground', ring: 'ring-urgency-low/50' },
  { label: '中', range: [4, 5], color: 'bg-urgency-medium', text: 'text-urgency-medium', chipText: 'text-foreground', ring: 'ring-urgency-medium/50' },
  { label: '高', range: [6, 8], color: 'bg-urgency-high', text: 'text-urgency-high', chipText: 'text-white', ring: 'ring-urgency-high/50' },
  { label: '緊急', range: [9, 10], color: 'bg-urgency-critical', text: 'text-urgency-critical', chipText: 'text-white', ring: 'ring-urgency-critical/50' },
] as const

function urgencyBucket(level: number) {
  return URGENCY_BUCKETS.find((b) => level >= b.range[0] && level <= b.range[1]) ?? URGENCY_BUCKETS[1]
}

interface UrgencySliderProps {
  value: number
  onChange: (v: number) => void
}

function UrgencySlider({ value, onChange }: UrgencySliderProps) {
  const bucket = urgencyBucket(value)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          急迫度
        </label>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium', bucket.text)}>{bucket.label}</span>
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-semibold shadow-sm',
              bucket.color,
              bucket.chipText,
            )}
          >
            {value}
          </span>
        </div>
      </div>

      {/* Visual track with 10 segments. Click a segment to set; segments
          before the current value are filled with their bucket color, the
          rest are dim. */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => {
          const lb = urgencyBucket(level)
          const filled = level <= value
          return (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              aria-label={`設為急迫度 ${level}`}
              aria-pressed={value === level}
              className={cn(
                'group relative flex-1 h-6 rounded-md transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                filled ? cn(lb.color, 'opacity-90 hover:opacity-100') : 'bg-secondary hover:bg-secondary/80'
              )}
            >
              <span className={cn(
                'absolute inset-0 flex items-center justify-center text-[10px] font-semibold transition-opacity',
                filled ? 'text-white opacity-90' : 'text-muted-foreground opacity-50 md:opacity-0 md:group-hover:opacity-100'
              )}>
                {level}
              </span>
            </button>
          )
        })}
      </div>

      {/* Bucket labels */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 px-0.5">
        <span>低</span>
        <span>中</span>
        <span>高</span>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// TimeBlockSection: scheduled date + start/end time + duration display +
// quick-duration chips. The chips set the end time relative to the start.
// ────────────────────────────────────────────────────────────────────────────

const QUICK_DURATIONS_MIN = [15, 30, 60, 90, 120] as const

function parseTime(t: string): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function formatTimeFromMinutes(total: number): string {
  const h = Math.max(0, Math.min(23, Math.floor(total / 60)))
  const m = Math.max(0, Math.min(59, total % 60))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDuration(min: number): string {
  if (min <= 0) return '0 分'
  if (min < 60) return `${min} 分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
}

interface TimeBlockSectionProps {
  scheduledDate: string
  startTime: string
  endTime: string
  onScheduledDateChange: (v: string) => void
  onStartTimeChange: (v: string) => void
  onEndTimeChange: (v: string) => void
}

function TimeBlockSection({
  scheduledDate,
  startTime,
  endTime,
  onScheduledDateChange,
  onStartTimeChange,
  onEndTimeChange,
}: TimeBlockSectionProps) {
  const startMin = parseTime(startTime)
  const endMin = parseTime(endTime)
  const duration = useMemo(() => {
    if (startMin === null || endMin === null) return null
    return endMin - startMin
  }, [startMin, endMin])

  const setEndFromDuration = (minutes: number) => {
    if (startMin === null) return
    const newEnd = Math.min(24 * 60 - 1, startMin + minutes)
    onEndTimeChange(formatTimeFromMinutes(newEnd))
  }

  const adjustEnd = (deltaMin: number) => {
    const base = endMin ?? (startMin !== null ? startMin + 60 : 9 * 60)
    const next = Math.max(0, Math.min(24 * 60 - 1, base + deltaMin))
    onEndTimeChange(formatTimeFromMinutes(next))
  }

  // Has any schedule info → user can wipe everything in one click and send
  // the task back to the unscheduled bucket in the left panel.
  const hasSchedule = !!scheduledDate || !!startTime || !!endTime
  const handleClearAll = () => {
    onScheduledDateChange('')
    onStartTimeChange('')
    onEndTimeChange('')
  }

  // Quick-date helpers — most tasks land on today, tomorrow, or "next Mon".
  // Native date picker is still available for anything farther out.
  const todayStr = toDateString(new Date())
  const tomorrowStr = toDateString(new Date(Date.now() + 86400000))
  const quickDates: { label: string; value: string }[] = [
    { label: '今天', value: todayStr },
    { label: '明天', value: tomorrowStr },
  ]

  return (
    <div className="space-y-4 p-4 rounded-xl bg-secondary/30 border border-border">
      {/* Header: section title + clear shortcut */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          排程
        </label>
        {hasSchedule && (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="清空日期與時段，任務移回左側待排程"
          >
            <X className="w-3 h-3" />
            取消排程
          </button>
        )}
      </div>

      {/* Date row: quick chips + native picker side-by-side */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          {quickDates.map(d => {
            const active = scheduledDate === d.value
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => onScheduledDateChange(active ? '' : d.value)}
                aria-pressed={active}
                className={cn(
                  'px-2.5 h-8 rounded-lg text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border hover:bg-secondary'
                )}
              >
                {d.label}
              </button>
            )
          })}
          <Input
            type="date"
            value={scheduledDate}
            onChange={(e) => onScheduledDateChange(e.target.value)}
            className="h-8 flex-1 text-xs"
            aria-label="排程日期"
          />
        </div>
      </div>

      {/* Time row: start → end with inline ± stepper on end */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            時段
          </label>
          {duration !== null && (
            <span
              className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full tabular-nums',
                duration <= 0
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {duration <= 0 ? '結束需晚於開始' : formatDuration(duration)}
            </span>
          )}
        </div>

        {/* Start / End inputs — end has integrated ±15 stepper */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input
            type="time"
            value={startTime}
            onChange={(e) => {
              const v = e.target.value
              onStartTimeChange(v)
              const newStart = parseTime(v)
              if (newStart !== null && endMin !== null && duration && duration > 0) {
                onEndTimeChange(formatTimeFromMinutes(Math.min(24 * 60 - 1, newStart + duration)))
              }
            }}
            className="h-9 font-mono text-center"
            aria-label="開始時間"
          />
          <span className="text-muted-foreground text-sm" aria-hidden="true">→</span>
          <div className="relative">
            <Input
              type="time"
              value={endTime}
              onChange={(e) => onEndTimeChange(e.target.value)}
              className="h-9 font-mono text-center pr-12"
              aria-label="結束時間"
            />
            {/* End-time stepper — placed where the right edge of the input
                would otherwise sit, so adjustments feel attached to the
                field they modify rather than buried in a chips row. */}
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => adjustEnd(-15)}
                aria-label="結束時間 -15 分鐘"
                className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => adjustEnd(15)}
                aria-label="結束時間 +15 分鐘"
                className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Quick duration chips — snap end = start + N. No leading label;
            the chips are self-explanatory next to the time inputs above. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK_DURATIONS_MIN.map((m) => {
            const active = duration === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setEndFromDuration(m)}
                disabled={startMin === null}
                aria-pressed={active}
                className={cn(
                  'px-2.5 h-7 rounded-md text-[11px] font-medium transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card'
                )}
              >
                {formatDuration(m)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// NotesEditor: textarea with bullet/checklist toolbar, auto-continue on Enter,
// and click-to-toggle ☐ ↔ ☑.
// ────────────────────────────────────────────────────────────────────────────

interface NotesEditorProps {
  value: string
  onChange: (v: string) => void
}

function NotesEditor({ value, onChange }: NotesEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const insertLink = () => {
    const ta = ref.current
    if (!ta) return
    const v = ta.value
    const start = ta.selectionStart ?? v.length
    const end = ta.selectionEnd ?? v.length
    const selected = v.slice(start, end)

    const url = window.prompt('輸入網址（例如 https://example.com）', selected.startsWith('http') ? selected : 'https://')
    if (!url) return

    const text = selected || window.prompt('連結要顯示的文字（留空則顯示網址）', '') || url
    // Markdown-style link — kept verbatim in storage; rendered as <a> in
    // display contexts (TaskRow notes preview/tooltip, task-detail rendered
    // preview if added later).
    const insertion = `[${text}](${url})`
    const next = v.slice(0, start) + insertion + v.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      const cursorAt = start + insertion.length
      ta.setSelectionRange(cursorAt, cursorAt)
    })
  }

  const insertLinePrefix = (prefix: string) => {
    const ta = ref.current
    if (!ta) return
    const v = ta.value
    const start = ta.selectionStart ?? v.length
    const lineStart = v.lastIndexOf('\n', start - 1) + 1
    const before = v.slice(0, lineStart)
    const after = v.slice(lineStart)
    let next: string
    let cursor: number
    if (after.startsWith(prefix)) {
      next = before + after.slice(prefix.length)
      cursor = start - prefix.length
    } else {
      const stripped = after.replace(/^(• |☐ |☑ )/, '')
      const removed = after.length - stripped.length
      next = before + prefix + stripped
      cursor = start + prefix.length - removed
    }
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          備註
        </label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => insertLinePrefix('• ')}
            title="加項目符號"
            aria-label="加項目符號"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <List className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix('☐ ')}
            title="加待辦項目"
            aria-label="加待辦項目"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={insertLink}
            title="插入超連結"
            aria-label="插入超連結"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            const ta = e.currentTarget
            const pos = ta.selectionStart ?? 0
            const v = ta.value
            const lineStart = v.lastIndexOf('\n', pos - 1) + 1
            const currentLine = v.slice(lineStart, pos)
            const m = currentLine.match(/^(• |☐ |☑ )/)
            if (m) {
              if (currentLine === m[1]) {
                e.preventDefault()
                const next = v.slice(0, lineStart) + v.slice(pos)
                onChange(next)
                requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart))
              } else {
                e.preventDefault()
                const insert = '\n' + m[1]
                const next = v.slice(0, pos) + insert + v.slice(pos)
                onChange(next)
                const newPos = pos + insert.length
                requestAnimationFrame(() => ta.setSelectionRange(newPos, newPos))
              }
            }
          }
        }}
        onClick={(e) => {
          const ta = e.currentTarget
          const pos = ta.selectionStart ?? 0
          const v = ta.value
          const lineStart = v.lastIndexOf('\n', pos - 1) + 1
          const before = v.slice(0, lineStart)
          const after = v.slice(lineStart)
          const offsetInLine = pos - lineStart
          if (offsetInLine === 0 || offsetInLine === 1) {
            if (after.startsWith('☐ ')) onChange(before + '☑ ' + after.slice(2))
            else if (after.startsWith('☑ ')) onChange(before + '☐ ' + after.slice(2))
          }
        }}
        placeholder={'寫下細節 · 子彈或待辦清單\n例如：\n• 確認流程\n☐ 寄信給客戶\n☐ 整理會議紀錄'}
        className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-input bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed"
      />
      {/* Live preview — only shown when notes contain a link, so the user
          can click to verify the URL without leaving the modal. */}
      {/\[[^\]]+\]\([^)]+\)|https?:\/\//.test(value) && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-border bg-card text-xs leading-relaxed whitespace-pre-wrap break-words">
          <div className="text-[10px] text-muted-foreground mb-1">預覽</div>
          {renderNotesWithLinks(value)}
        </div>
      )}
    </div>
  )
}
