'use client'

import { useAuth } from './auth-provider'
import { useI18n } from '@/lib/i18n/react'

export function AccountRegistrationDate() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const date = user?.created_at ? new Date(user.created_at) : null
  if (!date || Number.isNaN(date.getTime())) return null
  const label = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date)
  return <p className="mt-3 text-xs leading-5 text-muted-foreground">{t('註冊日期')}：<time dateTime={user?.created_at}>{label}</time></p>
}
