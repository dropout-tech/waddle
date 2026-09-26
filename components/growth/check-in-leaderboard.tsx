'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  LEADERBOARD_NICKNAME_MAX,
  leaderboardCode,
  normalizeLeaderboardNickname,
  type CheckInRanking,
} from '@/lib/daily-check-in'
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
  const [editing, setEditing] = useState(false)
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
  // Nickname editing needs the nickname migration (rows then carry has_nickname).
  const nicknameReady = own !== undefined && typeof own.has_nickname === 'boolean'
  const nameOf = (row: CheckInRanking) =>
    row.has_nickname && row.leaderboard_name ? row.leaderboard_name : t('小企鵝 #{code}', { code: leaderboardCode(row.penguin_alias) })
  // Staged rollout: keep the existing growth page intact until the RPC is deployed.
  if (unavailable) return null
  return (
    <section aria-labelledby="check-in-ranking-title" className="mt-8 w-full text-left">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="check-in-ranking-title" className="text-base font-semibold">{t('累積分數排行榜')}</h2>
        {nicknameReady && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {t(own?.has_nickname ? '修改暱稱' : '設定暱稱')}
          </button>
        )}
      </div>

      {editing && own && (
        <NicknameEditor
          current={own.has_nickname ? own.leaderboard_name ?? '' : ''}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setAttempt(n => n + 1) }}
        />
      )}

      {own && !loading && !failed && (
        <p className="mt-1 px-1 text-sm text-muted-foreground">
          {own.rank_position === null
            ? t('簽到後，就能留下你的第一個分數。')
            : t('你目前第 {n} 名，以「{name}」顯示。', { n: own.rank_position, name: nameOf(own) })}
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
                  <span className={cn('truncate', row.has_nickname ? 'font-medium text-foreground' : 'text-muted-foreground')}>{nameOf(row)}</span>
                  {row.is_current_user && <span className="shrink-0 text-xs font-semibold text-foreground">{t('（你）')}</span>}
                </span>
                <span className="text-right font-semibold tabular-nums">{t('{n} 分', { n: row.total_points })}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">{t('前 50 名，同分並列。沒設暱稱的人以匿名代號顯示。')}</p>
    </section>
  )
}

function NicknameEditor({ current, onClose, onSaved }: { current: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const trimmed = normalizeLeaderboardNickname(value)
  const length = [...trimmed].length
  const invalid = trimmed === '' ? '請輸入至少 1 個字。' : length > LEADERBOARD_NICKNAME_MAX ? '暱稱最多 16 個字。' : null

  const save = async (next: string | null) => {
    if (saving) return
    if (next !== null && invalid) { setError(invalid); return }
    setSaving(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('set_leaderboard_nickname', { p_nickname: next })
      if (rpcError) throw rpcError
      onSaved()
    } catch (e) {
      const message = (e as { message?: string })?.message ?? ''
      setError(message.includes('NICKNAME_BLANK') ? '請輸入至少 1 個字。'
        : message.includes('NICKNAME_TOO_LONG') ? '暱稱最多 16 個字。'
        : message.includes('NICKNAME_INVALID') ? '暱稱裡有無法使用的字元。'
        : '暱稱還沒存好，請再試一次。')
    } finally { setSaving(false) }
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); void save(trimmed) }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <label htmlFor={inputId} className="text-sm font-semibold">{t('排行榜暱稱')}</label>
      <p id={hintId} className="mt-1 text-xs leading-5 text-muted-foreground">
        {t('會公開顯示給所有簽到的人看。Huddle 不會用你的帳號名稱或 Email。')}
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          maxLength={32}
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          placeholder={t('例如：冰上小飛俠')}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
        />
        <span className={cn('shrink-0 text-xs tabular-nums', length > LEADERBOARD_NICKNAME_MAX ? 'font-semibold text-primary' : 'text-muted-foreground')}>
          {length}/{LEADERBOARD_NICKNAME_MAX}
        </span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-primary">{t(error)}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {current && (
          <button type="button" disabled={saving} onClick={() => void save(null)}
            className="mr-auto min-h-11 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {t('改回匿名')}
          </button>
        )}
        <button type="button" onClick={onClose} disabled={saving}
          className="min-h-11 rounded-xl px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          {t('取消')}
        </button>
        <button type="submit" disabled={saving || !!invalid}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50">
          {saving && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
          {t('儲存暱稱')}
        </button>
      </div>
    </form>
  )
}
