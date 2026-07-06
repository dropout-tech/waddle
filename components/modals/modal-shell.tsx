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

export type ModalShellSize = 'sm' | 'md' | 'lg' | 'xl'

/** Desktop max-width buckets, matching the widths the six hand-rolled
 *  modal shells used before consolidation (sm ≈ workspace-settings,
 *  md ≈ quick-link-edit, lg ≈ task-detail/settings, xl ≈ journal). */
const SIZE_CLASS: Record<ModalShellSize, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-xl',
}

const EXIT_DURATION_MS = 200

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Desktop max-width bucket. Defaults to `lg`. */
  size?: ModalShellSize
  /** Extra classes merged onto the panel — e.g. a bespoke `md:max-w-[...]`. */
  className?: string
  ariaLabel?: string
}

/**
 * Shared shell for central modals: portals to `document.body`, locks body
 * scroll, closes on backdrop click or Esc (topmost instance only), returns
 * focus to whatever triggered it, and renders the mobile-full-screen /
 * desktop-centered-card shape + overlay + motion per DESIGN.md.
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
    }, prefersReducedMotion() ? 0 : EXIT_DURATION_MS)
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
    <div className="fixed inset-0 z-modal flex items-stretch justify-center md:items-center">
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

      {/* Panel — full-screen sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'relative z-modal flex h-[100dvh] w-full flex-col overflow-hidden bg-card',
          'md:h-auto md:max-h-[90dvh] md:mx-4 md:rounded-2xl md:border md:border-border md:shadow-2xl',
          'motion-safe:duration-200 motion-safe:ease-quart',
          closing
            ? 'motion-safe:animate-out motion-safe:fade-out motion-safe:zoom-out-95 pointer-events-none'
            : 'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95',
          SIZE_CLASS[size],
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
