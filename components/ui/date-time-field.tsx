'use client'

/**
 * Brand date/time fields (W2.4).
 *
 * Desktop replaces the native `<input type="date|time">` — whose English
 * "mm/dd/yyyy" / "--:-- --" chrome clashes with the Waddle voice — with a
 * Popover + react-day-picker calendar (dates) and a 15-minute Select
 * (times), both rendered in Traditional Chinese.
 *
 * Mobile (`useIsMobile`, < 768px) keeps the native inputs on purpose:
 * the iOS wheel picker is the best mobile experience and Capacitor ships
 * the same code. Values stay plain `YYYY-MM-DD` / `HH:MM` strings in both
 * branches so the storage layer never notices the swap.
 */

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { CalendarIcon, ChevronDownIcon, ClockIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SelectContent, SelectItem } from '@/components/ui/select'
import {
  toDateString,
  parseDateString,
  WEEKDAY_NAMES,
} from '@/lib/calendar-utils'

// Shared field chrome — mirrors components/ui/input.tsx so the swapped-in
// triggers sit flush next to remaining shadcn Inputs in the same form.
const fieldClasses =
  'border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none ' +
  'transition-[color,box-shadow,border-color,background-color] duration-150 ease-quart ' +
  'hover:bg-accent/20 hover:border-ring/40 ' +
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ' +
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'

/** 「7月12日（週六）」; adds the year when it isn't the current one. */
export function formatDateFieldLabel(value: string): string {
  const d = parseDateString(value)
  if (Number.isNaN(d.getTime())) return value
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  const ymd =
    d.getFullYear() === new Date().getFullYear()
      ? md
      : `${d.getFullYear()}年${md}`
  return `${ymd}（週${WEEKDAY_NAMES[d.getDay()]}）`
}

interface DateFieldProps {
  /** YYYY-MM-DD, or '' when unset. */
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  /** Show the 清除 action in the popover footer (default true). */
  clearable?: boolean
  disabled?: boolean
  'aria-label'?: string
}

export function DateField({
  value,
  onChange,
  className,
  placeholder = '選擇日期',
  clearable = true,
  disabled,
  'aria-label': ariaLabel,
}: DateFieldProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  if (isMobile) {
    return (
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    )
  }

  const selected = value ? parseDateString(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          data-empty={!value}
          className={cn(fieldClasses, 'gap-2 text-left', className)}
        >
          <CalendarIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {value ? (
            <span className="truncate text-foreground">
              {formatDateFieldLabel(value)}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">
              {placeholder}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // Esc should peel one layer at a time: close only the popover, not
        // the ModalShell underneath (its document-level Esc listener would
        // otherwise fire in the same keystroke).
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? toDateString(d) : '')
            setOpen(false)
          }}
          formatters={{
            formatCaption: (date) =>
              `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`,
            formatWeekdayName: (date) => WEEKDAY_NAMES[date.getDay()],
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onChange(toDateString(new Date()))
              setOpen(false)
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-150 ease-quart hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            今天
          </button>
          {clearable && value && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-quart hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              清除
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 15-minute grid: 00:00 … 23:45 (96 options).
const TIME_OPTIONS: string[] = []
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    )
  }
}

interface TimeFieldProps {
  /** HH:MM, or '' when unset. */
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

export function TimeField({
  value,
  onChange,
  className,
  disabled,
  'aria-label': ariaLabel,
}: TimeFieldProps) {
  const isMobile = useIsMobile()

  // Values dragged on the calendar can sit off the 15-minute grid
  // (e.g. 14:37). Splice them in so the trigger still shows a selection
  // instead of silently falling back to the placeholder.
  const options = React.useMemo(() => {
    if (!value || TIME_OPTIONS.includes(value)) return TIME_OPTIONS
    return [...TIME_OPTIONS, value].sort()
  }, [value])

  if (isMobile) {
    return (
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    )
  }

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          fieldClasses,
          'justify-between gap-1 font-mono tabular-nums data-[placeholder]:text-muted-foreground',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ClockIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <SelectPrimitive.Value placeholder="--:--" />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectContent
        className="max-h-72"
        // Same one-layer-per-Esc rule as DateField's popover.
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        {options.map((t) => (
          <SelectItem key={t} value={t} className="font-mono tabular-nums">
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}
