'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, Workspace } from '@/lib/types'
import {
  resolveFocus,
  resolveWorkspaceFocuses,
  type FocusSettings,
  type ResolvedFocus,
} from '@/lib/focus'
import { useDisplayColor } from '@/hooks/use-display-color'
import { useI18n } from '@/lib/i18n/react'
import { FocusEditorModal, type FocusEditorTarget } from '@/components/modals/focus-editor-modal'

/**
 * "當前重點" — the answer to *what matters right now*, pinned above the task
 * list.
 *
 * Two tiers: one headline focus (global), and an optional collapsed list of
 * per-workspace focuses. All ranking/fallback logic lives in lib/focus.ts —
 * this file only renders what `resolveFocus` hands back.
 *
 * Deliberately NOT a card (DESIGN.md Container Rules: sidebar sections use
 * whitespace + a hairline, cards are for real objects like a task). The
 * visual language is the quick-access row directly below it.
 */

const EXPANDED_STORAGE_KEY = 'waddle-focus-expanded-v1'
/** Keep the second tier scannable; the rest collapses into a count. */
const MAX_WORKSPACE_ROWS = 4

interface FocusBlockProps {
  workspaces: Workspace[]
  focus: FocusSettings
  /** Local date string, passed in so it rolls over with the panel's tick. */
  todayStr: string
  onSelectTask: (task: Task) => void
  /**
   * Narrow settings mutation. Optional so the panel still renders (read-only)
   * on a build where the data layer hasn't wired it up yet.
   */
  onSetFocusBoard?: (next: FocusSettings) => Promise<void> | void
}

