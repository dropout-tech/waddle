'use client'

import { useState, useRef, useMemo, type ReactNode } from 'react'
import { X, Calendar, Clock, AlertCircle, FileText, Save, Check, Trash2, Palette, FolderTree, ChevronDown, Repeat, List, CheckSquare, ListChecks, Link2, Users, MapPin, Video, ImagePlus, Loader2 } from 'lucide-react'
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from '@/lib/meeting-utils'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField, TimeField } from '@/components/ui/date-time-field'
import { renderNotesWithLinks } from '@/lib/notes-render'
import { toDateString } from '@/lib/calendar-utils'
import { RecurrenceChoiceModal, type RecurrenceChoice } from './recurrence-choice-modal'
import { ModalShell } from './modal-shell'
import { PICKER_COLOR_HEXES } from '@/lib/palette'
import { useI18n } from '@/lib/i18n/react'
import { getLang, t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// Weekday letters for the recurrence day-picker. Kept lang-aware directly
// (not routed through t()) because a single Chinese character like '日'
// would collide in the shared dictionary with unrelated one-character UI
// labels elsewhere (e.g. the "Day" view-mode button in settings-modal).
const WEEKDAY_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAY_LABELS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
function weekdayLabels() {
  return getLang() === 'en' ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_ZH
}

const PRESET_COLORS = PICKER_COLOR_HEXES
const MAX_TASK_NOTE_IMAGE_BYTES = 5 * 1024 * 1024
const TASK_NOTE_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

async function uploadTaskNoteImage(file: File): Promise<string> {
  const extension = TASK_NOTE_IMAGE_EXTENSIONS[file.type]
  if (!extension) throw new Error(t('只能插入 PNG、JPG、GIF 或 WebP 圖片'))
  if (file.size > MAX_TASK_NOTE_IMAGE_BYTES) throw new Error(t('圖片太大，上限 5MB'))

  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error(t('尚未登入'))

  const path = `${user.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from('notebook-images')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
    })
  if (error) throw error

  return supabase.storage.from('notebook-images').getPublicUrl(path).data.publicUrl
}

interface TaskDetailModalProps {
  task: Task
  workspaces?: Workspace[]
  isOpen: boolean
  /** The specific date of the occurrence being edited, if opened from calendar. */
  occurrenceDate?: string
  /** 'edit' (default) edits an existing task; 'create' uses task as a draft and saves as a new task. */
  mode?: 'edit' | 'create'
  onClose: () => void
  onSave: (updates: Partial<Task>, newCategoryId?: string, recurrenceChoice?: import('./recurrence-choice-modal').RecurrenceChoice, targetDate?: string) => void
  onToggleComplete?: (taskId: string) => void
  onDelete?: (taskId: string, targetDate?: string, recurrenceChoice?: import('./recurrence-choice-modal').RecurrenceChoice) => void
}

export function TaskDetailModal({
  task,
  workspaces = [],
  isOpen,
  occurrenceDate,
  mode = 'edit',
  onClose,
  onSave,
  onToggleComplete,
  onDelete,
}: TaskDetailModalProps) {
  const { t } = useI18n()
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

  const [recurrenceModal, setRecurrenceModal] = useState<{
    isOpen: boolean
    type: 'save' | 'delete'
  } | null>(null)

  // Find current selected category info
  const selectedCategory = workspaces
    .flatMap((w) => w.categories.map((c) => ({ ...c, workspace: w })))
    .find((c) => c.id === selectedCategoryId)

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    )
  }

  const handleSave = () => {
    if (!isCreate && task.isRecurring) {
      setRecurrenceModal({ isOpen: true, type: 'save' })
      return
    }
    commitSave()
  }

  const commitSave = (choice?: RecurrenceChoice) => {
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

    onSave(updates, selectedCategoryId !== task.categoryId ? selectedCategoryId : undefined, choice, occurrenceDate)
    onClose()
  }

  const handleRecurrenceConfirm = (choice: RecurrenceChoice) => {
    if (!recurrenceModal) return
    if (recurrenceModal.type === 'save') {
      commitSave(choice)
    } else {
      onDelete?.(task.id, occurrenceDate, choice)
      onClose()
    }
    setRecurrenceModal(null)
  }

  return (
    <>
      {recurrenceModal && (
        <RecurrenceChoiceModal
          isOpen={recurrenceModal.isOpen}
          onClose={() => setRecurrenceModal(null)}
          onConfirm={handleRecurrenceConfirm}
          title={recurrenceModal.type === 'save' ? t('儲存重複任務') : t('刪除重複任務')}
        />
      )}
      {/* Drawer, not centered modal: editing isn't a decision, and sliding
          in from the right keeps the calendar visible alongside the form
          (DESIGN.md anti-pattern: 中央 modal 用於非必要決策). The nested
          RecurrenceChoiceModal above stays centered — that one IS a
          decision. Mobile keeps the full-screen sheet. */}
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        variant="drawer"
        ariaLabel={isCreate ? t('新增任務') : t('任務詳情')}
      >
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
                title={task.isCompleted ? t('標記為未完成') : t('標記為完成')}
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
                <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+72px)] max-h-[60vh] md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-64 md:max-h-64 bg-card rounded-xl border border-border shadow-xl z-popover py-2 overflow-y-auto">
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
                  if (task.isRecurring) {
                    setRecurrenceModal({ isOpen: true, type: 'delete' })
                  } else {
                    onDelete(task.id)
                    onClose()
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={t('刪除任務')}
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

        {/* Content — fills the full drawer height on desktop (the old
            centered modal capped this at 60vh); footer stays pinned below. */}
        <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Title */}
          <div>
            <Input
              autoFocus={isCreate}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isCreate ? t('輸入任務標題…') : t('任務名稱')}
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
            estimatedMinutes={estimatedMinutes}
            dueDate={dueDate}
            onScheduledDateChange={setScheduledDate}
            onStartTimeChange={setScheduledStartTime}
            onEndTimeChange={setScheduledEndTime}
            onEstimatedMinutesChange={setEstimatedMinutes}
            onDueDateChange={setDueDate}
          >
            <RecurrenceSettings
              isRecurring={isRecurring}
              recurrenceType={recurrenceType}
              recurrenceInterval={recurrenceInterval}
              recurrenceDays={recurrenceDays}
              recurrenceEndDate={recurrenceEndDate}
              onRecurringChange={(next) => {
                setIsRecurring(next)
                // Recurring tasks would otherwise spawn unbounded copies in
                // the left task panel. Auto-hide on enable so the calendar
                // stays the source of truth for repeats; users can re-enable
                // the task-list toggle below when they want that behavior.
                if (next) setShowInTaskList(false)
              }}
              onRecurrenceTypeChange={setRecurrenceType}
              onRecurrenceIntervalChange={setRecurrenceInterval}
              onToggleRecurrenceDay={toggleRecurrenceDay}
              onRecurrenceEndDateChange={setRecurrenceEndDate}
            />
          </TimeBlockSection>

          {/* Task content follows scheduling in the main reading flow. */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              {t('描述')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('添加任務描述...')}
              className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-input bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <NotesEditor value={notes} onChange={setNotes} />

          {/* Bottom behavior controls start with meeting metadata. */}
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
                  <div className="text-sm font-medium text-foreground">{t('標記為會議')}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('在日曆上顯示專屬樣式，可記錄參與者 / 地點 / 視訊連結')}
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
                    {t('參與者')}
                  </label>
                  <Input
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    placeholder={t('例：Alice、Bob、團隊全員')}
                    className="h-9"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {t('地點')}
                  </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('例：會議室 A / 線上')}
                    className="h-9"
                  />
                </div>

                {/* Meeting URL */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Video className="w-3 h-3" />
                    {t('視訊連結')}
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
                        {t('已偵測：{provider}', { provider: provider === 'generic' ? t(MEETING_PROVIDER_LABEL[provider]) : MEETING_PROVIDER_LABEL[provider] })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* List visibility follows the meeting control. It is only
              meaningful for scheduled tasks; unscheduled tasks must remain
              visible somewhere. Scheduled meetings are calendar-only. */}
          {(() => {
            const forcedOffByMeeting = isMeeting && !!scheduledDate
            const canToggle = !!scheduledDate && !forcedOffByMeeting
            const effective = forcedOffByMeeting ? false : canToggle ? showInTaskList : true
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
                    <div className="text-sm font-medium text-foreground">{t('加入左側任務欄')}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {forcedOffByMeeting
                        ? t('會議僅顯示在日曆上，不會出現在左側任務欄')
                        : canToggle
                          ? t('關閉後此任務僅顯示在日曆上，例如例行會議')
                          : t('需先排程才能僅顯示在日曆')}
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

          {/* Calendar color is the final, always-visible visual setting. */}
          <div className="space-y-2 border-t border-border pt-5">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Palette className="w-3.5 h-3.5" />
              {t('日曆顏色')}
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCalendarColor(color)}
                  aria-label={t('選擇日曆顏色')}
                  aria-pressed={calendarColor === color}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all',
                    calendarColor === color
                      ? 'ring-2 ring-offset-2 ring-ring scale-110'
                      : 'hover:scale-110'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label
                className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-dashed border-muted-foreground/40 cursor-pointer hover:border-muted-foreground transition-colors"
                title={t('自訂顏色')}
              >
                <input
                  type="color"
                  value={calendarColor}
                  onChange={(event) => setCalendarColor(event.target.value)}
                  aria-label={t('自訂顏色')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span
                  className="absolute inset-1 rounded-full"
                  style={{ backgroundColor: calendarColor }}
                />
              </label>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-secondary/20 pb-[max(env(safe-area-inset-bottom),1rem)] md:pb-4">
          <Button variant="secondary" onClick={onClose}>
            {t('取消')}
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="w-4 h-4" />
            {isCreate ? t('建立任務') : t('儲存')}
          </Button>
        </div>
      </ModalShell>
    </>
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
  const { t } = useI18n()
  const bucket = urgencyBucket(value)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5" />
          {t('急迫度')}
        </label>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium', bucket.text)}>{t(bucket.label)}</span>
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
              aria-label={t('設為急迫度 {level}', { level })}
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
        <span>{t('低')}</span>
        <span>{t('中')}</span>
        <span>{t('高')}</span>
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
  if (min <= 0) return t('0 分')
  if (min < 60) return t('{min} 分', { min })
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? t('{h} 小時', { h }) : t('{h} 小時 {m} 分', { h, m })
}

interface TimeBlockSectionProps {
  scheduledDate: string
  startTime: string
  endTime: string
  estimatedMinutes: string
  dueDate: string
  onScheduledDateChange: (v: string) => void
  onStartTimeChange: (v: string) => void
  onEndTimeChange: (v: string) => void
  onEstimatedMinutesChange: (v: string) => void
  onDueDateChange: (v: string) => void
  children?: ReactNode
}

function TimeBlockSection({
  scheduledDate,
  startTime,
  endTime,
  estimatedMinutes,
  dueDate,
  onScheduledDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onEstimatedMinutesChange,
  onDueDateChange,
  children,
}: TimeBlockSectionProps) {
  const { t } = useI18n()
  const [referenceDate] = useState(() => new Date())
  const [showTimingDetails, setShowTimingDetails] = useState(false)
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
  const todayStr = toDateString(referenceDate)
  const tomorrow = new Date(referenceDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = toDateString(tomorrow)
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
          {t('排程')}
        </label>
        {hasSchedule && (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={t('清空日期與時段，任務移回左側待排程')}
          >
            <X className="w-3 h-3" />
            {t('取消排程')}
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
                {t(d.label)}
              </button>
            )
          })}
          <DateField
            value={scheduledDate}
            onChange={onScheduledDateChange}
            className="h-8 flex-1 text-xs"
            aria-label={t('排程日期')}
          />
        </div>
      </div>

      {/* Time row: start → end with inline ± stepper on end */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {t('時段')}
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
              {duration <= 0 ? t('結束需晚於開始') : formatDuration(duration)}
            </span>
          )}
        </div>

        {/* Start / End inputs — end has integrated ±15 stepper */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TimeField
            value={startTime}
            onChange={(v) => {
              onStartTimeChange(v)
              const newStart = parseTime(v)
              if (newStart !== null && endMin !== null && duration && duration > 0) {
                onEndTimeChange(formatTimeFromMinutes(Math.min(24 * 60 - 1, newStart + duration)))
              }
            }}
            className="h-9 font-mono text-center"
            aria-label={t('開始時間')}
          />
          <span className="text-muted-foreground text-sm" aria-hidden="true">→</span>
          <div className="relative">
            <TimeField
              value={endTime}
              onChange={onEndTimeChange}
              className="h-9 font-mono text-center pr-12"
              aria-label={t('結束時間')}
            />
            {/* End-time stepper — placed where the right edge of the input
                would otherwise sit, so adjustments feel attached to the
                field they modify rather than buried in a chips row. */}
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => adjustEnd(-15)}
                aria-label={t('結束時間 -15 分鐘')}
                className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => adjustEnd(15)}
                aria-label={t('結束時間 +15 分鐘')}
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

      {children && (
        <div className="border-t border-border pt-4">
          {children}
        </div>
      )}

      {/* Estimated effort and deadline are secondary scheduling details.
          Keep them together at the bottom of this card so the main date/time
          controls remain quick to scan. */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowTimingDetails((visible) => !visible)}
          aria-expanded={showTimingDetails}
          aria-label={t(showTimingDetails ? '收合時間與期限' : '展開時間與期限')}
          title={t(showTimingDetails ? '收合時間與期限' : '展開時間與期限')}
          className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t('時間與期限')}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {!showTimingDetails && (estimatedMinutes || dueDate) && (
              <span className="truncate text-[10px] text-muted-foreground">
                {[
                  estimatedMinutes ? t('{min} 分', { min: estimatedMinutes }) : '',
                  dueDate,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform',
                showTimingDetails && 'rotate-180',
              )}
            />
          </span>
        </button>

        {showTimingDetails && (
          <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t('預估時間 (分鐘)')}
              </label>
              <Input
                type="number"
                min="0"
                value={estimatedMinutes}
                onChange={(event) => onEstimatedMinutesChange(event.target.value)}
                placeholder="60"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {t('截止日期')}
              </label>
              <DateField
                value={dueDate}
                onChange={onDueDateChange}
                className="h-10"
                aria-label={t('截止日期')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface RecurrenceSettingsProps {
  isRecurring: boolean
  recurrenceType: 'daily' | 'weekly' | 'monthly' | 'custom'
  recurrenceInterval: string
  recurrenceDays: number[]
  recurrenceEndDate: string
  onRecurringChange: (value: boolean) => void
  onRecurrenceTypeChange: (value: 'daily' | 'weekly' | 'monthly' | 'custom') => void
  onRecurrenceIntervalChange: (value: string) => void
  onToggleRecurrenceDay: (day: number) => void
  onRecurrenceEndDateChange: (value: string) => void
}

function RecurrenceSettings({
  isRecurring,
  recurrenceType,
  recurrenceInterval,
  recurrenceDays,
  recurrenceEndDate,
  onRecurringChange,
  onRecurrenceTypeChange,
  onRecurrenceIntervalChange,
  onToggleRecurrenceDay,
  onRecurrenceEndDateChange,
}: RecurrenceSettingsProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Repeat className="w-3.5 h-3.5" />
          {t('重複設定')}
        </label>
        <button
          type="button"
          onClick={() => onRecurringChange(!isRecurring)}
          aria-pressed={isRecurring}
          aria-label={t('重複設定')}
          className={cn(
            'relative w-10 h-5 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isRecurring ? 'bg-primary' : 'bg-muted'
          )}
          style={{ padding: 0, appearance: 'none' as const }}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none',
              isRecurring ? 'translate-x-5' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {isRecurring && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'daily', label: '每天' },
              { value: 'weekly', label: '每週' },
              { value: 'monthly', label: '每月' },
              { value: 'custom', label: '自訂' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onRecurrenceTypeChange(option.value as RecurrenceSettingsProps['recurrenceType'])}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  recurrenceType === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          {recurrenceType === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('每')}</span>
              <Input
                type="number"
                min="1"
                value={recurrenceInterval}
                onChange={(e) => onRecurrenceIntervalChange(e.target.value)}
                className="w-16 h-8 text-center"
              />
              <span className="text-xs text-muted-foreground">{t('天重複一次')}</span>
            </div>
          )}

          {recurrenceType === 'weekly' && (
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">{t('選擇重複的星期')}</span>
              <div className="flex gap-1.5">
                {weekdayLabels().map((label, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onToggleRecurrenceDay(index)}
                    aria-pressed={recurrenceDays.includes(index)}
                    className={cn(
                      'w-8 h-8 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      recurrenceDays.includes(index)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-muted-foreground border border-border hover:bg-secondary'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">{t('結束日期 (可選)')}</label>
            <DateField
              value={recurrenceEndDate}
              onChange={onRecurrenceEndDateChange}
              className="h-8"
              aria-label={t('重複結束日期')}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// NotesEditor: textarea with bullet/checklist toolbar, auto-continue on Enter,
// click-to-toggle ☐ ↔ ☑, and Storage-backed images.
// ────────────────────────────────────────────────────────────────────────────

interface NotesEditorProps {
  value: string
  onChange: (v: string) => void
}

function NotesEditor({ value, onChange }: NotesEditorProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const insertLink = () => {
    const ta = ref.current
    if (!ta) return
    const v = ta.value
    const start = ta.selectionStart ?? v.length
    const end = ta.selectionEnd ?? v.length
    const selected = v.slice(start, end)

    const url = window.prompt(t('輸入網址（例如 https://example.com）'), selected.startsWith('http') ? selected : 'https://')
    if (!url) return

    const text = selected || window.prompt(t('連結要顯示的文字（留空則顯示網址）'), '') || url
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

  const insertImageMarkdown = (src: string, fileName: string) => {
    const ta = ref.current
    const v = ta?.value ?? value
    const start = ta?.selectionStart ?? v.length
    const end = ta?.selectionEnd ?? v.length
    const alt = fileName.replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '').trim() || t('備註圖片')
    const image = `![${alt}](${src})`
    const prefix = start > 0 && v[start - 1] !== '\n' ? '\n' : ''
    const suffix = end < v.length && v[end] !== '\n' ? '\n' : ''
    const insertion = `${prefix}${image}${suffix}`
    const next = v.slice(0, start) + insertion + v.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const cursorAt = start + insertion.length
      ta.setSelectionRange(cursorAt, cursorAt)
    })
  }

  const handleImageSelection = async (file?: File) => {
    if (!file) return
    if (!TASK_NOTE_IMAGE_EXTENSIONS[file.type]) {
      toast.error(t('只能插入 PNG、JPG、GIF 或 WebP 圖片'))
      return
    }
    if (file.size > MAX_TASK_NOTE_IMAGE_BYTES) {
      toast.error(t('圖片太大，上限 5MB'))
      return
    }

    const toastId = toast.loading(t('上傳圖片中…'))
    setIsUploadingImage(true)
    try {
      const src = await uploadTaskNoteImage(file)
      insertImageMarkdown(src, file.name)
      toast.success(t('圖片已插入'), { id: toastId })
    } catch (error) {
      console.error('[task-notes] image upload failed', error)
      const message = error instanceof Error ? error.message : t('圖片上傳失敗，請再試一次')
      toast.error(message, { id: toastId })
    } finally {
      setIsUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          {t('備註')}
        </label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => insertLinePrefix('• ')}
            title={t('加項目符號')}
            aria-label={t('加項目符號')}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <List className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix('☐ ')}
            title={t('加待辦項目')}
            aria-label={t('加待辦項目')}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={insertLink}
            title={t('插入超連結')}
            aria-label={t('插入超連結')}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploadingImage}
            title={t('加入圖片')}
            aria-label={t('加入圖片')}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:cursor-wait disabled:opacity-50"
          >
            {isUploadingImage
              ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void handleImageSelection(event.target.files?.[0])}
          />
        </div>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onKeyDown={(e) => {
          const nativeEvent = e.nativeEvent
          if (
            e.key === 'Enter' &&
            (isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229)
          ) {
            return
          }
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
        placeholder={t('寫下細節 · 子彈或待辦清單\n例如：\n• 確認流程\n☐ 寄信給客戶\n☐ 整理會議紀錄')}
        className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-input bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed"
      />
      {/* Live preview — only shown when notes contain a link, so the user
          can click to verify the URL without leaving the modal. */}
      {/\[[^\]]*\]\([^)]+\)|https?:\/\//.test(value) && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-border bg-card text-xs leading-relaxed whitespace-pre-wrap break-words">
          <div className="text-[10px] text-muted-foreground mb-1">{t('預覽')}</div>
          {renderNotesWithLinks(value, { renderImages: true })}
        </div>
      )}
    </div>
  )
}
