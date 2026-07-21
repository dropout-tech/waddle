'use client'

import { Undo2, Redo2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { performRedo, performUndo, useUndoStack } from '@/lib/undo-stack'
import { useI18n } from '@/lib/i18n/react'

/**
 * Toolbar pair: ↶ Undo + ↷ Redo.
 *
 * Disabled state mirrors the stacks. Tooltip surfaces the action that's
 * about to run ("復原：重排『任務 X』 (⌘Z)") so users know what they're
 * un-doing before they click — important for the "回上一步" mental model
 * where the user has lost track of which action was most recent.
 *
 * Buttons are intentionally small/compact to fit alongside 日記 / 報告 /
 * 匯出 / 設定 in the calendar header without crowding.
 */
export function UndoRedoButtons({ className }: { className?: string }) {
  const { undoLen, redoLen, topUndoLabel, topRedoLabel } = useUndoStack()
  const { t } = useI18n()

  const handleUndo = async () => {
    try {
      const action = await performUndo()
      if (action) toast.success(t('已復原：{label}', { label: action.label }))
    } catch (e) {
      toast.error(t('復原失敗'))
      console.error(e)
    }
  }

  const handleRedo = async () => {
    try {
      const action = await performRedo()
      if (action) toast.success(t('已重做：{label}', { label: action.label }))
    } catch (e) {
      toast.error(t('重做失敗'))
      console.error(e)
    }
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button
        type="button"
        disabled={undoLen === 0}
        onClick={handleUndo}
        title={topUndoLabel ? t('復原：{label} (⌘Z)', { label: topUndoLabel }) : t('無動作可復原 (⌘Z)')}
        aria-label={t('復原')}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={redoLen === 0}
        onClick={handleRedo}
        title={topRedoLabel ? t('重做：{label} (⇧⌘Z)', { label: topRedoLabel }) : t('無動作可重做 (⇧⌘Z)')}
        aria-label={t('重做')}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
