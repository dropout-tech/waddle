import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // duration-200 + ease-quart: brand feedback timing (DESIGN.md Motion) so
  // hover/active changes glide instead of snapping. No scale — no bounce.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-quart disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Primary hover was a barely-visible 10% opacity dip (W2.5): add a
        // slight brightness lift + soft shadow on hover, and a matching
        // press-down on active, so the terracotta CTA visibly responds.
        default:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:brightness-[1.04] hover:shadow-md hover:shadow-primary/25 active:brightness-[0.96] active:shadow-none',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-ring/40 active:bg-accent/70 dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-9 px-4 py-2 has-[>svg]:px-3 relative before:content-[""] before:absolute before:inset-0 before:-my-1 md:before:hidden',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 relative before:content-[""] before:absolute before:inset-0 before:-my-1.5 md:before:hidden',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9 relative before:content-[""] before:absolute before:inset-0 before:-m-1 md:before:hidden',
        'icon-sm':
          'size-8 relative before:content-[""] before:absolute before:inset-0 before:-m-1.5 md:before:hidden',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
