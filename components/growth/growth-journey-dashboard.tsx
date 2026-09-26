'use client'

import Image from 'next/image'
import { CheckInLeaderboard } from './check-in-leaderboard'
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

// Greeting poses only (no sleeping/sliding): one is picked per page open.
const penguinPoses = ['wave', 'stand', 'carry', 'skate', 'fly'] as const
type PenguinPose = (typeof penguinPoses)[number]

function DailyCheckIn({ today }: { today: string }) {
  const { t, lang } = useI18n()
  const { status, checkedIn, isLoading, isSaving, error, reload, checkIn } = useDailyCheckIn(today)
  // Chosen after mount so server/static HTML and the first client render agree;
  // the fixed-size frame below keeps the layout from shifting when it appears.
  const [pose, setPose] = useState<PenguinPose | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPose(penguinPoses[Math.floor(Math.random() * penguinPoses.length)])
  }, [])
  const date = parseDateString(status?.check_in_date ?? today)
  const dateLabel = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(date)
  const quote = encouragements[Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) % encouragements.length]
  const ready = !!status && !isLoading && error !== 'read'

  return (
    // Bottom padding clears the floating focus-timer capsule on phones.
    <section aria-labelledby="daily-check-in-title" className="mx-auto w-full max-w-xl px-1 pb-40 pt-3 sm:px-4 sm:pt-6">
      <header className="flex items-baseline justify-between gap-3 px-1">
        <h1 id="daily-check-in-title" className="text-xl font-semibold tracking-tight">{t('每日簽到')}</h1>
        <time dateTime={status?.check_in_date ?? today} className="text-sm text-muted-foreground">{dateLabel}</time>
      </header>

      <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-6 pt-5 text-center shadow-sm sm:px-8 sm:pb-8">
        <div className="size-28 sm:size-32" aria-hidden={pose ? undefined : true}>
          {pose && (
            <Image
              src={`/art/penguin/${pose}.webp`}
              alt={t('來打招呼的小企鵝')}
              width={240} height={240}
              className="size-full object-contain dark:brightness-95"
              priority
            />
          )}
        </div>
        <p role="status" aria-live="polite" className="mt-3 max-w-xs text-lg font-semibold leading-relaxed text-balance sm:max-w-sm sm:text-xl">
          {t(checkedIn ? '今天也有好好出現，真好。' : quote)}
        </p>

        {checkedIn ? (
          <p className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-secondary px-6 text-base font-semibold text-secondary-foreground">
            <Check className="size-4" aria-hidden="true" />
            {t('今天已簽到')}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void checkIn()}
            disabled={isLoading || isSaving || error === 'read'}
            className="mt-5 inline-flex min-h-12 min-w-48 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card disabled:cursor-default disabled:opacity-60 motion-reduce:transition-none"
          >
            {(isLoading || isSaving) && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
            {t(isLoading ? '正在讀取簽到紀錄…' : isSaving ? '正在保存…' : '簽到，開始今天')}
          </button>
        )}

        {error && (
          <div role="alert" className="mt-3 text-sm text-foreground">
            <p>{t(error === 'read' ? '簽到紀錄暫時讀不到，請再試一次。' : '今天的簽到還沒存好，請再按一次。')}</p>
            {error === 'read' && <button type="button" onClick={() => void reload()} className="mt-1 min-h-11 rounded-lg px-4 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('重新讀取')}</button>}
          </div>
        )}

        <p className="mt-4 min-h-6 text-sm text-muted-foreground" aria-live="polite">
          {ready && <>
            {t('累積')} <span className="font-semibold tabular-nums text-foreground">{t('{n} 分', { n: status.total_points })}</span>
            <span aria-hidden="true" className="mx-2">·</span>
            {t(checkedIn ? '今日 +{n} 已入帳' : '簽到 +{n} 分', { n: status.daily_points })}
          </>}
        </p>
      </div>

      <p className="mt-3 px-1 text-center text-xs leading-5 text-muted-foreground">{t('每天一小步，慢慢累積。每日台北時間 00:00 換日。')}</p>

      <CheckInLeaderboard score={status?.total_points} />
    </section>
  )
}
