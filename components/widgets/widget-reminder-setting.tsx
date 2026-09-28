'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { isNative } from '@/lib/platform'
import { disableWidgetReminders, enableWidgetReminders, widgetRemindersEnabled } from '@/lib/widgets/reminders'

/**
 * Settings rows for the iPhone home-screen widgets: the 背景提醒 switch
 * (system notifications when a focus session ends / water is due, even with
 * Huddle closed — moved here from the old /widgets gallery) and a link to the
 * /widgets how-to. Renders nothing on web / desktop.
 */
export function WidgetReminderSetting() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [native, setNative] = useState(false)
  const [on, setOn] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setNative(isNative()) }, [])
  useEffect(() => { if (user) setOn(widgetRemindersEnabled(user.id)) }, [user])
  if (!native || !user) return null
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1 pr-4">
          <div className="text-sm text-foreground">{t('背景提醒')}</div>
          <div className="text-xs text-muted-foreground">{t('專注結束、該喝水時，就算 Huddle 沒開著也會用系統通知提醒你')}</div>
        </div>
        <input
          type="checkbox"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked
            setMessage('')
            if (next) {
              const ok = await enableWidgetReminders(user.id)
              setOn(ok)
              if (!ok) setMessage(t('尚未允許通知，請至系統設定開啟'))
            } else {
              disableWidgetReminders(user.id)
              setOn(false)
            }
            window.dispatchEvent(new Event('huddle-widget-refresh'))
          }}
          className="w-4 h-4 rounded border-border accent-primary"
        />
      </label>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      <Link href="/widgets/" className="inline-block text-xs text-primary underline underline-offset-2">
        {t('把 Huddle 小工具加到主畫面')}
      </Link>
    </div>
  )
}
