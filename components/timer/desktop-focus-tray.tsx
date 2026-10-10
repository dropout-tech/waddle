'use client'

/**
 * 桌面版（Mac）選單列的專注倒數：「專注 24:59」。
 *
 * 只在開始／暫停／繼續／結束時把牆鐘資料（startedAt / pausedMs / pausedAt）
 * 交給 Electron 主程式，每秒的跳字由主程式自己算（desktop/focus-tray.cjs），
 * 不吃 React 的 tick。網頁版與 iOS 沒有 huddleDesktop.setFocusStatus，什麼都不做。
 */
import { useEffect } from 'react'
import { useFocusTimer } from './focus-timer-provider'
import { useI18n } from '@/lib/i18n/react'

export function DesktopFocusTray() {
  const { state, session } = useFocusTimer()
  const { t } = useI18n()

  useEffect(() => {
    const send = typeof window === 'undefined' ? undefined : window.huddleDesktop?.setFocusStatus
    if (!send) return
    const active = session && state !== 'idle'
    const prefix = !active ? ''
      : state === 'completed' ? (session.phase === 'break' ? t('休息結束') : t('完成'))
      : state === 'paused' ? t('已暫停')
      : session.phase === 'break' ? t('休息') : t('專注')
    // 只有主視窗會被主程式接受；便條紙等子視窗也會掛這個元件，被拒絕就算了。
    send(active ? {
      state: state as 'running' | 'paused' | 'completed',
      mode: session.mode,
      startedAt: session.startedAt.getTime(),
      pausedMs: session.pausedMs,
      pausedAt: session.pausedAt ? session.pausedAt.getTime() : null,
      targetSeconds: Math.min(86400, Math.max(0, session.targetSeconds || 0)),
      prefix,
    } : null).catch(() => {})
  }, [state, session, t])

  // 離開頁面（重新整理、登出換頁）時收掉，主程式另有 did-navigate 兜底。
  useEffect(() => () => { void window.huddleDesktop?.setFocusStatus?.(null).catch(() => {}) }, [])

  return null
}
