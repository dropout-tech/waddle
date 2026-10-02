'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/react'
import { htmlLangFor } from '@/lib/i18n'
import { BRAND_TITLE, BRAND_TITLE_EN } from '@/lib/brand'

/**
 * Keeps <html lang> and the default tab title in step with the language.
 *
 * - /en/* pages are English whatever the UI language is set to; everything
 *   else follows the UI language. (The server HTML can only carry one lang —
 *   the root layout's — so this corrects it as soon as the page runs.)
 * - Pages without their own title use the site default, which is Chinese;
 *   with the UI in English it is swapped for the English one. Next rewrites
 *   <title> on navigation, so a MutationObserver re-applies the swap.
 */
export function DocumentLanguage() {
  const pathname = usePathname()
  const { lang } = useI18n()

  useEffect(() => {
    document.documentElement.lang = htmlLangFor(lang, pathname)
  }, [lang, pathname])

  useEffect(() => {
    // /en/* pages set their own (English) titles — leave them alone.
    if (htmlLangFor('zh-TW', pathname) === 'en') return
    const fix = () => {
      if (lang === 'en' && document.title === BRAND_TITLE) document.title = BRAND_TITLE_EN
      else if (lang !== 'en' && document.title === BRAND_TITLE_EN) document.title = BRAND_TITLE
    }
    fix()
    const observer = new MutationObserver(fix)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [lang, pathname])

  return null
}
