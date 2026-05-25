'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CalendarDays, CalendarRange, Repeat } from 'lucide-react'

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
  title = '套用到這個重複事件',
  defaultChoice = 'only_this',
  actionLabel = '套用',
}: RecurrenceChoiceModalProps) {
  const [choice, setChoice] = useState<RecurrenceChoice>(defaultChoice)

  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm(choice)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-foreground/25 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <header className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </header>

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
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground leading-snug mt-0.5">
                    {hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-panel-secondary">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:brightness-105 transition-all"
          >
            {actionLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
