'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Copy, Gift, Shield, Users } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { AuthGuard } from '@/components/auth/auth-guard'
import {
  operations,
  dateLabel,
  sourceLabel,
  enrollmentLink,
} from '@/lib/operations/client'
import { readEnrollment } from '@/lib/operations/invites'
import type { Membership, Ranking } from '@/lib/operations/types'
import { Shell, Feedback, Field, Loading, Empty, styles } from './shared'
import { useI18n } from '@/lib/i18n/react'

export function MembershipPage() {
  const { user } = useAuth()
  return (
    <AuthGuard>
      <MembershipContent key={user?.id} />
    </AuthGuard>
  )
}
function MembershipContent() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [data, setData] = useState<Membership | null>(null)
  const [ranking, setRanking] = useState<Ranking[]>([])
  const [alias, setAlias] = useState('')
  const [visible, setVisible] = useState(false)
  const [coupon, setCoupon] = useState('')
  const [referral, setReferral] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const alive = useRef(true)
  const currentUser = useRef(user?.id)
  useEffect(() => {
    currentUser.current = user?.id
    const pending = readEnrollment()
    if (pending && (!pending.owner || pending.owner === user?.id)) {
      setCoupon(pending.coupon)
      setReferral(pending.referral)
    }
  }, [user?.id])
  const load = useCallback(async () => {
    const uid = user?.id
    const [self, rows] = await Promise.all([
      operations<Membership>('self'),
      operations<Ranking[]>('leaderboard'),
    ])
    if (!alive.current || currentUser.current !== uid) return
    setData(self)
    setRanking(rows)
    setAlias(self.member.alias)
    setVisible(self.member.leaderboard_visible)
  }, [user?.id])
  useEffect(() => {
    alive.current = true
    setData(null)
    load().catch((e) => {
      if (alive.current) setError(t(e.message))
    })
    return () => {
      alive.current = false
    }
  }, [load])
  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await operations<{ message?: string }>(action, payload)
      await load()
      setMessage(result.message || t('已儲存'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('操作失敗，請再試一次'))
    } finally {
      setBusy(false)
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(t('已複製，可以分享給朋友了'))
    } catch {
      setError(t('無法自動複製，請選取下方文字手動複製。'))
    }
  }
  const active = data?.pro_until && Date.parse(data.pro_until) > Date.now()
  const link =
    data?.member.referral_code && typeof window !== 'undefined'
      ? enrollmentLink('ref', data.member.referral_code)
      : ''
  return (
    <Shell
      title={t('會員與推薦')}
      intro={t('用自己的名字，在這裡慢慢累積。邀請朋友，也為自己多留一點時間。')}
      aside={
        data?.admin && (
          <Link className={styles.button} href="/admin">
            <Shield size={17} />
            {t('營運後台')}
          </Link>
        )
      }
    >
      <Feedback error={error} message={message} />
      {!data ? (
        error ? (
          <button
            onClick={() => {
              setError('')
              load().catch((e) => setError(t(e.message)))
            }}
          >
            {t('重新載入')}
          </button>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <section className={styles.panel}>
            <h2>{active ? t('你的 Pro 使用時間') : t('目前使用基本版')}</h2>
            <p>
              {active
                ? t('可使用至 {date}（台北時間）', { date: dateLabel(data.pro_until) })
                : t('優惠與推薦取得的時間會列在這裡，原有資料會保留。')}
            </p>
            {data.paid_until && (
              <p className={styles.muted}>
                {t('付費權益至 {date}。贈送時間接在付費權益之後；商店自動續訂與扣款仍依原訂閱設定，請在購買商店管理。', { date: dateLabel(data.paid_until) })}
              </p>
            )}
          </section>
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2>{t('你的推薦碼')}</h2>
              <p className={styles.muted}>
                {data.settings.referrals_enabled
                  ? t('新朋友在註冊後 7 天內使用並完成帳號驗證，你就能獲得 {days} 天。每年最多 {cap} 天。', { days: data.settings.referral_days, cap: data.settings.annual_reward_cap })
                  : t('推薦獎勵目前暫停。你仍可準備自己的推薦碼；活動開啟後才會發放獎勵。')}
              </p>
              {data.member.referral_code ? (
                <>
                  <p className={styles.code}>{data.member.referral_code}</p>
                  <Field label={t('專屬推薦連結')}>
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      onClick={() => copy(link)}
                    >
                      <Copy size={16} />
                      {t('複製連結')}
                    </button>
                    <button onClick={() => copy(data.member.referral_code!)}>
                      {t('複製推薦碼')}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.actions}>
                  <button
                    disabled={busy}
                    className={styles.primary}
                    onClick={() => act('generate')}
                  >
                    <Users size={17} />
                    {t('產生我的推薦碼')}
                  </button>
                </div>
              )}
              <p className={`${styles.muted} mt-5`}>
                {t('已成功推薦 {count} 人 · 累積獲得 {days} 天', { count: data.referral_count, days: data.reward_days })}
              </p>
            </section>
            <section className={styles.panel}>
              <h2>{t('化名與排行榜')}</h2>
              <p className={styles.muted}>
                {t('公開時只顯示化名與有效推薦人數，不會顯示 Email、頭像或真實姓名。你可以隨時退出排行榜。')}
              </p>
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void act('profile', { alias, visible })
                }}
              >
                <Field
                  label={t('公開化名')}
                  hint={t('2–24 個字，請勿使用個人聯絡資訊。')}
                >
                  <input
                    required
                    minLength={2}
                    maxLength={24}
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                </Field>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                  />
                  {t('讓我的化名出現在推薦排行榜')}
                </label>
                <button disabled={busy} className={styles.primary}>
                  {t('儲存化名與公開設定')}
                </button>
              </form>
            </section>
            <section className={styles.panel}>
              <h2>{t('兌換優惠碼')}</h2>
              <p className={styles.muted}>
                {t('兌換前會檢查活動期限、名額與適用對象。同一個碼每人限用一次。')}
              </p>
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void act('redeem', { code: coupon })
                }}
              >
                <Field label={t('活動優惠碼')}>
                  <input
                    required
                    maxLength={32}
                    autoCapitalize="characters"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                  />
                </Field>
                <button
                  className={styles.primary}
                  disabled={busy || !data.settings.coupons_enabled}
                >
                  <Gift size={17} />
                  {data.settings.coupons_enabled
                    ? t('兌換使用時間')
                    : t('優惠活動暫停中')}
                </button>
              </form>
            </section>
            <section className={styles.panel}>
              <h2>{t('朋友的推薦碼')}</h2>
              {data.referred ? (
                <p>{t('已綁定推薦人，推薦獎勵不會重複發放。')}</p>
              ) : (
                <>
                  <p className={styles.muted}>
                    {t('註冊後 7 天內可補填一次。新戶推薦體驗總共 {days} 天，包含已領取的新戶體驗；活動優惠擇優，不重複贈送。', { days: data.settings.friend_days })}
                  </p>
                  <form
                    className="mt-5 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void act('refer', { code: referral })
                    }}
                  >
                    <Field label={t('推薦碼')}>
                      <input
                        required
                        maxLength={32}
                        value={referral}
                        onChange={(e) => setReferral(e.target.value)}
                      />
                    </Field>
                    <button disabled={busy || !data.settings.referrals_enabled}>
                      {t('套用推薦碼')}
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
          <section className={styles.panel}>
            <h2>{t('推薦排行榜')}</h2>
            <p className={styles.muted}>
              {t('依累積有效推薦人數排序，相同人數並列。只列出願意公開的會員，最多顯示 100 位。')}
            </p>
            {!data.settings.leaderboard_enabled ? (
              <Empty>{t('排行榜目前暫停公開。')}</Empty>
            ) : ranking.length ? (
              <ol className={styles.rank}>
                {ranking.map((r, i) => (
                  <li key={i} data-self={r.is_self}>
                    <span>{r.rank}</span>
                    <span>
                      {r.alias}
                      {r.is_self && t('（你）')}
                    </span>
                    <span>{t('{count} 人', { count: r.referrals })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>
                {t('目前還沒有公開的推薦紀錄。邀請第一位朋友，一起開始。')}
              </Empty>
            )}
          </section>
          <section className={styles.panel}>
            <h2>{t('使用時間紀錄')}</h2>
            {data.grants.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('來源')}</th>
                      <th>{t('天數')}</th>
                      <th>{t('領取時間')}</th>
                      <th>{t('狀態')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.grants.map((g) => (
                      <tr key={g.id}>
                        <td>
                          {sourceLabel[g.source]}
                          <small>{g.reason}</small>
                        </td>
                        <td>{t('+{days} 天', { days: g.days })}</td>
                        <td>{dateLabel(g.created_at)}</td>
                        <td>
                          {g.revoked_at
                            ? t('已撤銷')
                            : t('可使用至 {date}', { date: dateLabel(g.expires_at) })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{t('尚未領取贈送時間。')}</Empty>
            )}
          </section>
        </>
      )}
    </Shell>
  )
}
