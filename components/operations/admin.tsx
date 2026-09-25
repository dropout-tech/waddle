'use client'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { AdminAnnouncements, AdminAnalytics } from './announcements'
import { AuthGuard } from '@/components/auth/auth-guard'
import { useAuth } from '@/components/auth/auth-provider'
import {
  operations,
  dateLabel,
  sourceLabel,
  enrollmentLink,
} from '@/lib/operations/client'
import type {
  Membership,
  Overview,
  OperationsSettings,
  Member,
  MemberDetail,
  Coupon,
  Redemption,
  Referral,
  Billing,
  Audit,
} from '@/lib/operations/types'
import { Shell, Feedback, Field, Loading, Empty, Pager, styles } from './shared'
import { useI18n } from '@/lib/i18n/react'

type Tab =
  | 'overview'
  | 'members'
  | 'coupons'
  | 'referrals'
  | 'billing'
  | 'audit'
  | 'settings'
  | 'announcements'
  | 'analytics'
const tabs: [Tab, string][] = [
  ['overview', '數據總覽'],
  ['members', '會員'],
  ['coupons', '優惠碼'],
  ['referrals', '推薦紀錄'],
  ['billing', '訂單與訂閱'],
  ['audit', '操作紀錄'],
  ['settings', '活動設定'],
  ['announcements', '公告與通知'],
  ['analytics', '來源分析'],
]
type Rows = Member[] | Coupon[] | Referral[] | Billing[] | Audit[]
const audiences: Record<string, string> = {
  all: '所有會員',
  new: '註冊 7 天內的新會員',
  existing: '活動建立前的既有會員',
  specific: '指定會員',
}
export function AdminPage() {
  const { user } = useAuth()
  return (
    <AuthGuard>
      <AdminContent key={user?.id} />
    </AuthGuard>
  )
}
function AdminContent() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [settings, setSettings] = useState<OperationsSettings | null>(null)
  const [rows, setRows] = useState<Rows>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [referralToRevoke, setReferralToRevoke] = useState<Referral | null>(
    null
  )
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Member | null>(null)
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [couponDetail, setCouponDetail] = useState<Coupon | null>(null)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [redemptionState, setRedemptionState] = useState<
    'loading' | 'ready' | 'error'
  >('ready')
  const [audience, setAudience] = useState('all')
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null)
  const serial = useRef(0)
  const detailSerial = useRef(0)
  const requestId = useRef(crypto.randomUUID())
  const load = useCallback(async () => {
    const seq = ++serial.current
    setLoading(true)
    setError('')
    try {
      const self = await operations<Membership>('self')
      if (seq !== serial.current) return
      setAllowed(self.admin)
      if (!self.admin) return
      const summary = await operations<Overview>('admin_overview')
      const list = [
        'settings',
        'overview',
        'announcements',
        'analytics',
      ].includes(tab)
        ? []
        : await operations<Rows>(`admin_${tab}`, { offset, search: query })
      if (seq !== serial.current) return
      setOverview(summary)
      setSettings(summary.settings)
      setRows(list)
    } catch (e) {
      if (seq === serial.current)
        setError(e instanceof Error ? e.message : t('載入失敗'))
    } finally {
      if (seq === serial.current) setLoading(false)
    }
  }, [tab, offset, query, t])
  useEffect(() => {
    setAllowed(null)
    setRows([])
    setSelected(null)
    void load()
    return () => {
      serial.current++
      detailSerial.current++
    }
  }, [load, user?.id])
  async function act(
    action: string,
    payload: Record<string, unknown>,
    success = t('已儲存')
  ) {
    if (busy) return false
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await operations(action, payload)
      setMessage(success)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t('操作失敗，請重試'))
      return false
    } finally {
      setBusy(false)
    }
  }
  function switchTab(next: Tab) {
    if (next === tab) return
    setLoading(true)
    setTab(next)
    setOffset(0)
    setSelected(null)
    setDetail(null)
    setCouponDetail(null)
    setMessage('')
    setEditCoupon(null)
    setReferralToRevoke(null)
    detailSerial.current++
  }
  async function viewMember(m: Member) {
    const seq = ++detailSerial.current
    requestId.current = crypto.randomUUID()
    setSelected(m)
    setDetail(null)
    setError('')
    try {
      const d = await operations<MemberDetail>('admin_member', {
        user_id: m.id,
      })
      if (seq === detailSerial.current) setDetail(d)
    } catch (e) {
      if (seq === detailSerial.current)
        setError(e instanceof Error ? e.message : t('無法讀取會員'))
    }
  }
  async function viewCoupon(c: Coupon) {
    const seq = ++detailSerial.current
    setCouponDetail(c)
    setRedemptionState('loading')
    setRedemptions([])
    try {
      const d = await operations<Redemption[]>('admin_redemptions', {
        id: c.id,
      })
      if (seq === detailSerial.current) {
        setRedemptions(d)
        setRedemptionState('ready')
      }
    } catch (e) {
      if (seq === detailSerial.current) {
        setError(e instanceof Error ? e.message : t('無法讀取兌換紀錄'))
        setRedemptionState('error')
      }
    }
  }
  async function couponSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const data = {
      id: editCoupon?.id,
      code: f.get('code'),
      name: f.get('name'),
      days: Number(f.get('days')),
      audience: f.get('audience'),
      target_user_id: f.get('target_user_id') || null,
      max_uses: Number(f.get('max_uses')),
      starts_at: new Date(String(f.get('starts_at'))).toISOString(),
      expires_at: new Date(String(f.get('expires_at'))).toISOString(),
      stackable: f.get('stackable') === 'on',
      notes: f.get('notes'),
    }
    if (
      await act(
        editCoupon ? 'admin_update_coupon' : 'admin_coupon',
        data,
        t('優惠碼已儲存，可複製連結分享')
      )
    ) {
      form.reset()
      setEditCoupon(null)
      setAudience('all')
    }
  }
  async function grantSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    if (
      await act(
        'admin_grant',
        {
          user_id: selected?.id,
          days: Number(f.get('days')),
          reason: f.get('reason'),
          request_id: requestId.current,
        },
        t('使用時間已贈送')
      )
    ) {
      requestId.current = crypto.randomUUID()
      form.reset()
      if (selected) await viewMember(selected)
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(t('已複製'))
    } catch {
      setError(t('無法自動複製，請手動選取優惠碼複製。'))
    }
  }
  const table = (head: string[], body: ReactNode) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
  return (
    <Shell
      title={t('營運後台')}
      intro={t('看看大家如何使用 Huddle，為每一次邀請與贈送留下清楚的紀錄。')}
      aside={
        <Link href="/membership" className={styles.button}>
          {t('我的會員頁')}
        </Link>
      }
    >
      <Feedback error={error} message={message} />
      {allowed === false ? (
        <section className={styles.panel}>
          <h2>{t('此帳號沒有後台權限')}</h2>
          <p>{t('請使用已授權的管理員帳號登入。一般會員的資料不會在這裡公開。')}</p>
        </section>
      ) : (
        <>
          {allowed && (
            <nav className={styles.nav} aria-label={t('營運功能')}>
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => switchTab(id)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
          )}
          {loading ? (
            <Loading />
          ) : !allowed ? (
            <button onClick={() => void load()}>{t('重新載入')}</button>
          ) : (
            <>
              {tab === 'announcements' && <AdminAnnouncements />}
              {tab === 'analytics' && <AdminAnalytics />}
              {tab === 'overview' && overview && (
                <>
                  <dl className={styles.stats}>
                    {(
                      [
                        ['會員總數', overview.members],
                        ['近 30 天新註冊', overview.new_30],
                        ['付費權益有效', overview.paid],
                        ['贈送／體驗有效', overview.gifted],
                        ['今日活躍', overview.dau],
                        ['近 7 天活躍', overview.wau],
                        ['近 30 天活躍', overview.mau],
                        ['有效推薦', overview.referrals],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt>{t(label)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <section className={styles.panel}>
                    <h2>{t('體驗與推廣')}</h2>
                    <p>
                      {t('優惠碼兌換 {count} 次。已結束新戶體驗 {ended} 人，其中目前具有付費權益 {converted} 人。', {
                        count: overview.redemptions,
                        ended: overview.ended_trials,
                        converted: overview.converted_trials,
                      })}
                    </p>
                    <p className={styles.muted}>
                      {overview.ended_trials
                        ? t('到期體驗會員目前付費比例：{rate}%。', {
                            rate: ((overview.converted_trials / overview.ended_trials) * 100).toFixed(1),
                          })
                        : t('尚無到期樣本，暫不計算比例。')}
                      {t('此比例不是歷史首次付費轉換率；完整訂單金流尚未啟用。')}
                    </p>
                    <div className={styles.actions}>
                      <button onClick={() => switchTab('coupons')}>
                        {t('查看優惠碼成效')}
                      </button>
                      <button onClick={() => switchTab('settings')}>
                        {t('調整活動開關')}
                      </button>
                    </div>
                  </section>
                  <p className={styles.muted}>
                    {t('活躍指當天有新增或修改任務／排程，單純登入不計入。統計以台北日期計算，自本功能啟用後開始收集，不回填私人任務內容。')}
                  </p>
                </>
              )}
              {tab === 'settings' && settings && (
                <section className={styles.panel}>
                  <h2>{t('活動與贈送設定')}</h2>
                  <p className={styles.muted}>
                    {t('每個活動可以獨立開關。關閉只停止新的領取，已獲得的使用時間保留。數值調整只適用於之後的獎勵。')}
                  </p>
                  <form
                    className={`${styles.form} mt-6`}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void act('admin_settings', { ...settings })
                    }}
                  >
                    {(
                      [
                        ['gifts_enabled', '允許管理員手動贈送'],
                        ['trial_enabled', '開啟新戶免費體驗'],
                        ['coupons_enabled', '開啟優惠碼兌換'],
                        ['referrals_enabled', '開啟推薦獎勵'],
                        ['leaderboard_enabled', '公開化名推薦排行榜'],
                        ['reminder_enabled', '開啟站內體驗到期提醒'],
                      ] as const
                    ).map(([key, label]) => (
                      <label className={styles.check} key={key}>
                        <input
                          type="checkbox"
                          checked={settings[key]}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              [key]: e.target.checked,
                            })
                          }
                        />
                        {t(label)}
                      </label>
                    ))}
                    <div className={styles.full} />
                    {(
                      [
                        ['reminder_days', '到期前幾天顯示提醒', 1, 30],
                        ['trial_days', '新戶體驗天數', 1, 365],
                        ['referral_days', '每次成功推薦獎勵天數', 1, 365],
                        ['friend_days', '被推薦新戶的體驗總天數', 0, 365],
                        [
                          'annual_reward_cap',
                          '每人每年推薦獎勵上限（天）',
                          0,
                          3650,
                        ],
                      ] as const
                    ).map(([key, label, min, max]) => (
                      <Field key={key} label={t(label)}>
                        <input
                          type="number"
                          required
                          min={min}
                          max={max}
                          value={settings[key]}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              [key]: Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    ))}
                    <div className={styles.full}>
                      <button disabled={busy} className={styles.primary}>
                        {t('儲存活動設定')}
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {tab === 'members' && (
                <section className={styles.panel}>
                  <h2>{t('會員管理')}</h2>
                  <form
                    className={styles.actions}
                    onSubmit={(e) => {
                      e.preventDefault()
                      setOffset(0)
                      setQuery(search)
                    }}
                  >
                    <Field label={t('搜尋化名或 Email')}>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        maxLength={100}
                      />
                    </Field>
                    <button>{t('搜尋會員')}</button>
                  </form>
                  {rows.length ? (
                    table(
                      [t('會員'), t('註冊／最近活躍'), t('權益'), t('推薦'), t('操作')],
                      (rows as Member[]).map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.alias || t('尚未設定化名')}
                            <small>{m.email}</small>
                            {m.suspended && <small>{t('帳號已停用')}</small>}
                          </td>
                          <td>
                            {dateLabel(m.created_at)}
                            <small>{t('活躍：{date}', { date: dateLabel(m.last_active) })}</small>
                          </td>
                          <td>
                            {t('付費：{date}', { date: dateLabel(m.paid_until) })}
                            <small>{t('贈送：{date}', { date: dateLabel(m.gift_until) })}</small>
                          </td>
                          <td>{t('{count} 人', { count: m.referrals })}</td>
                          <td>
                            <button onClick={() => void viewMember(m)}>
                              {t('查看會員')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )
                  ) : (
                    <Empty>{t('沒有符合條件的會員。')}</Empty>
                  )}
                  <Pager
                    offset={offset}
                    count={rows.length}
                    onChange={setOffset}
                  />
                  {selected && (
                    <div className={styles.detail}>
                      <h3>{t('{name} 的會員紀錄', { name: selected.alias || selected.email })}</h3>
                      <p className={styles.muted}>
                        {t('會員 ID：{id} · 推薦來源：{referrer}', {
                          id: selected.id,
                          referrer: detail?.referrer || t('無'),
                        })}
                      </p>
                      {!detail ? (
                        <Loading />
                      ) : (
                        <>
                          <form
                            className={`${styles.form} mt-5`}
                            onSubmit={grantSubmit}
                          >
                            <Field label={t('贈送天數')}>
                              <input
                                name="days"
                                type="number"
                                min="1"
                                max="3650"
                                defaultValue="30"
                                required
                              />
                            </Field>
                            <Field label={t('贈送／補發原因')}>
                              <input
                                name="reason"
                                minLength={2}
                                maxLength={500}
                                placeholder={t('例如：協助補發活動獎勵')}
                                required
                              />
                            </Field>
                            <div className={styles.full}>
                              <button
                                className={styles.primary}
                                disabled={busy || !settings?.gifts_enabled}
                              >
                                {t('贈送使用時間')}
                              </button>
                              {!settings?.gifts_enabled && (
                                <p className={styles.muted}>
                                  {t('請先至活動設定開啟手動贈送。')}
                                </p>
                              )}
                            </div>
                          </form>
                          <form
                            className={`${styles.actions} mt-5`}
                            onSubmit={(e) => {
                              e.preventDefault()
                              const f = new FormData(e.currentTarget)
                              void act('admin_suspend', {
                                user_id: selected.id,
                                suspended: !selected.suspended,
                                reason: f.get('reason'),
                              }).then((ok) => {
                                if (ok) {
                                  setSelected(null)
                                  setDetail(null)
                                }
                              })
                            }}
                          >
                            <Field
                              label={
                                selected.suspended
                                  ? t('恢復帳號原因')
                                  : t('停用帳號原因')
                              }
                            >
                              <input
                                name="reason"
                                minLength={2}
                                maxLength={500}
                                required
                              />
                            </Field>
                            <button disabled={busy}>
                              {selected.suspended ? t('恢復帳號') : t('停用帳號')}
                            </button>
                          </form>
                          <GrantTable
                            grants={detail.grants}
                            busy={busy}
                            onRevoke={async (id, reason) => {
                              if (
                                await act(
                                  'admin_revoke',
                                  { id, reason },
                                  t('贈送已撤銷')
                                )
                              )
                                await viewMember(selected)
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}
              {tab === 'coupons' && (
                <>
                  <section className={styles.panel}>
                    <h2>
                      {editCoupon ? t('編輯 {code}', { code: editCoupon.code }) : t('建立優惠碼')}
                    </h2>
                    <p className={styles.muted}>
                      {t('已兌換的獎勵不隨編輯改變。新戶指註冊 7 天內；不可疊加會阻擋仍有效的活動與推薦體驗。')}
                    </p>
                    <form
                      key={editCoupon?.id || 'new'}
                      className={`${styles.form} mt-5`}
                      onSubmit={couponSubmit}
                    >
                      <Field label={t('活動名稱')}>
                        <input
                          name="name"
                          maxLength={80}
                          defaultValue={editCoupon?.name}
                          required
                          placeholder={t('第一批體驗朋友')}
                        />
                      </Field>
                      <Field label={t('優惠碼')} hint={t('4–32 碼英數、底線或連字號。')}>
                        <input
                          name="code"
                          required
                          pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,31}"
                          maxLength={32}
                          readOnly={!!editCoupon}
                          defaultValue={editCoupon?.code}
                          placeholder="FRIENDS60"
                        />
                      </Field>
                      <Field label={t('贈送天數')}>
                        <input
                          name="days"
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={editCoupon?.days || 30}
                          required
                        />
                      </Field>
                      <Field label={t('總兌換名額')}>
                        <input
                          name="max_uses"
                          type="number"
                          min={Math.max(1, editCoupon?.used || 0)}
                          max={1000000}
                          defaultValue={editCoupon?.max_uses || 100}
                          required
                        />
                      </Field>
                      <Field label={t('開始時間（你的裝置時區）')}>
                        <input
                          name="starts_at"
                          type="datetime-local"
                          defaultValue={localDate(
                            editCoupon?.starts_at || new Date().toISOString()
                          )}
                          required
                        />
                      </Field>
                      <Field label={t('兌換截止（你的裝置時區）')}>
                        <input
                          name="expires_at"
                          type="datetime-local"
                          defaultValue={localDate(
                            editCoupon?.expires_at ||
                              new Date(Date.now() + 30 * 86400000).toISOString()
                          )}
                          required
                        />
                      </Field>
                      <Field label={t('適用對象')}>
                        <select
                          name="audience"
                          value={audience}
                          onChange={(e) => setAudience(e.target.value)}
                        >
                          {Object.entries(audiences).map(([v, label]) => (
                            <option key={v} value={v}>
                              {t(label)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {audience === 'specific' && (
                        <Field
                          label={t('指定會員 ID')}
                          hint={t('在會員詳細資料中複製。')}
                        >
                          <input
                            name="target_user_id"
                            defaultValue={editCoupon?.target_user_id || ''}
                            pattern="[0-9a-fA-F-]{36}"
                            required
                          />
                        </Field>
                      )}
                      <label className={styles.check}>
                        <input
                          name="stackable"
                          type="checkbox"
                          defaultChecked={editCoupon?.stackable}
                        />
                        {t('允許與其他活動體驗疊加')}
                      </label>
                      <Field label={t('內部備註')}>
                        <input
                          name="notes"
                          maxLength={500}
                          defaultValue={editCoupon?.notes}
                        />
                      </Field>
                      <div className={`${styles.actions} ${styles.full}`}>
                        <button className={styles.primary} disabled={busy}>
                          {editCoupon ? t('儲存優惠碼') : t('建立優惠碼')}
                        </button>
                        {editCoupon && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditCoupon(null)
                              setAudience('all')
                            }}
                          >
                            {t('取消編輯')}
                          </button>
                        )}
                      </div>
                    </form>
                  </section>
                  <section className={styles.panel}>
                    <h2>{t('優惠碼與成效')}</h2>
                    {!settings?.coupons_enabled && (
                      <p className={styles.muted}>
                        {t('目前總開關為關閉：可以建立與編輯優惠碼，會員暫時無法兌換。')}
                      </p>
                    )}
                    {rows.length ? (
                      table(
                        [t('活動'), t('兌換狀態'), t('成效'), t('操作')],
                        (rows as Coupon[]).map((c) => (
                          <tr key={c.id}>
                            <td>
                              {c.name}
                              <small>
                                <code>{c.code}</code> · {t('{days} 天', { days: c.days })}
                              </small>
                              <small>{t(audiences[c.audience])}</small>
                            </td>
                            <td>
                              {c.enabled ? t('啟用') : t('停用')} · {c.used}/
                              {c.max_uses}
                              <small>{t('開始 {date}', { date: dateLabel(c.starts_at) })}</small>
                              <small>{t('兌換截止 {date}', { date: dateLabel(c.expires_at) })}</small>
                            </td>
                            <td>
                              {t('兌換後近 7 天活躍 {count} 人', { count: c.active })}
                              <small>
                                {t('兌換後有付費更新且權益有效 {count} 人', { count: c.paid })}
                              </small>
                            </td>
                            <td>
                              <div className={styles.actions}>
                                <button
                                  onClick={() =>
                                    copy(enrollmentLink('coupon', c.code))
                                  }
                                >
                                  {t('複製連結')}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditCoupon(c)
                                    setAudience(c.audience)
                                    document.querySelector('main')?.scrollTo({
                                      top: 0,
                                      behavior: 'smooth',
                                    })
                                  }}
                                >
                                  {t('編輯')}
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act('admin_toggle_coupon', {
                                      id: c.id,
                                      enabled: !c.enabled,
                                    })
                                  }
                                >
                                  {c.enabled ? t('停用') : t('啟用')}
                                </button>
                                <button onClick={() => void viewCoupon(c)}>
                                  {t('兌換紀錄')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )
                    ) : (
                      <Empty>
                        {t('還沒有優惠碼。可以先建立一組，再開啟活動分享。')}
                      </Empty>
                    )}
                    <Pager
                      offset={offset}
                      count={rows.length}
                      onChange={setOffset}
                    />
                    {couponDetail && (
                      <div className={styles.detail}>
                        <h3>{t('{name} 的兌換紀錄', { name: couponDetail.name })}</h3>
                        {redemptionState === 'loading' ? (
                          <Loading />
                        ) : redemptionState === 'error' ? (
                          <button onClick={() => void viewCoupon(couponDetail)}>
                            {t('重新讀取兌換紀錄')}
                          </button>
                        ) : redemptions.length ? (
                          table(
                            [t('會員'), 'Email', t('兌換時間')],
                            redemptions.map((r) => (
                              <tr key={r.user_id}>
                                <td>{r.alias || t('未設定')}</td>
                                <td>{r.email}</td>
                                <td>{dateLabel(r.created_at)}</td>
                              </tr>
                            ))
                          )
                        ) : (
                          <Empty>{t('尚無兌換紀錄。')}</Empty>
                        )}
                        <p className={styles.muted}>{t('顯示最近 50 筆。')}</p>
                      </div>
                    )}
                  </section>
                </>
              )}
              {tab === 'referrals' && (
                <section className={styles.panel}>
                  <h2>{t('推薦與獎勵紀錄')}</h2>
                  <p className={styles.muted}>
                    {t('同一位新會員只會計算一次。到達年度上限後仍記錄有效推薦，獎勵天數為 0。')}
                  </p>
                  {rows.length ? (
                    table(
                      [t('推薦人'), t('新會員'), t('獎勵'), t('時間'), t('狀態'), t('操作')],
                      (rows as Referral[]).map((r) => (
                        <tr key={r.id}>
                          <td>{r.referrer}</td>
                          <td>{r.friend}</td>
                          <td>{t('{days} 天', { days: r.reward_days })}</td>
                          <td>{dateLabel(r.created_at)}</td>
                          <td>{r.status === 'valid' ? t('有效') : t('已撤銷')}</td>
                          <td>
                            {r.status === 'valid' && (
                              <button onClick={() => setReferralToRevoke(r)}>
                                {t('撤銷推薦')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )
                  ) : (
                    <Empty>{t('還沒有推薦紀錄。')}</Empty>
                  )}
                  <Pager
                    offset={offset}
                    count={rows.length}
                    onChange={setOffset}
                  />
                  {referralToRevoke && (
                    <form
                      className={styles.actions}
                      onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        void act(
                          'admin_referral',
                          {
                            id: referralToRevoke.id,
                            reason: data.get('reason'),
                          },
                          t('推薦及相關贈送已撤銷')
                        ).then((ok) => {
                          if (ok) setReferralToRevoke(null)
                        })
                      }}
                    >
                      <Field
                        label={t('撤銷 {referrer} 推薦 {friend} 的原因', {
                          referrer: referralToRevoke.referrer,
                          friend: referralToRevoke.friend,
                        })}
                      >
                        <input
                          name="reason"
                          required
                          minLength={2}
                          maxLength={500}
                        />
                      </Field>
                      <button disabled={busy}>{t('確認撤銷推薦')}</button>
                      <button
                        type="button"
                        onClick={() => setReferralToRevoke(null)}
                      >
                        {t('取消')}
                      </button>
                      <p className={styles.muted}>
                        {t('此操作會移除排行榜計數並撤銷雙方相關推薦贈送，保留其他已付費或活動權益。')}
                      </p>
                    </form>
                  )}
                  <p className={styles.muted}>
                    {t('如需補發或撤銷，請到會員管理開啟推薦人的贈送紀錄，填寫原因後操作。')}
                  </p>
                </section>
              )}
              {tab === 'billing' && (
                <section className={styles.panel}>
                  <h2>{t('訂單與訂閱')}</h2>
                  <p>
                    {t('目前尚未啟用購買。此頁顯示金流同步的權益紀錄，不把贈送時間計為營收。')}
                  </p>
                  <p className={styles.muted}>
                    {t('訂單金額、付款失敗、退款與下一次扣款日需接上正式金流後才能提供，目前不會以推算數字替代。')}
                  </p>
                  {rows.length ? (
                    table(
                      [t('會員'), t('方案'), t('付費權益到期'), t('金流更新時間')],
                      (rows as Billing[]).map((b) => (
                        <tr key={b.user_id}>
                          <td>{b.email}</td>
                          <td>{b.entitlement}</td>
                          <td>{dateLabel(b.expires_at)}</td>
                          <td>
                            {dateLabel(
                              new Date(b.observed_at_ms).toISOString()
                            )}
                          </td>
                        </tr>
                      ))
                    )
                  ) : (
                    <Empty>{t('尚無金流權益紀錄。')}</Empty>
                  )}
                  <Pager
                    offset={offset}
                    count={rows.length}
                    onChange={setOffset}
                  />
                </section>
              )}
              {tab === 'audit' && (
                <section className={styles.panel}>
                  <h2>{t('操作紀錄')}</h2>
                  <p className={styles.muted}>
                    {t('保留操作者、對象、原因與時間。會員的任務與筆記內容不會記入。')}
                  </p>
                  {rows.length ? (
                    table(
                      [t('台北時間'), t('操作'), t('對象'), t('內容')],
                      (rows as Audit[]).map((a) => (
                        <tr key={a.id}>
                          <td>{dateLabel(a.created_at)}</td>
                          <td>
                            {t(auditLabel[a.action] || a.action)}
                            <small>{t('操作者：{id}', { id: a.actor_id })}</small>
                          </td>
                          <td>{a.target || t('全站設定')}</td>
                          <td>
                            <details>
                              <summary>{t('查看紀錄')}</summary>
                              <pre className="max-w-sm whitespace-pre-wrap break-all text-xs">
                                {JSON.stringify(a.detail, null, 2)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      ))
                    )
                  ) : (
                    <Empty>{t('尚無操作紀錄。')}</Empty>
                  )}
                  <Pager
                    offset={offset}
                    count={rows.length}
                    onChange={setOffset}
                  />
                </section>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  )
}
function localDate(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
const auditLabel: Record<string, string> = {
  admin_settings: '更新活動設定',
  admin_coupon: '建立優惠碼',
  admin_update_coupon: '編輯優惠碼',
  admin_toggle_coupon: '變更優惠碼狀態',
  admin_grant: '手動贈送',
  admin_revoke: '撤銷贈送',
  admin_suspend: '調整帳號狀態',
  redeem: '兌換優惠碼',
  refer: '推薦生效',
}
function GrantTable({
  grants,
  busy,
  onRevoke,
}: {
  grants: MemberDetail['grants']
  busy: boolean
  onRevoke: (id: string, reason: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [id, setId] = useState('')
  const [reason, setReason] = useState('')
  return (
    <div className={styles.detail}>
      <h3>{t('贈送時間與操作')}</h3>
      {grants.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('來源')}</th>
                <th>{t('天數與期限')}</th>
                <th>{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td>
                    {t(sourceLabel[g.source])}
                    <small>{g.reason}</small>
                  </td>
                  <td>
                    {t('{days} 天', { days: g.days })}<small>{dateLabel(g.expires_at)}</small>
                  </td>
                  <td>
                    {g.revoked_at ? (
                      t('已撤銷')
                    ) : (
                      <button
                        onClick={() => {
                          setId(g.id)
                          setReason('')
                        }}
                      >
                        {t('撤銷這筆贈送')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t('尚無贈送紀錄。')}</Empty>
      )}
      {id && (
        <form
          className={styles.actions}
          onSubmit={(e) => {
            e.preventDefault()
            void onRevoke(id, reason).then(() => setId(''))
          }}
        >
          <Field label={t('撤銷原因')}>
            <input
              required
              minLength={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button disabled={busy}>{t('確認撤銷')}</button>
          <button type="button" onClick={() => setId('')}>
            {t('取消')}
          </button>
        </form>
      )}
    </div>
  )
}
