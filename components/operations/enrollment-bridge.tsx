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
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/react'

/** A network/connectivity failure is worth retrying (the code may still be
 * valid once the connection comes back); anything else is a business-rule
 * rejection from huddle_operations (expired, already used, not found, etc.)
 * and resending the same code will never succeed. */
function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : String(error)
  return /fetch|network|internet|offline|timeout|econn|load failed/i.test(
    message
  )
}

/** A single account-fenced enrollment attempt per session. No background retries
 * that could repeatedly claim rewards; failed codes stay visible for manual retry.
 *
 * The referral/coupon code a user signs up with is captured once into
 * auth user_metadata (huddle_enrollment) at signup time, as a fallback for
 * when localStorage is unavailable or gets cleared before the redeem call
 * runs. That metadata is never touched by Supabase after signup, so once we
 * have finished processing a code (success, or a permanent/business
 * rejection) we clear it from user_metadata too — otherwise every remount
 * (e.g. a page refresh, which resets the `attempted` ref) re-reads the same
 * stale code from metadata and resubmits it, showing the user a repeat
 * "code applied" notice or a repeat expired/used error forever. Only a
 * transient (network) failure leaves the metadata in place so it can retry. */
export function EnrollmentBridge() {
  const { t } = useI18n()
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
      let anyTransient = false
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
          if (isTransientError(error)) {
            // Network hiccup — keep the code so localStorage/metadata retry
            // it next time instead of throwing away a possibly-valid code.
            anyTransient = true
          } else {
            // Business rejection (expired/used/not found/etc.) — permanent,
            // stop offering this code for automatic retry.
            pending[kind] = ''
            failures.push(
              error instanceof Error
                ? error.message
                : t('優惠未能套用，請在會員頁重試。')
            )
          }
        }
      }
      if (current.current !== uid) return
      if (pending.coupon || pending.referral)
        saveEnrollment(pending.referral, pending.coupon, uid)
      else clearEnrollment()
      // Once we're done retrying (no transient failure left outstanding),
      // clear the signup-time snapshot from user_metadata so a future
      // remount (e.g. refresh) doesn't re-read and resubmit the same code.
      if (!anyTransient && user.user_metadata?.huddle_enrollment) {
        try {
          const supabase = createClient()
          await supabase.auth.updateUser({
            data: { huddle_enrollment: null },
          })
        } catch {
          /* Best effort — attempted.current still blocks a resend within
           * this session even if the metadata write itself failed. */
        }
      }
      setNotice(
        failures.length
          ? failures.join('；') +
              t('。其他有效優惠已處理，未成功的碼可在會員頁重試。')
          : t('推薦／優惠已套用，可到「會員與推薦」查看時間。')
      )
    })()
  }, [user, t])
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
        {t('查看會員頁')}
      </Link>
      <button className="min-h-11 px-2" onClick={() => setNotice('')}>
        {t('關閉')}
      </button>
    </div>
  )
}
