'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer as Vaul } from 'vaul'
import { CalendarDays, CalendarRange, Repeat } from 'lucide-react'
import { useI18n } from '@/lib/i18n/react'

export type RecurrenceChoice = 'only_this' | 'this_and_following' | 'all'

interface RecurrenceChoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (choice: RecurrenceChoice) => void
  /** Header copy. Use the verb form: "重新排程"、"刪除"、"儲存". */
  title?: string
  /** Default-selected choice. `only_this` matches Google Calendar's
   * "edit one occurrence" expectation; switch to `all` when the user opens
   * the master row itself and there are no other overrides in play. */
  defaultChoice?: RecurrenceChoice
  actionLabel?: string
}

const OPTIONS: Array<{
  value: RecurrenceChoice
  label: string
  hint: string
  Icon: typeof CalendarDays
}> = [
  {
    value: 'only_this',
    label: '只改這一天',
    hint: '其他循環日不受影響',
    Icon: CalendarDays,
  },
  {
    value: 'this_and_following',
    label: '改這天與之後',
    hint: '保留先前的循環，從這天開始套用新設定',
    Icon: CalendarRange,
  },
  {
    value: 'all',
    label: '改所有循環',
    hint: '套用到整個重複事件',
    Icon: Repeat,
  },
]

export function RecurrenceChoiceModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  defaultChoice = 'only_this',
  actionLabel,
}: RecurrenceChoiceModalProps) {
  const { t } = useI18n()
  const resolvedTitle = title ?? t('套用到這個重複事件')
  const resolvedActionLabel = actionLabel ?? t('套用')
  const [choice, setChoice] = useState<RecurrenceChoice>(defaultChoice)
  const isMobile = useIsMobile()

  // Hand-rolled dialog (not ModalShell) — with no Esc handling of its own,
  // a stray Escape here fell through to whatever else was listening on
  // `document` underneath (the task-edit drawer's ModalShell), closing it
  // and losing in-progress edits. Registered with `capture: true` so this
  // runs and marks the event before ModalShell's bubble-phase listener
  // checks `e.defaultPrevented` — same mechanism Radix's own dismissable
  // layer uses, so ordering is correct regardless of which mounted first.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isOpen, onClose])

  if (!isOpen && !isMobile) return null

  const handleConfirm = () => {
    onConfirm(choice)
    onClose()
  }

  const optionList = (
    <div className="px-3 pb-3 space-y-1.5">
      {OPTIONS.map(({ value, label, hint, Icon }) => {
        const active = choice === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setChoice(value)}
            className={cn(
              'w-full flex items-start gap-3 text-left px-3 py-3 rounded-xl border transition-all',
              active
                ? 'border-primary bg-primary/5'
                : 'border-transparent hover:bg-secondary/50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
                active ? 'border-primary' : 'border-muted-foreground/40',
              )}
              aria-hidden
            >
              {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </span>
            <Icon
              className={cn(
                'flex-shrink-0 w-4 h-4 mt-0.5',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-hidden
            />
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground leading-snug">
                {t(label)}
              </span>
              <span className="text-xs text-muted-foreground leading-snug mt-0.5">
                {t(hint)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )

  if (isMobile) {
    return (
      <Vaul.Root open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
        <Vaul.Portal>
          <Vaul.Overlay className="fixed inset-0 z-popover bg-foreground/25 backdrop-blur-sm" />
          <Vaul.Content
            className="fixed inset-x-0 bottom-0 z-popover flex max-h-[85dvh] flex-col rounded-t-2xl bg-card outline-none overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <Vaul.Title className="sr-only">{resolvedTitle}</Vaul.Title>
            {/* Drag handle */}
            <div className="mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />

            <header className="px-5 pt-3 pb-2">
              <h2 className="text-base font-semibold text-foreground">{resolvedTitle}</h2>
            </header>

            {optionList}

            <footer className="flex flex-col gap-2 px-4 pt-2 pb-4">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full h-12 rounded-xl text-sm font-semibold bg-primary text-primary-foreground active:brightness-95 transition-all"
              >
                {resolvedActionLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                {t('取消')}
              </button>
            </footer>
          </Vaul.Content>
        </Vaul.Portal>
      </Vaul.Root>
    )
  }

  return (
    <div className="fixed inset-0 z-popover flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-foreground/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
        className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <header className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-foreground">{resolvedTitle}</h2>
        </header>

        {optionList}

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-panel-secondary">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            {t('取消')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:brightness-105 transition-all"
          >
            {resolvedActionLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
