'use client'

import { useState } from 'react'
import { prepareSignOut, completeSignOut } from '@/lib/auth/sign-out'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/lib/i18n/react'

/**
 * Sign-out that never silently drops unsynced notes: pending writes are sent
 * first; if some notebook text still only exists on this device, the user is
 * asked before it is discarded. Render `dialog` somewhere in the component.
 */
export function useSafeSignOut(afterSignOut?: () => void) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<{ userId: string | null; unsynced: number } | null>(null)

  const finish = async (userId: string | null) => {
    setAsking(null)
    await completeSignOut(userId)
    afterSignOut?.()
  }

  const requestSignOut = async () => {
    if (busy) return
    setBusy(true)
    const state = await prepareSignOut()
    if (state.unsynced > 0) {
      setAsking(state)
      return
    }
    await finish(state.userId)
  }

  const dialog = (
    <AlertDialog
      open={!!asking}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(null)
          setBusy(false)
        }
      }}
    >
      <AlertDialogContent data-unsynced-signout>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('還有筆記沒有同步')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('有 {count} 則筆記還沒同步，現在登出這些內容會遺失。建議連上網路、等同步完成再登出。', {
              count: asking?.unsynced ?? 0,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('先不要登出')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void finish(asking?.userId ?? null)
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t('仍要登出')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { requestSignOut, busy, dialog }
}
