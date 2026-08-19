import { Suspense } from 'react'
import { AuthGuard } from '@/components/auth/auth-guard'
import { FloatingNoteRoute } from './floating-note-route'

/**
 * 便條紙視窗：記事本。用 `window.open('/float/note?id=…')` 開，是一個真正的
 * 作業系統視窗——可以拖到任何位置、可以縮放、可以同時開好幾張（每張帶不同
 * 的 id，視窗名稱也不同所以不會互相取代）。
 *
 * 不會永遠置頂——瀏覽器只給「一個」置頂視窗，那個名額留給計時器。
 */
export default function FloatNote() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <FloatingNoteRoute />
      </Suspense>
    </AuthGuard>
  )
}
