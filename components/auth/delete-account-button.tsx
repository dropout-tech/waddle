'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogTrigger,
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
 * In-app account deletion (App Store Guideline 5.1.1(v)). Calls the
 * delete-account Edge Function with the user's session, then signs out and
 * returns to /login. The function permanently removes the auth user and, via
 * cascade FKs, all of their data.
 */
export function DeleteAccountButton() {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const { t, lang } = useI18n()

  async function handleDelete() {
    setDeleting(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
      if (error) {
        const detail = await error.context?.json?.().catch(() => null)
        if (detail?.error === 'apple_reauthorization_required') {
          toast.error(lang === 'en' ? 'Apple account deletion requires renewed Apple authorization. This flow is not available yet; your account has not been deleted.' : 'Apple 帳號刪除需要重新取得 Apple 授權；此流程尚未開放，帳號尚未刪除。')
          setDeleting(false)
          return
        }
        throw error
      }
      if (data?.google_revoked === false) toast.warning(lang === 'en' ? 'Account deleted. Please also remove Huddle access in Google Account security settings.' : '帳號已刪除，請另至 Google 帳號安全性設定移除 Huddle 的存取權。')
      await supabase.auth.signOut()
      router.replace('/login')
    } catch {
      // Do not log provider responses or account credentials.
      toast.error(t('刪除帳號失敗，請稍後再試'))
      setDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            'border border-destructive/30 text-destructive hover:bg-destructive/10',
          )}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('刪除帳號')}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('確定要刪除帳號嗎？')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('這會永久刪除你的帳號與所有資料（任務、行程、日記、設定），無法復原。')} {lang === 'en' ? 'Store subscriptions must be cancelled separately. Existing Google Calendar copies remain.' : '商店訂閱須另行取消；Google Calendar 上既有的行程副本將保留。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('取消')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void handleDelete()
            }}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('永久刪除')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
