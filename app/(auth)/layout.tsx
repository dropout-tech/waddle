import { WaddleMascot } from '@/components/branding/waddle-mascot'
import { RedirectIfAuthed } from '@/components/auth/redirect-if-authed'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Vertical rhythm: geometric centering left a dead ~130px band under the
    // card (logo anchors the top, nothing answers it below). The 2:3 flex
    // spacers lift the card slightly above center, and the slogan — moved
    // out of the cramped logo lockup — closes the composition at the bottom.
    <main className="min-h-dvh w-full bg-gradient-to-br from-background via-background to-muted/40 flex flex-col items-center px-4">
      <RedirectIfAuthed />
      <div aria-hidden className="min-h-8 flex-[2]" />
      <div className="w-full max-w-md">
        {/* Brand — single-line lockup; the slogan lives at the page foot now. */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <WaddleMascot withBackground className="w-11 h-11 shadow-sm rounded-xl" />
          <span className="text-xl font-semibold tracking-tight">Huddle</span>
        </div>
        {children}
      </div>
      <div aria-hidden className="min-h-6 flex-[3]" />
      {/* Full-strength muted token (no /70): the slogan must still clear
          WCAG AA on both cream and charcoal backgrounds. */}
      <p className="pb-6 text-xs text-muted-foreground">慢慢搖擺，把事情做完</p>
    </main>
  )
}
