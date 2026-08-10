'use client'

import { useMemo, useState } from 'react'
import { Check, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import {
  pickAutoTask,
  type FocusMode,
  type FocusPin,
  type FocusSettings,
} from '@/lib/focus'
import { forEachTask } from '@/lib/task-utils'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import { ModalShell } from './modal-shell'

/**
 * Which slot the editor is pointed at. `workspaceId: null` means "the user
 * opened the per-workspace editor without saying which one yet" — the modal
 * then asks first (chip row) instead of us inventing a target.
 */
export type FocusEditorTarget =
  | { scope: 'global' }
  | { scope: 'workspace'; workspaceId: string | null }

const MAX_TEXT_LENGTH = 60

interface FocusEditorModalProps {
  isOpen: boolean
  target: FocusEditorTarget
  settings: FocusSettings
  workspaces: Workspace[]
  todayStr: string
  onClose: () => void
  onSave?: (next: FocusSettings) => Promise<void> | void
}

function pinFor(settings: FocusSettings, target: FocusEditorTarget, workspaceId: string | null): FocusPin {
  if (target.scope === 'global') return settings.global ?? { mode: 'auto' }
  if (!workspaceId) return { mode: 'off' }
  return settings.byWorkspace?.[workspaceId] ?? { mode: 'off' }
}

export function FocusEditorModal({
  isOpen,
  target,
  settings,
  workspaces,
  todayStr,
  onClose,
  onSave,
}: FocusEditorModalProps) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()

  const activeWorkspaces = useMemo(() => workspaces.filter((w) => !w.isArchived), [workspaces])

  const [workspaceId, setWorkspaceId] = useState<string | null>(
    target.scope === 'workspace' ? target.workspaceId : null
  )
  const initialPin = pinFor(settings, target, workspaceId)
  const [mode, setMode] = useState<FocusMode>(initialPin.mode)
  const [text, setText] = useState(initialPin.text ?? '')
  const [taskId, setTaskId] = useState<string | undefined>(initialPin.taskId)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const isWorkspaceScope = target.scope === 'workspace'
  const workspace = workspaceId ? activeWorkspaces.find((w) => w.id === workspaceId) : undefined

  // Switching workspace re-seeds the form from that workspace's own pin —
  // otherwise a half-typed value would silently leak onto another workspace.
  const selectWorkspace = (id: string) => {
    setWorkspaceId(id)
    const pin = settings.byWorkspace?.[id] ?? { mode: 'off' as FocusMode }
    setMode(pin.mode)
    setText(pin.text ?? '')
    setTaskId(pin.taskId)
  }

  const autoPreview = useMemo(
    () => (isWorkspaceScope && !workspaceId ? null : pickAutoTask(workspaces, todayStr, workspaceId ?? undefined)),
    [workspaces, todayStr, workspaceId, isWorkspaceScope]
  )

  /** Open tasks the user may pin, grouped "工作區 · 分類" for scanability. */
  const taskGroups = useMemo(() => {
    const groups = new Map<string, { label: string; color?: string; tasks: Task[] }>()
    const needle = search.trim().toLowerCase()
    forEachTask(workspaces, (task, category, ws) => {
      if (ws.isArchived || category.isArchived) return
      if (task.isCompleted || task.isArchived) return
      if (task.showInTaskList === false || task.isMeeting) return
      if (isWorkspaceScope && workspaceId && ws.id !== workspaceId) return
      if (needle && !task.title.toLowerCase().includes(needle)) return
      const key = `${ws.id}::${category.id}`
      if (!groups.has(key)) {
        groups.set(key, { label: `${ws.name} · ${category.name}`, color: ws.color, tasks: [] })
      }
      groups.get(key)!.tasks.push(task)
    })
    return [...groups.values()]
  }, [workspaces, search, workspaceId, isWorkspaceScope])

  const selectedTask = useMemo(() => {
    if (!taskId) return null
    let found: Task | null = null
    forEachTask(workspaces, (task) => {
      if (task.id === taskId) found = task
    })
    return found as Task | null
  }, [taskId, workspaces])

  const canSave =
    !!onSave &&
    !saving &&
    (!isWorkspaceScope || !!workspaceId) &&
    (mode !== 'text' || text.trim().length > 0) &&
    (mode !== 'task' || !!taskId)

  const handleSave = async () => {
    if (!canSave || !onSave) return
    const pin: FocusPin = {
      mode,
      text: mode === 'text' ? text.trim() : undefined,
      taskId: mode === 'task' ? taskId : undefined,
      updatedAt: new Date().toISOString(),
    }
    const next: FocusSettings =
      target.scope === 'global'
        ? { ...settings, global: pin }
        : { ...settings, byWorkspace: { ...(settings.byWorkspace ?? {}), [workspaceId!]: pin } }
    setSaving(true)
    try {
      await onSave(next)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const modes: { value: FocusMode; label: string }[] = [
    { value: 'auto', label: t('自動推薦') },
    { value: 'text', label: t('自訂文字') },
    { value: 'task', label: t('釘選任務') },
    ...(isWorkspaceScope ? [{ value: 'off' as FocusMode, label: t('不顯示') }] : []),
  ]

  const title = isWorkspaceScope
    ? workspace
      ? t('設定「{name}」的重點', { name: workspace.name })
      : t('設定工作區重點')
    : t('設定當前重點')

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} size="md" ariaLabel={title}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('當前重點')}</p>
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('關閉')}
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ease-quart hover:bg-secondary md:size-9"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* Which workspace (per-workspace scope only) */}
        {isWorkspaceScope && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('工作區')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeWorkspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => selectWorkspace(ws.id)}
                  aria-pressed={workspaceId === ws.id}
                  className={cn(
                    'flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-150 ease-quart md:min-h-9',
                    workspaceId === ws.id
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: displayColor(ws.color) }}
                    aria-hidden="true"
                  />
                  {ws.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mode */}
        <div className="flex flex-wrap gap-1.5">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              aria-pressed={mode === m.value}
              className={cn(
                'min-h-11 rounded-lg px-3 text-xs font-medium transition-colors duration-150 ease-quart md:min-h-9',
                mode === m.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Mode: auto */}
        {mode === 'auto' && (
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('Huddle 會挑逾期最久 → 今天排程 → 最急迫的任務')}
            </p>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3" aria-hidden="true" />
                {t('現在會顯示')}
              </p>
              {autoPreview ? (
                <>
                  <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                    {autoPreview.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {[autoPreview.workspaceName, autoPreview.categoryName].filter(Boolean).join(' · ')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('今天很輕鬆 🐧')}</p>
              )}
            </div>
          </div>
        )}

        {/* Mode: free text */}
        {mode === 'text' && (
          <div className="space-y-1.5">
            <input
              type="text"
              value={text}
              maxLength={MAX_TEXT_LENGTH}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
              placeholder={t('例：推進講師資源站')}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/50 md:h-10"
            />
            <p className="text-right text-[10px] tabular-nums text-muted-foreground">
              {text.length} / {MAX_TEXT_LENGTH}
            </p>
          </div>
        )}

        {/* Mode: pin a task */}
        {mode === 'task' && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('搜尋任務...')}
                className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/50 md:h-10"
              />
            </div>
            {selectedTask && (
              <p className="truncate text-[11px] text-muted-foreground">
                {t('已選擇：{title}', { title: selectedTask.title })}
              </p>
            )}
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border md:max-h-64">
              {taskGroups.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('沒有符合的任務')}
                </p>
              ) : (
                taskGroups.map((group) => (
                  <div key={group.label}>
                    <p className="sticky top-0 flex items-center gap-1.5 bg-card px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: displayColor(group.color) }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{group.label}</span>
                    </p>
                    {group.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setTaskId(task.id)}
                        aria-pressed={taskId === task.id}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs transition-colors duration-150 ease-quart',
                          taskId === task.id
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                        {taskId === task.id && (
                          <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {mode === 'off' && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('這個工作區不會出現在「各工作區重點」清單裡。')}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-shrink-0 gap-2 border-t border-border bg-card px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 md:pb-4">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-xl border border-border text-sm font-medium text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/50 md:min-h-10"
        >
          {t('取消')}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className={cn(
            'min-h-11 flex-1 rounded-xl text-sm font-semibold transition-colors duration-150 ease-quart md:min-h-10',
            canSave
              ? 'bg-primary text-primary-foreground hover:brightness-110'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          )}
        >
          {t('儲存')}
        </button>
      </div>
    </ModalShell>
  )
}
