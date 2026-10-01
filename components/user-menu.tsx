'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { operations } from '@/lib/operations/client'
import type { Membership } from '@/lib/operations/types'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Loader2 } from 'lucide-react'
// Every icon in this menu is the Huddle hand-inked set (DESIGN.md → 圖示);
// only the sign-out spinner stays lucide (it's a loading state, not an icon).
import {
  InkStickyNote, InkPlus, InkArchive, InkUser, InkMail, InkGift, InkDocument, InkClipboard, InkBuilding,
  InkSun, InkMoon, InkLogOut,
} from '@/components/icons/huddle-icons'
import { createClient } from '@/lib/supabase/client'
import { signOutAndClearLocalData } from '@/lib/auth/sign-out'
import { cn } from '@/lib/utils'
import { AccountRegistrationDate } from '@/components/auth/account-registration-date'
import { useI18n } from '@/lib/i18n/react'
import { useStickyNotesToggle } from '@/components/sticky-notes/sticky-notes-provider'
import { listAssignments } from '@/lib/assignments'
import { InstallAppMenuItem } from '@/components/pwa/install-app-menu-item'

interface SessionInfo {
  email: string
  displayName: string
  avatarUrl: string | null
}

interface UserMenuProps {
  /**
   * Override the wrapper className. The default places the menu floating
   * at the top-right of the viewport; pass any other className (e.g.
   * "relative") to render it inline alongside other header buttons —
   * the mobile layout uses this so the avatar doesn't overlap content.
   */
  className?: string
  /** Controlled open state (mobile calendar header opens it from ⋯). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Render only the dropdown, no avatar button. */
  hideTrigger?: boolean
}

