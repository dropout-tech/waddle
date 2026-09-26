'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { leaderboardCode, type CheckInRanking } from '@/lib/daily-check-in'
import { useI18n } from '@/lib/i18n/react'
import { cn } from '@/lib/utils'

export function CheckInLeaderboard({ score }: { score: number | undefined }) {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<CheckInRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let request = 0
    const refresh = async () => {
      const id = ++request
      setLoading(true)
      setFailed(false)
      try {
        const { data, error } = await supabase.rpc('get_check_in_leaderboard')
        if (!active || id !== request) return
        if (error?.code === 'PGRST202') { setUnavailable(true); return }
        setUnavailable(false)
        if (error || !data) { setFailed(true); return }
        setRows(data)
      } catch { if (active && id === request) setFailed(true) }
      finally { if (active && id === request) setLoading(false) }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [supabase, score, attempt])
  const own = rows.find(row => row.is_current_user)
  const leaders = rows.filter(row => row.in_top_50)
  // Everyone appears by a permanent serial; the short code only covers the
  // moment before the serial-number migration is live.
  const nameOf = (row: CheckInRanking) =>
    row.penguin_number != null ? t('小企鵝 {n}', { n: row.penguin_number }) : t('小企鵝 #{code}', { code: leaderboardCode(row.penguin_alias) })
  // Staged rollout: keep the existing growth page intact until the RPC is deployed.
  if (unavailable) return null
  return (
    <section aria-labelledby="check-in-ranking-title" className="mt-8 w-full text-left">
      <h2 id="check-in-ranking-title" className="px-1 text-base font-semibold">{t('累積分數排行榜')}</h2>

      {own && !loading && !failed && (
        <p className="mt-1 px-1 text-sm text-muted-foreground">
          {own.rank_position === null
            ? t('簽到後，就能留下你的第一個分數。')
            : t('你是{name}，目前第 {n} 名。', { n: own.rank_position, name: nameOf(own) })}
        </p>
      )}

      <div className="mt-3 rounded-2xl border border-border bg-card px-2 shadow-sm sm:px-3">
        {loading && rows.length === 0 ? <p role="status" className="px-2 py-6 text-sm text-muted-foreground">{t('正在讀取排行榜…')}</p> : failed ? (
          <div role="alert" className="px-2 py-5 text-sm">
            <p>{t('排行榜暫時讀不到，請再試一次。')}</p>
            <button onClick={() => setAttempt(n => n + 1)} className="min-h-11 rounded-lg px-0 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('重新讀取')}</button>
          </div>
        ) : leaders.length === 0 ? <p className="px-2 py-6 text-sm text-muted-foreground">{t('排行榜正等著第一個小小的開始。')}</p> : (
          <ol aria-label={t('累積分數排行榜')} className="text-sm">
            {leaders.map(row => (
              <li key={row.penguin_alias}
                className={cn('grid min-h-12 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-2 py-2 last:border-0', row.is_current_user && '-mx-2 rounded-xl border-transparent bg-accent/50 px-4 sm:-mx-3 sm:px-5')}>
                <span
                  aria-label={t('第 {n} 名', { n: row.rank_position ?? '' })}
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    row.rank_position === 1 ? 'bg-[var(--art-mustard,#edc747)] text-[#292b24]'
                      : row.rank_position !== null && row.rank_position <= 3 ? 'bg-muted text-foreground ring-1 ring-border'
                      : 'text-muted-foreground',
                  )}>{row.rank_position}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn('truncate', row.is_current_user ? 'font-semibold text-foreground' : 'text-foreground')}>{nameOf(row)}</span>
                  {row.is_current_user && <span className="shrink-0 text-xs font-semibold text-foreground">{t('（你）')}</span>}
                </span>
                <span className="text-right font-semibold tabular-nums">{t('{n} 分', { n: row.total_points })}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">{t('前 50 名，同分並列。每位小企鵝都有一個固定編號，不會顯示帳號名稱。')}</p>
    </section>
  )
}
