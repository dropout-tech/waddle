'use client'

/**
 * Post-session "what did you get done?" dialog — pops up after a work
 * session's completion wind-down finishes. Both fields are optional; saving
 * with either filled retitles the calendar record that's about to be
 * written (title → the block's label, note → its `notes`), skipping keeps
 * the record exactly as the timer built it (a plain "<session name> ✓").
 *
 * Deliberately NOT built on ModalShell: an auto-started break keeps the
 * immersive full-screen session (z-tour, app/globals.css) mounted right
 * underneath this dialog, and ModalShell's panel is pinned to z-modal —
 * below z-tour. This one needs to sit above it, so it rolls its own
 * lightweight portal at a higher z-index while keeping the same visual
 * language (backdrop blur+darken, centered card / mobile bottom sheet,
 * Esc-to-dismiss, body scroll lock).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { useI18n } from '@/lib/i18n/react'
import { formatFocusDuration } from '@/lib/timer-format'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export interface FocusSessionLogModalProps {
  /** Actual focused seconds for the session that just ended. */
  focusedSeconds: number
  onSave: (title: string, note: string) => void
  /** Skip — also fires on Esc and backdrop click. */
  onSkip: () => void
}

export function FocusSessionLogModal({ focusedSeconds, onSave, onSkip }: FocusSessionLogModalProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [canPortal, setCanPortal] = useState(false)

  useEffect(() => setCanPortal(true), [])
  useBodyScrollLock(true)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSkip])

  if (!canPortal) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center md:items-center"
      role="presentation"
    >
      {/* Backdrop — same treatment as ModalShell (blur + darken), just at a
          z-index above the still-mounted immersive screen. */}
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur motion-safe:duration-200 motion-safe:ease-quart motion-safe:animate-in motion-safe:fade-in"
        onClick={onSkip}
        aria-hidden
      />
      <div
        data-focus-log-modal
        role="dialog"
        aria-modal="true"
        aria-label={t('這段時間做了什麼？')}
        className={cn(
          'relative z-[91] flex w-full flex-col overflow-hidden bg-card',
          'motion-safe:duration-200 motion-safe:ease-quart motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95',
          isMobile
            ? 'mt-auto rounded-t-3xl border-t border-border shadow-2xl pb-[max(env(safe-area-inset-bottom),1rem)]'
            : 'max-w-sm mx-4 rounded-2xl border border-border shadow-2xl',
        )}
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
            <span className="block w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-[15px] font-semibold text-foreground">{t('這段時間做了什麼？')}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('這次專注了 {duration}', { duration: formatFocusDuration(focusedSeconds, t) })}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {t('不填也沒關係，跳過就記成純粹的專注時間')}
          </p>
        </div>
        <div className="px-5 py-3 space-y-2.5">
          <Input
            data-focus-log-title
            autoFocus={!isMobile}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('標題（選填）')}
            className="h-10"
          />
          <Textarea
            data-focus-log-note
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('想多記一點？（選填）')}
            rows={4}
            className="resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2">
          <button
            type="button"
            data-focus-log-skip
            onClick={onSkip}
            className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            {t('跳過')}
          </button>
          <button
            type="button"
            data-focus-log-save
            onClick={() => onSave(title, note)}
            className="min-h-[44px] px-4 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('記下來')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
