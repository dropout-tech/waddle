'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import {
  readEnrollment,
  saveEnrollment,
  clearEnrollment,
} from '@/lib/operations/invites'
import { operations } from '@/lib/operations/client'
/** A single account-fenced enrollment attempt per session. No background retries
 * that could repeatedly claim rewards; failed codes stay visible for manual retry. */
export function EnrollmentBridge() {
  const { user } = useAuth()
  const attempted = useRef<string | null>(null)
  const current = useRef(user?.id)
  useEffect(() => {
    current.current = user?.id
  }, [user?.id])
  const [notice, setNotice] = useState('')
  useEffect(() => {
    setNotice('')
    if (!user) {
      attempted.current = null
      return
    }
    if (attempted.current === user.id) return
    const saved = readEnrollment()
    if (saved?.owner && saved.owner !== user.id) {
      clearEnrollment()
      return
    }
    const input =
      saved ||
      (user.user_metadata?.huddle_enrollment as
        | { referral?: string; coupon?: string }
        | undefined)
    if (!input?.referral && !input?.coupon) return
    attempted.current = user.id
    saveEnrollment(input.referral || '', input.coupon || '', user.id)
    const uid = user.id
    void (async () => {
      const pending = {
        referral: input.referral || '',
        coupon: input.coupon || '',
      }
      const failures: string[] = []
      // Coupon wins the friend trial when valid, but a bad coupon must not
      // prevent a separately valid referral from earning its reward.
      for (const [kind, action] of [
        ['coupon', 'redeem'],
        ['referral', 'refer'],
      ] as const) {
        if (current.current !== uid) return
        if (!pending[kind]) continue
        try {
          await operations(action, { code: pending[kind] })
          pending[kind] = ''
        } catch (error) {
          failures.push(
            error instanceof Error
              ? error.message
              : '優惠未能套用，請在會員頁重試。'
          )
        }
      }
      if (current.current !== uid) return
      if (pending.coupon || pending.referral)
        saveEnrollment(pending.referral, pending.coupon, uid)
      else clearEnrollment()
      setNotice(
        failures.length
          ? failures.join('；') +
              '。其他有效優惠已處理，未成功的碼可在會員頁重試。'
          : '推薦／優惠已套用，可到「會員與推薦」查看時間。'
      )
    })()
  }, [user])
  if (!notice) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-[80] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-lg"
    >
      <p className="flex-1">{notice}</p>
      <Link
        href="/membership"
        className="min-h-11 inline-flex items-center underline"
      >
        查看會員頁
      </Link>
      <button className="min-h-11 px-2" onClick={() => setNotice('')}>
        關閉
      </button>
    </div>
  )
}