export function FocusBlock({
  workspaces,
  focus,
  todayStr,
  onSelectTask,
  onSetFocusBoard,
}: FocusBlockProps) {
  const { t } = useI18n()
  const displayColor = useDisplayColor()
  const [editorTarget, setEditorTarget] = useState<FocusEditorTarget | null>(null)
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === '1'
  })

  const global = useMemo(
    () => resolveFocus(focus?.global, workspaces, { scope: 'global', today: todayStr }),
    [focus?.global, workspaces, todayStr]
  )
  const workspaceFocuses = useMemo(
    () => (focus ? resolveWorkspaceFocuses(focus, workspaces, todayStr) : []),
    [focus, workspaces, todayStr]
  )

  if (!focus?.enabled) return null

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* private mode — in-memory only */
      }
      return next
    })
  }

  /** "逾期 3 天" / "今天" / "急迫" / "自訂" / "手動釘選" — one short word on the meta line. */
  const statusLabel = (resolved: ResolvedFocus) => {
    // A hand-typed status line is `reason: 'manual'` too, but calling it
    // "手動釘選" implies a real task got flagged. Split the two apart.
    if (resolved.source === 'text') return t('自訂')
    switch (resolved.reason) {
      case 'overdue':
        return resolved.overdueDays
          ? t('逾期 {days} 天', { days: resolved.overdueDays })
          : t('逾期')
      case 'today':
        return t('今天')
      case 'urgency':
        return t('急迫')
      case 'manual':
        return t('手動釘選')
      default:
        return null
    }
  }

  const metaParts = [global.workspaceName, global.categoryName].filter(Boolean) as string[]
  const globalStatus = statusLabel(global)
  const isEmpty = global.source === 'empty'
  // Only the first follow-up survives on phones — vertical space above the
  // task list is the scarcest thing in the layout.
  const nextTasks = global.nextTasks.slice(0, 2)

  const headlineBody = (
    <>
      <span
        className="mt-[7px] size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: displayColor(global.workspaceColor) || 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-foreground line-clamp-2">
          {global.title}
        </span>
        {(metaParts.length > 0 || globalStatus) && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {metaParts.join(' · ')}
            {metaParts.length > 0 && globalStatus ? ' · ' : ''}
            {globalStatus && (
              <span className={cn(global.reason === 'overdue' && 'text-urgency-critical')}>
                {globalStatus}
              </span>
            )}
          </span>
        )}
      </span>
    </>
  )

  return (
    <section
      data-tour="focus-block"
      aria-label={t('當前重點')}
      className="group/focus border-b border-border bg-card/50 px-3 pb-2 pt-2.5"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('當前重點')}
          </p>

          {isEmpty ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('今天很輕鬆 🐧')}</span>
              <button
                type="button"
                onClick={() => setEditorTarget({ scope: 'global' })}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors duration-150 ease-quart hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('設定重點')}
              </button>
            </div>
          ) : global.task ? (
            <button
              type="button"
              onClick={() => onSelectTask(global.task!)}
              className="-mx-1.5 mt-0.5 flex min-h-11 w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-150 ease-quart hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
            >
              {headlineBody}
            </button>
          ) : (
            <div className="mt-0.5 flex items-start gap-2 py-1">{headlineBody}</div>
          )}

          {global.pinFellBack && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t('原本釘的任務已完成，已換下一個')}
            </p>
          )}

          {nextTasks.map((task, index) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectTask(task)}
              className={cn(
                '-mx-1.5 flex min-h-11 w-full items-center rounded-md px-1.5 text-left text-[11px] text-muted-foreground transition-colors duration-150 ease-quart hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-0.5',
                index === 1 && 'hidden md:flex'
              )}
            >
              <span className="truncate">· {task.title}</span>
            </button>
          ))}
        </div>

        {/* Edit stays visible on touch devices (no hover to reveal it); on
            desktop it fades in with the section to keep the panel quiet. */}
        <button
          type="button"
          onClick={() => setEditorTarget({ scope: 'global' })}
          aria-label={t('編輯當前重點')}
          className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 ease-quart hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-8 md:opacity-0 md:group-hover/focus:opacity-100"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* ── Second tier: per-workspace focuses ─────────────────────────── */}
      {workspaceFocuses.length > 0 && (
        <>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="-mx-1.5 mt-0.5 flex min-h-11 w-full items-center gap-1 rounded-md px-1.5 text-left text-[11px] text-muted-foreground transition-colors duration-150 ease-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-1"
          >
            <ChevronRight
              className={cn(
                'size-3 transition-transform duration-150 ease-quart',
                expanded && 'rotate-90'
              )}
              aria-hidden="true"
            />
            {t('各工作區重點')} · {workspaceFocuses.length}
          </button>

          {expanded && (
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
              {workspaceFocuses.slice(0, MAX_WORKSPACE_ROWS).map((row) => (
                <div key={row.workspaceId} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      row.task
                        ? onSelectTask(row.task)
                        : setEditorTarget({ scope: 'workspace', workspaceId: row.workspaceId ?? null })
                    }
                    className="-ml-1.5 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 ease-quart hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-1"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: displayColor(row.workspaceColor) || 'var(--muted-foreground)' }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-xs text-foreground">{row.title}</span>
                    <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                      {row.workspaceName}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditorTarget({ scope: 'workspace', workspaceId: row.workspaceId ?? null })
                    }
                    aria-label={t('編輯「{name}」的重點', { name: row.workspaceName ?? '' })}
                    className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150 ease-quart hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-8 md:opacity-0 md:group-hover/focus:opacity-100"
                  >
                    <Pencil className="size-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {workspaceFocuses.length > MAX_WORKSPACE_ROWS && (
                <p className="px-1.5 py-1 text-[10px] text-muted-foreground">
                  {t('還有 {count} 個工作區', {
                    count: workspaceFocuses.length - MAX_WORKSPACE_ROWS,
                  })}
                </p>
              )}
              <FocusSetupRow onClick={() => setEditorTarget({ scope: 'workspace', workspaceId: null })} />
            </div>
          )}
        </>
      )}

      {workspaceFocuses.length === 0 && !isEmpty && (
        <FocusSetupRow onClick={() => setEditorTarget({ scope: 'workspace', workspaceId: null })} />
      )}

      {editorTarget && (
        <FocusEditorModal
          isOpen
          target={editorTarget}
          settings={focus}
          workspaces={workspaces}
          todayStr={todayStr}
          onClose={() => setEditorTarget(null)}
          onSave={onSetFocusBoard}
        />
      )}
    </section>
  )
}

function FocusSetupRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1.5 flex min-h-11 w-full items-center gap-1 rounded-md px-1.5 text-left text-[11px] text-muted-foreground transition-colors duration-150 ease-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-1"
    >
      <Plus className="size-3" aria-hidden="true" />
      {t('設定工作區重點')}
    </button>
  )
}
