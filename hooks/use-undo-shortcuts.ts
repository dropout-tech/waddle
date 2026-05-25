'use client'

/**
 * Global Cmd+Z / Cmd+Shift+Z keyboard listener wired to the undo stack.
 *
 * Skips when the user is typing in an input/textarea/contentEditable so the
 * browser's native text-undo behaves normally inside form fields (the app
 * undo is for app actions like drag, delete — not character-level typing).
 *
 * Mount once at the app root. Subsequent mounts would attach duplicate
 * listeners and run undo twice per keystroke.
 */
import { useEffect } from 'react'
import { toast } from 'sonner'
import { performRedo, performUndo } from '@/lib/undo-stack'

export function useUndoShortcuts() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key !== 'z' && e.key !== 'Z') return

      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      e.preventDefault()
      try {
        if (e.shiftKey) {
          const action = await performRedo()
          if (action) toast.success(`已重做：${action.label}`)
        } else {
          const action = await performUndo()
          if (action) toast.success(`已復原：${action.label}`)
        }
      } catch (err) {
        toast.error(e.shiftKey ? '重做失敗' : '復原失敗')
        console.error('[undo-shortcuts]', err)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
