'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/react'

/**
 * One-line consent notice under the sign-in / sign-up heading. The sentence is
 * a single translatable string with {terms} / {privacy} slots, so word order
 * can differ per language while the links stay real <a>s. Links follow the UI
 * language (zh → /terms, en → /en/terms). No purchase wording on purpose: this
 * screen is also shown inside the iOS app.
 */
export function LegalConsent({ mode }: { mode: 'signup' | 'login' }) {
  const { t, lang } = useI18n()
  const base = lang === 'en' ? '/en' : ''
  const sentence = t(mode === 'signup' ? '建立帳號即表示你同意 Huddle 的{terms}，並已閱讀{privacy}。' : '繼續即表示你同意 Huddle 的{terms}，並已閱讀{privacy}。')
  const linkClass = 'text-foreground underline underline-offset-4 hover:no-underline'
  return (
    <p className="mb-5 text-xs leading-5 text-muted-foreground" data-legal-consent>
      {sentence.split(/(\{terms\}|\{privacy\})/).map((part, i) => {
        if (part === '{terms}') return <Link key={i} href={`${base}/terms`} prefetch={false} className={linkClass}>{t('服務條款')}</Link>
        if (part === '{privacy}') return <Link key={i} href={`${base}/privacy`} prefetch={false} className={linkClass}>{t('隱私權政策')}</Link>
        return <Fragment key={i}>{part}</Fragment>
      })}
    </p>
  )
}
