import { WaddleMascot } from '@/components/branding/waddle-mascot'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-background via-background to-muted/40 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <WaddleMascot withBackground className="w-11 h-11 shadow-sm rounded-xl" />
          <div className="flex flex-col">
            <span className="text-xl font-semibold tracking-tight">Waddle</span>
            <span className="text-xs text-muted-foreground">慢慢搖擺，把事情做完</span>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
