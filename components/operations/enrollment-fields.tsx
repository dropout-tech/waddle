'use client'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { readEnrollment, saveEnrollment } from '@/lib/operations/invites'
import { useI18n } from '@/lib/i18n/react'
export function EnrollmentFields() {
  const { t } = useI18n()
  const [referral, setReferral] = useState('')
  const [coupon, setCoupon] = useState('')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const saved = readEnrollment()
    const r = q.get('ref') || saved?.referral || ''
    const c = q.get('coupon') || saved?.coupon || ''
    setReferral(r)
    setCoupon(c)
    if (r || c) saveEnrollment(r, c)
  }, [])
  return (
    <fieldset className="my-5 space-y-3 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm">{t('推薦與優惠（選填）')}</legend>
      <div className="space-y-2">
        <Label htmlFor="signup-referral">{t('朋友的推薦碼')}</Label>
        <Input
          id="signup-referral"
          maxLength={32}
          value={referral}
          onChange={(e) => {
            setReferral(e.target.value)
            saveEnrollment(e.target.value, coupon)
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-coupon">{t('活動優惠碼')}</Label>
        <Input
          id="signup-coupon"
          maxLength={32}
          value={coupon}
          onChange={(e) => {
            setCoupon(e.target.value)
            saveEnrollment(referral, e.target.value)
          }}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('完成帳號驗證後套用。獎勵依活動開關與適用資格發放，你也可以登入後在「會員與推薦」查看。')}
      </p>
    </fieldset>
  )
}
