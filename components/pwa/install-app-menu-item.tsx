'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Share } from 'lucide-react'
import { InkPhone } from '@/components/icons/huddle-icons'
import { useI18n } from '@/lib/i18n/react'
import {
  getInstallPrompt,
  isIOS,
  isPlainWeb,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '@/lib/pwa'

type Mode = 'hidden' | 'android' | 'ios'

const itemClass =
  'w-full min-h-11 flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors text-foreground'

/**
 * 「安裝到手機」 row for the user menu. Only on the phone website:
 *  - Android Chrome: shown once Chrome has offered an install prompt
 *    (beforeinstallprompt, captured in app/layout.tsx) → opens Chrome's dialog.
 *  - iOS (no install API): shows the Share → Add to Home Screen steps.
 * Hidden in the native apps, the desktop shell, desktop browsers, and once
 * Huddle is already running installed (display-mode: standalone).
 */
export function InstallAppMenuItem({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n()
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null)
  const [env, setEnv] = useState<{ web: boolean; standalone: boolean; ios: boolean; touch: boolean }>({
    web: false,
    standalone: true,
    ios: false,
    touch: false,
  })
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const read = () =>
      setEnv({
        web: isPlainWeb(),
        standalone: isStandalone(),
        ios: isIOS(),
        // Phones/tablets only; desktop Chrome keeps its own omnibox install icon.
        touch: window.matchMedia('(pointer: coarse), (max-width: 767px)').matches,
      })
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])

  let mode: Mode = 'hidden'
  if (env.web && !env.standalone) {
    if (env.ios) mode = 'ios'
    else if (prompt && env.touch) mode = 'android'
  }
  if (mode === 'hidden') return null

  if (mode === 'android') {
    return (
      <button
        type="button"
        role="menuitem"
        data-pwa-install="android"
        className={itemClass}
        onClick={() => {
          onDone?.()
          void promptInstall()
        }}
      >
        <InkPhone className="w-4 h-4" />
        <span>{t('安裝到手機')}</span>
      </button>
    )
  }

  return (
    <div data-pwa-install="ios">
      <button
        type="button"
        role="menuitem"
        aria-expanded={showSteps}
        className={itemClass}
        onClick={() => setShowSteps((v) => !v)}
      >
        <InkPhone className="w-4 h-4" />
        <span>{t('安裝到手機')}</span>
      </button>
      {showSteps && (
        <p className="px-4 pb-3 pl-10 text-xs leading-relaxed text-muted-foreground">
          {t('在 Safari 點下方的')}
          <Share className="mx-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          {t('「分享」，再選「加入主畫面」。')}
        </p>
      )}
    </div>
  )
}
