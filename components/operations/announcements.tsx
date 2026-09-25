'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { operations, dateLabel } from '@/lib/operations/client'
import type {
  Announcement,
  ChannelMetric,
  Membership,
} from '@/lib/operations/types'
import { Field, Feedback, Loading, Empty, styles } from './shared'
import { useAuth } from '@/components/auth/auth-provider'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/react'

export function AdminAnnouncements() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Announcement[]>([])
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    operations<Announcement[]>('admin_announcements')
      .then((d) => {
        if (active) setRows(d)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await operations('admin_announcement', {
        id: editing?.id,
        title: f.get('title'),
        body: f.get('body'),
        kind: f.get('kind'),
        starts_at: new Date(String(f.get('starts_at'))).toISOString(),
        expires_at: new Date(String(f.get('expires_at'))).toISOString(),
        enabled: f.get('enabled') === 'on',
      })
      setRows(await operations('admin_announcements'))
      setEditing(null)
      setMessage(t('公告已儲存'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('儲存失敗'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Feedback error={error} message={message} />
      <section className={styles.panel}>
        <h2>{editing ? t('編輯公告') : t('建立公告')}</h2>
        <p className={styles.muted}>
          {t('公告顯示於已登入會員的工作空間。可以預先排程，也可以取消發布。到期提醒另外在活動設定開關。')}
        </p>
        <form
          key={editing?.id || rows.length}
          className={`${styles.form} mt-5`}
          onSubmit={save}
        >
          <Field label={t('公告標題')}>
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={editing?.title}
            />
          </Field>
          <Field label={t('公告類型')}>
            <select name="kind" defaultValue={editing?.kind || 'notice'}>
              <option value="notice">{t('產品公告')}</option>
              <option value="maintenance">{t('維護通知')}</option>
            </select>
          </Field>
          <div className={styles.full}>
            <Field label={t('公告內容')}>
              <textarea
                name="body"
                required
                maxLength={2000}
                rows={4}
                defaultValue={editing?.body}
              />
            </Field>
          </div>
          <Field label={t('開始時間（裝置時區）')}>
            <input
              type="datetime-local"
              name="starts_at"
              required
              defaultValue={localDate(
                editing?.starts_at || new Date().toISOString()
              )}
            />
          </Field>
          <Field label={t('截止時間（裝置時區）')}>
            <input
              type="datetime-local"
              name="expires_at"
              required
              defaultValue={localDate(
                editing?.expires_at ||
                  new Date(Date.now() + 7 * 86400000).toISOString()
              )}
            />
          </Field>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={editing?.enabled}
            />
            {t('發布此公告')}
          </label>
          <div className={`${styles.actions} ${styles.full}`}>
            <button disabled={busy} className={styles.primary}>
              {t('儲存公告')}
            </button>
            {editing && (
              <button type="button" onClick={() => setEditing(null)}>
                {t('取消編輯')}
              </button>
            )}
          </div>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>{t('公告紀錄')}</h2>
        {loading ? (
          <Loading />
        ) : rows.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('公告')}</th>
                  <th>{t('發布期間')}</th>
                  <th>{t('狀態')}</th>
                  <th>{t('操作')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.title}
                      <small>{r.body}</small>
                    </td>
                    <td>
                      {dateLabel(r.starts_at)}
                      <small>{t('至 {date}', { date: dateLabel(r.expires_at) })}</small>
                    </td>
                    <td>{r.enabled ? t('已設定發布') : t('未發布')}</td>
                    <td>
                      <button onClick={() => setEditing(r)}>{t('編輯公告')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{t('還沒有公告。')}</Empty>
        )}
      </section>
    </>
  )
}
function localDate(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
export function AdminAnalytics() {
  const { t } = useI18n()
  const [rows, setRows] = useState<ChannelMetric[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    operations<ChannelMetric[]>('admin_analytics')
      .then((d) => {
        if (active) setRows(d)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <section className={styles.panel}>
      <h2>{t('來源與留存分析')}</h2>
      <p className={styles.muted}>
        {t('自營運功能啟用後的新會員。以已兌換優惠碼優先、其次有效推薦，其餘為自然註冊；後補優惠碼會更新來源分類。')}
      </p>
      <Feedback error={error} />
      {!rows && !error ? (
        <Loading />
      ) : rows?.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('來源')}</th>
                <th>{t('註冊')}</th>
                <th>{t('開始使用')}</th>
                <th>{t('一週留存')}</th>
                <th>{t('目前付費')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.channel}>
                  <td>{r.channel}</td>
                  <td>{r.registrations}</td>
                  <td>{r.activated}</td>
                  <td>
                    {r.retention_eligible
                      ? `${r.retained}/${r.retention_eligible}（${Math.round((r.retained / r.retention_eligible) * 100)}%）`
                      : t('尚無足夠天數樣本')}
                  </td>
                  <td>{r.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{t('尚無啟用後的新會員資料。')}</Empty>
      )}
      <p className={`${styles.muted} mt-5`}>
        {t('開始使用：有任務或排程寫入紀錄。一週留存：註冊滿 8 天，且第 6–8 個日曆日有操作。付費欄為目前有效權益，不代表累積訂單或營收。')}
      </p>
    </section>
  )
}
/** In-app notices only: no email/OS notification is sent by this component. */
export function OperationsNotices() {
  const { t } = useI18n()
  const { user } = useAuth()
  const path = usePathname()
  const [notices, setNotices] = useState<{ id: string; text: string }[]>([])
  useEffect(() => {
    setNotices([])
    if (!user || path !== '/') return
    let active = true
    void Promise.all([
      operations<Announcement[]>('announcements'),
      operations<Membership>('self'),
    ])
      .then(([rows, self]) => {
        if (!active) return
        const result = rows.map((r) => ({
          id: r.id,
          text: `${r.title}：${r.body}`,
        }))
        if (
          self.settings.reminder_enabled &&
          self.pro_until &&
          (!self.paid_until || Date.parse(self.paid_until) <= Date.now())
        ) {
          const days = Math.ceil(
            (Date.parse(self.pro_until) - Date.now()) / 86400000
          )
          if (days >= 0 && days <= self.settings.reminder_days)
            result.push({
              id: 'expiry',
              text: t('你的贈送／體驗時間將於 {date} 結束。可以在會員頁查看或兌換優惠。', {
                date: dateLabel(self.pro_until),
              }),
            })
        }
        setNotices(result)
      })
      .catch(() => {
        /* Existing workspace remains usable before migration/offline. */
      })
    return () => {
      active = false
    }
  }, [user?.id, path, t])
  if (!notices.length) return null
  return (
    <aside
      aria-label={t('會員通知')}
      className="fixed bottom-4 left-4 z-[70] max-h-[40vh] w-[min(400px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm shadow-lg"
    >
      {notices.map((n) => (
        <div key={n.id} className="mb-3">
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {n.text}
          </p>
          <button
            className="min-h-11 underline"
            onClick={() => setNotices((v) => v.filter((x) => x.id !== n.id))}
          >
            {t('關閉通知')}
          </button>
        </div>
      ))}
      <Link
        className="inline-flex min-h-11 items-center underline"
        href="/membership"
      >
        {t('會員與推薦')}
      </Link>
    </aside>
  )
}
