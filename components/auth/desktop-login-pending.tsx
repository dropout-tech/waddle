'use client'
import { isDesktop } from '@/lib/platform'
import { cancelDesktopOAuth } from '@/lib/auth/desktop-oauth'
export function DesktopLoginPending({ active }: { active: boolean }) {
  if (!active || !isDesktop()) return null
  return <div role="status" className="my-3 text-center text-sm text-muted-foreground">
    <p>請在瀏覽器完成登入，再選擇「開啟 Huddle」。</p>
    <button type="button" className="mt-2 min-h-11 underline" onClick={() => void cancelDesktopOAuth()}>取消登入並重試</button>
  </div>
}
