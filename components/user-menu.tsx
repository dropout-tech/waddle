'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, Mail, User, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

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
}

export function UserMenu({ className }: UserMenuProps = {}) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.auth.getUser().then(({ data: { user } }) => {
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

    return () => { cancelled = true }
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    // Use the POST /auth/signout route so cookies clear correctly
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  if (!session) return null

  const initials = (session.displayName || '?').slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className={className ?? 'fixed top-3 right-3 z-50'}>
      <button
        data-tour="user-menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-full',
          'bg-card border border-border shadow-sm',
          'hover:bg-muted/60 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-label="使用者選單"
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
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-64',
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
                  <User className="w-4 h-4" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {session.displayName}
                </span>
                <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {session.email}
                </span>
              </div>
            </div>
          </div>

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
              <LogOut className="w-4 h-4" />
            )}
            <span>登出</span>
          </button>
        </div>
      )}
    </div>
  )
}
