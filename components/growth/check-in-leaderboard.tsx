'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CheckInRanking } from '@/lib/daily-check-in'
import { useI18n } from '@/lib/i18n/react'

export function CheckInLeaderboard({ score }: { score: number | undefined }) {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<CheckInRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
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
  return (
    <section aria-labelledby="check-in-ranking-title" className="mt-10 w-full border-t border-border pt-7 text-left">
      <h2 id="check-in-ranking-title" className="text-lg font-semibold">{t('累積分數排行榜')}</h2>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{t('顯示前 50 位小企鵝，相同分數並列。暱稱由系統匿名產生。')}</p>
      {loading ? <p role="status" className="py-6 text-sm text-muted-foreground">{t('正在讀取排行榜…')}</p> : failed ? (
        <div role="alert" className="py-5 text-sm">
          <p>{t('排行榜暫時讀不到，請再試一次。')}</p>
          <button onClick={() => setAttempt(n => n + 1)} className="min-h-11 rounded-lg px-3 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('重新讀取')}</button>
        </div>
      ) : <>
        {own && <p className="my-4 rounded-xl bg-secondary/50 px-4 py-3 text-sm font-medium">
          {own.rank_position === null ? t('簽到後，就能留下你的第一個分數。') : t('你的名次：第 {n} 名', { n: own.rank_position })}
          <span className="ml-2">{t('{n} 分', { n: own.total_points })}</span>
        </p>}
        {leaders.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t('排行榜正等著第一個小小的開始。')}</p> : (
          <table className="w-full text-sm">
            <caption className="sr-only">{t('累積分數排行榜')}</caption>
            <thead className="border-b border-border text-xs text-muted-foreground"><tr>
              <th scope="col" className="py-3 pr-2 text-left font-medium">{t('名次')}</th>
              <th scope="col" className="py-3 text-left font-medium">{t('小企鵝')}</th>
              <th scope="col" className="py-3 pl-2 text-right font-medium">{t('分數')}</th>
            </tr></thead>
            <tbody>{leaders.map(row => <tr key={row.penguin_alias} className={row.is_current_user ? 'border-b border-border/50 bg-secondary/30' : 'border-b border-border/50'}>
              <td className="px-2 py-4 tabular-nums">{row.rank_position}</td>
              <td className="py-4"><span className="break-all">{t('企鵝 {id}', { id: row.penguin_alias })}</span>{row.is_current_user && <span className="ml-2 text-xs font-semibold">{t('（你）')}</span>}</td>
              <td className="px-2 py-4 text-right tabular-nums">{row.total_points}</td>
            </tr>)}</tbody>
          </table>
        )}
      </>}
    </section>
  )
}
