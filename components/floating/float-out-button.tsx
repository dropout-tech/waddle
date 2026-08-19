'use client'

/**
 * 「彈出成便條紙」按鈕。
 *
 * 優先開**懸浮工作站**（Document PiP，永遠置頂、切到別的軟體也不被蓋住）
 * 的對應分頁——這是使用者要的主行為。瀏覽器不支援 PiP（Safari/Firefox）
 * 才退回一般 `window.open` 小視窗（可拖可縮放，但會被蓋住）。
 *
 * 在沒有視窗概念的環境（手機、Capacitor 殼）不渲染任何東西。
 */
import { useEffect, useState } from 'react'
import { PanelTopOpen } from 'lucide-react'
import { canFloat, openPopupWindow } from '@/lib/floating-window'
import { hubAvailable, openFloatingHub, type HubTab } from '@/lib/floating-hub'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/react'

export function FloatOutButton({
  tab,
  noteId,
  fallbackUrl,
  windowName,
  width = 420,
  height = 560,
  label,
  className,
}: {
  /** 懸浮工作站要開的分頁。 */
  tab: Extract<HubTab, 'note' | 'scratchpad'>
  /** tab='note' 時鎖定的筆記。 */
  noteId?: string
  /** PiP 不支援時退回的普通小視窗網址，例如 `/float/note?id=abc`。 */
  fallbackUrl: string
  /** 退回路徑用：同名視窗會被重用（同一則筆記不會開出兩張）。 */
  windowName: string
  width?: number
  height?: number
  /** 覆寫 aria-label / tooltip 文案。 */
  label?: string
  className?: string
}) {
  // canFloat() 讀 window，SSR 時不能跑；掛載後才決定顯不顯示。
  const [available, setAvailable] = useState(false)
  useEffect(() => { setAvailable(canFloat()) }, [])
  const { t } = useI18n()

  if (!available) return null
  const text = label ?? t('彈出成便條紙（懸浮在最上層）')

  return (
    <button
      type="button"
      data-float-out
      onClick={() => {
        // PiP 的 requestWindow 必須發生在點擊手勢裡，判斷放同一個 tick。
        if (hubAvailable()) void openFloatingHub(tab, { noteId })
        else openPopupWindow(fallbackUrl, { width, height, name: windowName })
      }}
      aria-label={text}
      title={text}
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground',
        'transition-colors hover:bg-secondary hover:text-foreground',
        className,
      )}
    >
      <PanelTopOpen className="h-4 w-4" />
    </button>
  )
}
