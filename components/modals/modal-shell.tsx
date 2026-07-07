'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'

/**
 * Tracks currently-mounted, open ModalShell instances in mount order, so a
 * stray Esc keypress only closes the topmost one. Today no two ModalShells
 * stack at once, but this keeps a future modal-on-modal case from having
 * both layers race to handle the same keydown.
 */
let openStack: symbol[] = []

export type ModalShellSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

/**
 * `center` — mobile full-screen sheet / desktop centered card (default).
 * `drawer` — mobile identical to `center` (same classes, same 200ms
 * fade+zoom); desktop slides in from the right edge as a full-height
 * ~520px panel, so the calendar stays visible while editing (DESIGN.md:
 * central modals are for necessary decisions only — editing prefers a
 * right drawer).
 */
export type ModalShellVariant = 'center' | 'drawer'

/** Desktop max-width buckets, matching the widths the six hand-rolled
 *  modal shells used before consolidation (sm ≈ workspace-settings,
 *  md ≈ quick-link-edit, lg ≈ task-detail/settings, xl ≈ journal,
 *  2xl ≈ calendar-export's two-pane layout — needs real estate for a
 *  controls sidebar plus a scaled schedule preview).
 *  Only used by the `center` variant — the drawer has a fixed desktop
 *  width instead. */
const SIZE_CLASS: Record<ModalShellSize, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-xl',
  '2xl': 'md:max-w-6xl',
}

/** Must cover the longest `duration-*` in each variant's exit classes.
 *  The drawer's mobile exit animation is still 200ms; tw-animate-css
 *  defaults to `animation-fill-mode: forwards`, so the panel holds its
 *  faded-out end state for the extra 100ms before unmount — no flash. */
const EXIT_DURATION_MS: Record<ModalShellVariant, number> = {
  center: 200,
  drawer: 300,
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Desktop max-width bucket (`center` variant only). Defaults to `lg`. */
  size?: ModalShellSize
  /** Desktop shape: centered card (default) or right-edge drawer. */
  variant?: ModalShellVariant
  /** Extra classes merged onto the panel — e.g. a bespoke `md:max-w-[...]`. */
  className?: string
  ariaLabel?: string
}

/**
 * Shared shell for modals and drawers: portals to `document.body`, locks
 * body scroll, closes on backdrop click or Esc (topmost instance only),
 * returns focus to whatever triggered it, and renders the mobile
 * full-screen sheet / desktop centered-card-or-right-drawer shape +
 * overlay + motion per DESIGN.md.
 *
 * Callers that keep the component mounted and just toggle `isOpen` get a
 * real exit animation (the panel stays rendered for `EXIT_DURATION_MS` after
 * `isOpen` flips false). Callers that instead conditionally render the
 * whole modal component (several call sites in this app do — e.g.
 * `{task && <TaskDetailModal ... />}`) unmount this component immediately
 * on close, same as before ModalShell existed; that's a call-site property,
 * not something this shell can compensate for without risking stale
 * internal state in components whose `useState` initializers read props
 * (e.g. a task-detail form seeded from `task.title`).
 */
export function ModalShell({
  isOpen,
  onClose,
  children,
  size = 'lg',
  variant = 'center',
  className,
  ariaLabel,
}: ModalShellProps) {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [closing, setClosing] = useState(false)
  const idRef = useRef<symbol | null>(null)
  if (idRef.current === null) idRef.current = Symbol('modal-shell')
  const triggerRef = useRef<Element | null>(null)
  const [canPortal, setCanPortal] = useState(false)

  // Portal target only exists client-side.
  useEffect(() => setCanPortal(true), [])

  // Enter immediately; on close, keep rendering for the exit animation
  // before actually unmounting.
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setClosing(false)
      return
    }
    if (!shouldRender) return
    setClosing(true)
    const t = setTimeout(() => {
      setShouldRender(false)
      setClosing(false)
    }, prefersReducedMotion() ? 0 : EXIT_DURATION_MS[variant])
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on isOpen changes
  }, [isOpen])

  // Register in the open-stack while actually mounted, so Esc knows who's on top.
  useEffect(() => {
    if (!shouldRender) return
    const id = idRef.current!
    openStack.push(id)
    return () => {
      openStack = openStack.filter((s) => s !== id)
    }
  }, [shouldRender])

  useEffect(() => {
    if (!shouldRender) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A nested layer (Radix AlertDialog/Dialog, or a hand-rolled dialog
      // that opts in the same way) already handled this Escape and called
      // preventDefault — don't also close this outer shell.
      if (e.defaultPrevented) return
      if (openStack[openStack.length - 1] !== idRef.current) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [shouldRender, onClose])

  // Focus return: remember what had focus right before opening, restore it
  // once the modal is actually gone.
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement
      return
    }
    if (!shouldRender && triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus()
      triggerRef.current = null
    }
  }, [isOpen, shouldRender])

  useBodyScrollLock(shouldRender)

  if (!canPortal || !shouldRender) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-modal flex items-stretch justify-center',
        // Drawer hugs the right edge at full height on desktop; center
        // variant keeps the centered-card position.
        variant === 'drawer' ? 'md:justify-end' : 'md:items-center'
      )}
    >
      {/* Backdrop — DESIGN.md: blur 6-8px + darken to oklch(0/0.25), no bg-black/60 wash. */}
      <div
        className={cn(
          'absolute inset-0 z-overlay bg-black/25 backdrop-blur',
          'motion-safe:duration-200 motion-safe:ease-quart',
          closing ? 'motion-safe:animate-out motion-safe:fade-out' : 'motion-safe:animate-in motion-safe:fade-in'
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — full-screen sheet on mobile; on desktop either a centered
          card (`center`) or a full-height right drawer (`drawer`). The
          mobile class set is identical across variants on purpose. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'relative z-modal flex h-[100dvh] w-full flex-col overflow-hidden bg-card',
          'motion-safe:ease-quart',
          variant === 'center' && [
            'md:h-auto md:max-h-[90dvh] md:mx-4 md:rounded-2xl md:border md:border-border md:shadow-2xl',
            'motion-safe:duration-200',
            closing
              ? 'motion-safe:animate-out motion-safe:fade-out motion-safe:zoom-out-95 pointer-events-none'
              : 'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95',
            SIZE_CLASS[size],
          ],
          variant === 'drawer' && [
            'md:w-[520px] md:rounded-l-2xl md:border-l md:border-border md:shadow-2xl',
            // 200ms fade+zoom on mobile (unchanged from center); desktop
            // overrides to a 300ms pure slide from the right — the *-100
            // utilities reset the mobile fade/zoom vars at md and up.
            'motion-safe:duration-200 md:motion-safe:duration-300',
            closing
              ? cn(
                  'motion-safe:animate-out motion-safe:fade-out motion-safe:zoom-out-95 pointer-events-none',
                  'md:motion-safe:fade-out-100 md:motion-safe:zoom-out-100 md:motion-safe:slide-out-to-right'
                )
              : cn(
                  'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95',
                  'md:motion-safe:fade-in-100 md:motion-safe:zoom-in-100 md:motion-safe:slide-in-from-right'
                ),
          ],
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