export function UserMenu({ className, open: controlledOpen, onOpenChange, hideTrigger = false }: UserMenuProps = {}) {
  const router = useRouter()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [publicAlias, setPublicAlias] = useState<string | null>(null)
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const setOpen = useCallback((next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    if (onOpenChange) onOpenChange(value)
    else setInnerOpen(value)
  }, [open, onOpenChange])
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useI18n()
  const stickyNotes = useStickyNotesToggle()
  // next-themes resolves the theme only on the client; gate the toggle's
  // label/icon on mount so SSR and first render don't disagree.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    // Display-only (email, name, avatar): the locally stored session is
    // enough, so skip the extra /auth/v1/user round trip on every load.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (cancelled || !user) return
      setSession({
        email: user.email ?? '',
        displayName:
          (user.user_metadata?.name as string | undefined) ||
          (user.user_metadata?.full_name as string | undefined) ||
          (user.email?.split('@')[0] ?? 'User'),
        avatarUrl:
          (user.user_metadata?.avatar_url as string | undefined) ||
          (user.user_metadata?.picture as string | undefined) ||
          null,
      })
    })

    operations<Membership>('self').then(data => {
      if (!cancelled) setPublicAlias(data.member.alias)
    }).catch(() => { /* Retain incumbent account menu until operations is enabled. */ })
    return () => { cancelled = true }
  }, [])

  // Assignment count (to-do assigned to me + my returned tasks). Fetched only
  // when the menu opens, so closed-menu page loads cost nothing.
  const [assignmentCount, setAssignmentCount] = useState(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    listAssignments().then((rows) => {
      if (cancelled) return
      setAssignmentCount(rows.filter((a) => (a.role === 'assignee' && !a.isCompleted) || (a.role === 'assigner' && a.status === 'returned')).length)
    }).catch(() => { /* feature not enabled yet — keep 0 */ })
    return () => { cancelled = true }
  }, [open])

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      // Give focus back to the avatar button when it had moved into the menu.
      if (ref.current?.contains(document.activeElement)) {
        ref.current.querySelector<HTMLElement>('[data-tour="user-menu"]')?.focus()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, setOpen])

  async function handleSignOut() {
    setSigningOut(true)
    // Client-side sign-out works on both web and the Capacitor WebView (there
    // is no server route to POST to under static export). Clears the local
    // session, then the AuthGuard / login redirect takes over.
    await signOutAndClearLocalData()
    router.replace('/login')
  }

  if (!session) return null

  const initials = (publicAlias || session.displayName || '?').slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className={className ?? 'fixed top-3 right-3 z-50'}>
      {!hideTrigger && <button
        data-tour="user-menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-full',
          'bg-card border border-border shadow-sm',
          'hover:bg-muted/60 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label={t('使用者選單')}
        aria-expanded={open}
      >
        {session.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold text-foreground">{initials}</span>
        )}
      </button>}

      {open && (
        <div
          className={cn(
            // Top-right anchored, but with z-popover so it stacks above
            // calendar grid + workspace pills that come later in DOM order.
            // Without this, on mobile the dropdown was being painted UNDER
            // sibling content, leaving the menu items unreadable / unclickable.
            'absolute right-0 mt-2 w-64 z-popover',
            'bg-card border border-border rounded-xl shadow-lg overflow-hidden',
            'animate-in fade-in slide-in-from-top-2 duration-150'
          )}
          role="menu"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              {session.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.avatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <InkUser className="w-4 h-4" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {publicAlias || session.displayName}
                </span>
                <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <InkMail className="w-3.5 h-3.5 -m-px" />
                  {session.email}
                </span>
              </div>
            </div>
            <AccountRegistrationDate />
          </div>

          <div className="border-t border-border" />

          <Link href="/membership" role="menuitem" className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/60" onClick={() => setOpen(false)}><InkGift className="h-4 w-4" />{t('會員與推薦')}</Link>
          <button
            onClick={() => { setOpen(false); router.push('/meetings') }}
            className="w-full min-h-11 flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
            role="menuitem"
          >
            <InkDocument className="w-4 h-4" />
            <span>{t('會議轉任務')}</span>
          </button>

          <button
            onClick={() => { setOpen(false); router.push('/assignments') }}
            className="w-full min-h-11 flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
            role="menuitem"
          >
            <InkClipboard className="w-4 h-4" />
            <span className="flex-1 text-left">{t('指派任務')}</span>
            {assignmentCount > 0 && (
              <span data-testid="assignment-count" className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {assignmentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setOpen(false); router.push('/org') }}
            className="w-full min-h-11 flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground"
            role="menuitem"
          >
            <InkBuilding className="w-4 h-4" />
            <span>{t('組織')}</span>
          </button>

          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={cn(
              'w-full flex items-center gap-2 px-4 py-2.5 text-sm',
              'hover:bg-muted/60 transition-colors text-foreground'
            )}
            role="menuitemcheckbox"
            aria-checked={isDark}
          >
            {isDark ? <InkSun className="w-4 h-4" /> : <InkMoon className="w-4 h-4" />}
            <span>{isDark ? t('切換淺色') : t('切換深色')}</span>
          </button>

          {/* Phone website only; renders nothing when installed / native / desktop. */}
          <InstallAppMenuItem onDone={() => setOpen(false)} />

          <div className="border-t border-border" />

          {/* 便條紙開關（貼在玻璃層，跨頁共用，見 sticky-notes-provider.tsx）。
              「新增便條紙」只在開著的時候顯示，避免使用者以為關著也能加。 */}
          <button
            data-tour="sticky-notes-toggle"
            onClick={() => stickyNotes.toggle()}
            className={cn(
              'w-full min-h-11 flex items-center gap-2 px-4 py-2.5 text-sm',
              'hover:bg-muted/60 transition-colors text-foreground'
            )}
            role="menuitemcheckbox"
            aria-checked={stickyNotes.enabled}
          >
            <InkStickyNote className="w-4 h-4" />
            <span>{stickyNotes.enabled ? t('隱藏便條紙') : t('顯示便條紙')}</span>
          </button>
          {stickyNotes.enabled && (
            <button
              onClick={() => { setOpen(false); stickyNotes.addNote() }}
              className="w-full min-h-11 flex items-center gap-2 px-4 py-2.5 pl-10 text-sm hover:bg-muted/60 transition-colors text-foreground"
              role="menuitem"
            >
              <InkPlus className="w-4 h-4" />
              <span>{t('新增便條紙')}</span>
            </button>
          )}
          <button
            data-sticky-drawer-trigger
            onClick={() => { setOpen(false); stickyNotes.toggleDrawer() }}
            className="w-full min-h-11 flex items-center gap-2 px-4 py-2.5 pl-10 text-sm hover:bg-muted/60 transition-colors text-foreground"
            role="menuitem"
          >
            <InkArchive className="w-4 h-4" />
            <span>{t('便條紙收納')}</span>
          </button>

          <div className="border-t border-border" />

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className={cn(
              'w-full flex items-center gap-2 px-4 py-2.5 text-sm',
              'hover:bg-muted/60 transition-colors',
              'text-foreground disabled:opacity-50'
            )}
          >
            {signingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <InkLogOut className="w-4 h-4" />
            )}
            <span>{t('登出')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
