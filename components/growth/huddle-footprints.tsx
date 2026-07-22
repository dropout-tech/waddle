import { cn } from '@/lib/utils'

interface HuddleFootprintsProps {
  earned?: boolean
  current?: boolean
  className?: string
}

/**
 * One day's footprint is always a pair of the same soft oval feet used by
 * the approved Huddle character. It deliberately avoids toes and webbing.
 */
export function HuddleFootprints({ earned = true, current = false, className }: HuddleFootprintsProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-end justify-center gap-1 rounded-full transition-colors',
        current && 'ring-1 ring-primary/55 ring-offset-2 ring-offset-background',
        className
      )}
    >
      <span
        className={cn(
          'block h-3.5 w-2.5 -rotate-[8deg] rounded-[60%_55%_48%_52%] border',
          earned ? 'border-foreground/15 bg-foreground/60' : 'border-border bg-muted/55'
        )}
      />
      <span
        className={cn(
          'block h-3.5 w-2.5 rotate-[8deg] rounded-[55%_60%_52%_48%] border',
          earned ? 'border-foreground/15 bg-foreground/60' : 'border-border bg-muted/55'
        )}
      />
    </span>
  )
}
