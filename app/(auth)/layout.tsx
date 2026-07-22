'use client'

import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { RedirectIfAuthed } from '@/components/auth/redirect-if-authed'
import { useI18n } from '@/lib/i18n/react'
import { cn } from '@/lib/utils'

// Low-key language switch — one of the entry points for a first-time visitor
// to pick English before they even sign in (the full picker lives in
// Settings for signed-in users). Toggles directly; no dropdown needed for
// two languages.
function LanguageToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'en' ? 'zh-TW' : 'en')}
      aria-label={t('切換語言')}
      className={cn(
        'fixed top-4 right-4 z-50 min-h-11 min-w-11 px-3.5 py-2 rounded-full',
        'bg-card/80 border border-border backdrop-blur-sm shadow-sm',
        'text-xs font-medium text-muted-foreground',
        'hover:bg-muted/60 hover:text-foreground transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {lang === 'en' ? '中文' : 'EN'}
    </button>
  )
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    // Vertical rhythm: geometric centering left a dead ~130px band under the
    // card (logo anchors the top, nothing answers it below). The 2:3 flex
    // spacers lift the card slightly above center, and the slogan — moved
    // out of the cramped logo lockup — closes the composition at the bottom.
    <main className="min-h-dvh w-full bg-gradient-to-br from-background via-background to-muted/40 flex flex-col items-center px-4">
      <RedirectIfAuthed />
      <LanguageToggle />
      <div aria-hidden className="min-h-8 flex-[2]" />
      <div className="w-full max-w-md">
        {/* Brand — single-line lockup; the slogan lives at the page foot now. */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <HuddleMascot withBackground className="w-11 h-11 shadow-sm rounded-xl" />
          <span className="text-xl font-semibold tracking-tight">Huddle</span>
        </div>
        {children}
      </div>
      <div aria-hidden className="min-h-6 flex-[3]" />
      {/* Full-strength muted token (no /70): the slogan must still clear
          WCAG AA on both cream and charcoal backgrounds. */}
      <p className="pb-6 text-xs text-muted-foreground">{t('慢慢搖擺，把事情做完')}</p>
    </main>
  )
}
