'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { desktopNotificationsEnabled, notifyDesktop, setDesktopNotificationsEnabled } from '@/lib/desktop-notifications'

export function DesktopNotificationSettings() {
  const { lang } = useI18n()
  const en = lang === 'en'
  const [desktop, setDesktop] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setDesktop(!!window.huddleDesktop?.isDesktop); setEnabled(desktopNotificationsEnabled()) }, [])
  if (!desktop) return null
  return <div className="space-y-2 rounded-lg border border-border p-3">
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm">{en ? 'Desktop system notifications' : '桌面系統通知'}</span>
      <input type="checkbox" checked={enabled} onChange={async e => {
        const next = e.target.checked
        if (next) {
          const status = await window.huddleDesktop?.notificationStatus?.().catch(() => null)
          if (!status?.supported) { setMessage(en ? 'Update the desktop app, or check whether your system supports notifications.' : '請更新桌面版，或確認系統支援通知。'); return }
        }
        setDesktopNotificationsEnabled(next); setEnabled(next); setMessage('')
      }} />
    </label>
    <p className="text-xs text-muted-foreground">{en ? 'Meeting reminders follow your lead time below; water reminders follow their switch. Focus completion is also included. Works while the app window is open or minimized. Closing the window, quitting or sleeping stops checks. Allow Huddle in system notification settings; Focus mode may silence alerts.' : '會議依下方提前時間、喝水依喝水開關通知，也包含專注完成。視窗開啟或最小化時運作；關閉視窗、退出或電腦睡眠後不會持續檢查。請在系統通知設定允許 Huddle；勿擾模式可能隱藏提醒。'}</p>
    {enabled && <button type="button" className="text-xs underline" onClick={async () => {
      const submitted = await notifyDesktop({ kind: 'test', id: String(Date.now()), title: 'Huddle', body: en ? 'Desktop notifications test' : '桌面通知測試' })
      const status = await window.huddleDesktop?.notificationStatus?.().catch(() => null)
      setMessage(submitted && !status?.lastError ? (en ? 'Sent to the system. If no alert appears, check system settings; delivery cannot be confirmed here.' : '已交給系統。若沒看到通知，請檢查系統設定；這裡無法確認是否已顯示。') : (en ? 'Could not send. Check your system notification settings and use the signed desktop release.' : '無法送出，請檢查系統通知設定，並使用已簽署的桌面版本。'))
    }}>{en ? 'Send test notification' : '發送測試通知'}</button>}
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </div>
}
