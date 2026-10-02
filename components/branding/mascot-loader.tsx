'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { useI18n } from '@/lib/i18n/react'

interface MascotLoaderProps {
  /**
   * Replaces the default "spinner + 載入中..." line, e.g. a load-error message
   * with a retry button. Pass `still` too so the penguin stops bobbing.
   */
  children?: ReactNode
  /** Stop the bobbing animation (used when the screen is no longer loading). */
  still?: boolean
}

/**
 * Full-screen "penguin is loading" screen shared by AuthGuard (session check)
 * and the main page (first data load), so both waits look identical.
 */
export function MascotLoader({ children, still = false }: MascotLoaderProps) {
  const { t } = useI18n()
  return (
    <main className="h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <HuddleMascot className={still ? 'w-20 h-20' : 'w-20 h-20 animate-waddle-bob'} />
        {children ?? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('載入中...')}</span>
          </div>
        )}
      </div>
    </main>
  )
}
