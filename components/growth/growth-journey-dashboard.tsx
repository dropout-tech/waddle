'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { useDailyCheckIn } from '@/hooks/use-daily-check-in'
import { parseDateString } from '@/lib/calendar-utils'
import { checkInDate } from '@/lib/daily-check-in'
import { useI18n } from '@/lib/i18n/react'

const encouragements = [
  '只要願意開始，接下來就慢慢來。',
  '不用一下子做到很多，一小步也算數。',
  '今天的你，照自己的步調就很好。',
  '先做一點點，事情就會一點一點往前。',
  '休息過後，隨時都可以重新開始。',
  '不必等準備好，從做得到的小事開始。',
  '願意為自己留一點時間，就是很好的開始。',
]

export function GrowthJourneyDashboard() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [today, setToday] = useState(() => checkInDate())
  useEffect(() => {
    const refresh = () => setToday(checkInDate())
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (loading) return <p role="status" className="py-16 text-center text-muted-foreground">{t('正在讀取簽到紀錄…')}</p>
  if (!user) return <p className="py-16 text-center text-muted-foreground">{t('登入後，就能保存每天的簽到。')}</p>
  // Remount on account/date changes so late responses cannot cross either boundary.
  return <DailyCheckIn key={`${user.id}:${today}`} today={today} />
}

function DailyCheckIn({ today }: { today: string }) {
  const { t, lang } = useI18n()
  const { status, checkedIn, isLoading, isSaving, error, reload, checkIn } = useDailyCheckIn(today)
  const date = parseDateString(status?.check_in_date ?? today)
  const dateLabel = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(date)
  const quote = encouragements[Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % encouragements.length]

  return (
    <section aria-labelledby="daily-check-in-title" className="mx-auto flex w-full max-w-2xl flex-col items-center px-2 pb-28 pt-5 text-center sm:px-8 sm:pt-6">
      <h1 id="daily-check-in-title" className="text-2xl font-semibold tracking-tight">{t('每日簽到')}</h1>
      <time dateTime={status?.check_in_date ?? today} className="mt-3 text-sm text-muted-foreground">{dateLabel}</time>
      <Image
        src="/growth/check-in-penguins.png"
        alt={t('三隻陪你慢慢前進的小企鵝')}
        width={1792} height={896}
        className="my-5 h-auto w-full max-w-sm sm:my-6"
        priority
      />
      <div role="status" aria-live="polite" className="min-h-20">
        <h2 className="text-xl font-semibold leading-relaxed text-balance sm:text-2xl">
          {t(checkedIn ? '今天也有好好出現，真好。' : quote)}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {t(checkedIn ? '這一小步已經收好了，接下來照自己的步調走。' : '來打個招呼，替今天留下一個小小的開始。')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void checkIn()}
        disabled={isLoading || isSaving || checkedIn || error === 'read'}
        className="mt-6 inline-flex min-h-12 min-w-44 items-center justify-center gap-2 rounded-xl bg-secondary px-7 py-3 text-base font-semibold text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none"
      >
        {(isLoading || isSaving) && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
        {checkedIn && <Check className="size-4" aria-hidden="true" />}
        {t(isLoading ? '正在讀取簽到紀錄…' : isSaving ? '正在保存…' : checkedIn ? '今天已簽到' : '簽到，開始今天')}
      </button>
      {error && (
        <div role="alert" className="mt-4 text-sm text-foreground">
          <p>{t(error === 'read' ? '簽到紀錄暫時讀不到，請再試一次。' : '今天的簽到還沒存好，請再按一次。')}</p>
          {error === 'read' && <button type="button" onClick={() => void reload()} className="mt-1 min-h-11 rounded-lg px-4 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('重新讀取')}</button>}
        </div>
      )}
      {status && !isLoading && error !== 'read' && (
        <div className="mt-5 space-y-3 text-sm" aria-live="polite">
          <p className="text-muted-foreground">{t(checkedIn ? '今日簽到積分已入帳' : '每日簽到可獲得 {n} 分', { n: status.daily_points })}</p>
          <p className="font-medium">{t('累積分數 {n} 分', { n: status.total_points })}</p>
        </div>
      )}
      <p className="mt-5 max-w-sm text-xs leading-6 text-muted-foreground">{t('每天一小步，慢慢累積。分數將作為未來排行的依據。')}</p>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">{t('每日以台北時間 00:00 更新。')}</p>
      <p className="mt-7 text-sm leading-6 text-muted-foreground">{t('偶爾停一下也沒關係，小企鵝一直都在。')}</p>
    </section>
  )
}
