import { AuthGuard } from '@/components/auth/auth-guard'
import { FloatingScratchpad } from '@/components/floating/floating-scratchpad'

/**
 * 便條紙視窗：專注白板。跟 /float/note 一樣是普通的獨立小視窗
 * （可拖、可縮放、可同時開多個），不置頂。
 */
export default function FloatScratchpad() {
  return (
    <AuthGuard>
      <FloatingScratchpad />
    </AuthGuard>
  )
}
