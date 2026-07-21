'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { getLang, setLang, subscribeLang, translateFor, type Lang } from './index'

const getServerLang = (): Lang => 'zh-TW'

/**
 * Subscribe a component to the current UI language.
 *
 * Every component that renders translated text must call this hook (even if
 * it only uses the returned `t`) — the subscription is what re-renders the
 * component when the user switches language. Render helpers called from a
 * subscribed component may import the plain `t` from '@/lib/i18n' instead.
 *
 * The returned `t` is bound to the subscribed lang (not the mutable global),
 * so SSR HTML and the first client render agree (both zh-TW) and the UI
 * flips to the detected language right after hydration — no mismatch.
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, getServerLang)
  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => translateFor(lang, text, vars),
    [lang]
  )
  return { lang, setLang, t }
}
