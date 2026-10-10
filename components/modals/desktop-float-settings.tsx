'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { canFloatOverFullscreen, floatOverFullscreenEnabled, setFloatOverFullscreenEnabled } from '@/lib/floating-window'

/** Mac 桌面版（0.1.4 起）才有：懸浮視窗要不要蓋在其他 App 的全螢幕畫面上。預設開；有 ⌘ 快捷鍵的取捨，使用者可在這裡關掉。 */
export function DesktopFloatSettings() {
  const { t } = useI18n()
  // 只在使用者打開設定後才渲染（不走伺服器端），直接讀裝置偏好即可。
  const [available] = useState(canFloatOverFullscreen)
  const [enabled, setEnabled] = useState(floatOverFullscreenEnabled)
  if (!available) return null
  return (
    <label data-float-over-fullscreen className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 cursor-pointer">
      <span className="space-y-1">
        <span className="block text-sm text-foreground">{t('懸浮視窗蓋在全螢幕 App 上')}</span>
        <span className="block text-xs text-muted-foreground">{t('其他 App 全螢幕時也看得到懸浮視窗。限制：Huddle 不在前景時，懸浮視窗裡的 ⌘C、⌘V、⌘A、⌘Z 不會作用（打字和按鈕正常）。下次打開懸浮視窗時生效。')}</span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => { setFloatOverFullscreenEnabled(e.target.checked); setEnabled(e.target.checked) }}
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-border accent-primary"
      />
    </label>
  )
}
