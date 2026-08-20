'use client'

/**
 * 常駐的「懸浮小視窗」啟動鈕（日曆頁右上工具列）。
 *
 * 使用者要求：不必先開計時，隨時能把置頂小視窗叫出來。開啟時回到上次
 * 停留的分頁（計時器 idle 會顯示一鍵快速開始，所以永遠有東西可看）；
 * 已開著就變成「收回」。
 *
 * 只在支援 Document PiP 的桌面瀏覽器出現（Chrome/Edge；手機與 app 殼
 * 沒有視窗概念，Safari/Firefox 沒有置頂 API——與其給一顆會失望的按鈕，
 * 不如不顯示，那些環境仍有記事本/白板的 ⇱ 退回普通小視窗）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import {
  closeFloatingHub, getHubServerState, getHubState, hubAvailable, openFloatingHub, subscribeHub,
} from '@/lib/floating-hub'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

export function HubLauncherButton({ className }: { className?: string }) {
  // hubAvailable() 讀 window，SSR 跑不得；掛載後才決定顯不顯示。
  const [available, setAvailable] = useState(false)
  useEffect(() => { setAvailable(hubAvailable()) }, [])
  const hub = useSyncExternalStore(subscribeHub, getHubState, getHubServerState)
  const { t } = useI18n()

  if (!available) return null
  const isOpen = hub.window !== null
  const text = isOpen ? t('收回懸浮小視窗') : t('懸浮小視窗（永遠置頂）')

  return (
    <button
      type="button"
      data-hub-launcher
      onClick={() => {
        // requestWindow 必須在點擊手勢的同一個 tick 發出。
        if (isOpen) closeFloatingHub()
        else void openFloatingHub(getHubState().tab)
      }}
      aria-label={text}
      title={text}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isOpen
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
        className,
      )}
    >
      <PictureInPicture2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  )
}
