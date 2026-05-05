import * as React from 'react'

import { cn } from '@/lib/utils'

// Map HTML input types to a sensible default inputMode so mobile keyboards
// pick the right layout. Callers can still override via the inputMode prop.
const DEFAULT_INPUT_MODE: Record<string, React.HTMLAttributes<HTMLInputElement>['inputMode']> = {
  email: 'email',
  url: 'url',
  tel: 'tel',
  search: 'search',
  number: 'decimal',
}

function Input({
  className,
  type,
  inputMode,
  autoComplete,
  ...props
}: React.ComponentProps<'input'>) {
  const resolvedInputMode = inputMode ?? (type ? DEFAULT_INPUT_MODE[type] : undefined)
  // Only nudge autoComplete for typed inputs that map cleanly to browser
  // autofill profiles. For other types (date, time, number, plain text) we
  // pass through whatever the caller gave us — including nothing — so we
  // don't accidentally interfere with native <input type="date"> picker UI
  // or other browser-managed behavior.
  const autoCompleteByType: Record<string, string> = {
    email: 'email',
    url: 'url',
    tel: 'tel',
  }
  const resolvedAutoComplete = autoComplete ?? (type ? autoCompleteByType[type] : undefined)
  // Build attribute object so undefined keys are truly omitted from the
  // rendered DOM (rather than relying on React's undefined-prop handling).
  const extra: Record<string, string> = {}
  if (resolvedInputMode !== undefined) extra.inputMode = resolvedInputMode
  if (resolvedAutoComplete !== undefined) extra.autoComplete = resolvedAutoComplete
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...extra}
      {...props}
    />
  )
}

export { Input }
