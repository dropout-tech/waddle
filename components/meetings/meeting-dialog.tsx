'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/react'
import type { SharePeer } from '@/hooks/use-calendar-sharing'
import type {
  MeetingController,
  MeetingSearch,
  MeetingInvitation,
  MeetingResponse,
} from '@/hooks/use-meeting-invitations'
import type { Task, TimeBlock } from '@/lib/types'
import { toDateString } from '@/lib/calendar-utils'
import { buildMeetingICS } from '@/lib/meeting-availability'
const copy = {
  zh: {
    heading: '約交集時間',
    scope:
      '依對方已共享行程與共同邀請計算，未共享或外部日曆不包含；時間可能在寄出後變動。送出前會再次檢查。',
    people: '選擇共享夥伴',
    noPeers: '請先在共享設定與夥伴建立共享。',
    from: '開始日期',
    to: '結束日期（最多 14 天）',
    start: '每天開始時間',
    end: '每天結束時間',
    duration: '會議長度（分鐘）',
    search: '尋找共同空檔',
    searching: '正在比對…',
    none: '這個範圍沒有共同空檔，請調整日期或時間。',
    title: '會議名稱',
    description: '說明',
    location: '地點或視訊連結',
    send: '建立邀請並寄送 Email',
    saving: '正在建立…',
    saved: '站內邀請已建立。',
    emailSent: 'Email 已寄送。',
    emailPending: 'Email 尚未確認寄出，請查看寄送狀態；站內邀請仍然有效。',
    sharingRequired:
      '選擇的夥伴尚未開放行程。請先請對方到「設定 → 共享」開放要比對的行程類別，再尋找共同空檔。',
    failure:
      '無法完成操作，請重試。若共享範圍不足或連線失敗，系統不會將未知時間當成空檔。',
    changed: '這個時段已變更，請重新尋找共同空檔。',
    inbox: '會議邀請',
    empty: '目前沒有會議邀請。',
    refresh: '重新整理',
    accepted: '接受',
    tentative: '暫定',
    declined: '婉拒',
    pending: '待回覆',
    cancelled: '已取消',
    cancel: '取消會議',
    ics: '下載行事曆檔',
    email: 'Email 狀態',
    timezone: '時間以此裝置時區顯示',
    retryEmail: '重試寄送 Email',
    minutes: '分鐘',
    slots: '共同空檔',
    loading: '正在載入邀請…',
    select: '請先選擇夥伴與有效日期範圍。',
  },
  en: {
    heading: 'Find a time',
    scope:
      'Availability includes shared calendars and joint invitations. Private and external calendars are not included. Times may change after sending; we check again before sending.',
    people: 'Choose shared partners',
    noPeers: 'Connect with a partner in Sharing settings first.',
    from: 'From date',
    to: 'To date (up to 14 days)',
    start: 'Day starts at',
    end: 'Day ends at',
    duration: 'Meeting length (minutes)',
    search: 'Find common times',
    searching: 'Checking calendars…',
    none: 'No common times in this range. Try other dates or hours.',
    title: 'Meeting title',
    description: 'Description',
    location: 'Location or video link',
    send: 'Create invitation and send email',
    saving: 'Creating…',
    saved: 'In-app invitation created.',
    emailSent: 'Email sent.',
    emailPending:
      'Email delivery is not confirmed. Check its status; the in-app invitation is still available.',
    sharingRequired:
      'A selected partner has not shared any calendars yet. Ask them to enable calendar categories in Settings → Sharing, then search again.',
    failure:
      'Unable to complete this action. Please retry. Missing sharing permissions or failed requests are never treated as free time.',
    changed: 'This time is no longer available. Please search again.',
    inbox: 'Meeting invitations',
    empty: 'No meeting invitations yet.',
    refresh: 'Refresh',
    accepted: 'Accept',
    tentative: 'Tentative',
    declined: 'Decline',
    pending: 'Awaiting reply',
    cancelled: 'Cancelled',
    cancel: 'Cancel meeting',
    ics: 'Download calendar file',
    email: 'Email status',
    timezone: 'Times use this device’s time zone',
    retryEmail: 'Retry email',
    minutes: 'minutes',
    slots: 'Common times',
    loading: 'Loading invitations…',
    select: 'Choose partners and a valid date range first.',
  },
}
const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
export function MeetingDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
} & MeetingPanelProps) {
  const { lang } = useI18n()
  const t = copy[lang === 'en' ? 'en' : 'zh']
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[100dvh] w-full max-w-none flex-col overflow-y-auto rounded-none sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>{t.heading}</DialogTitle>
          <DialogDescription>{t.scope}</DialogDescription>
        </DialogHeader>
        <MeetingPanel {...props} />
      </DialogContent>
    </Dialog>
  )
}
export interface MeetingPanelProps {
  controller: MeetingController
  peers: SharePeer[]
  tasks: Task[]
  timeBlocks: TimeBlock[]
  initialDate?: Date
  inviteId?: string
}
export function MeetingPanel({
  controller,
  peers,
  tasks,
  timeBlocks,
  initialDate = new Date(),
  inviteId,
}: MeetingPanelProps) {
  const { lang } = useI18n()
  const t = copy[lang === 'en' ? 'en' : 'zh']
  const english = lang === 'en'
  const [search, setSearch] = useState<MeetingSearch>({
    peerIds: [],
    from: toDateString(initialDate),
    to: toDateString(initialDate),
    startHour: 9,
    endHour: 18,
    durationMinutes: 30,
  })
  const [slots, setSlots] = useState<{ start: string; end: string }[] | null>(
      null,
    ),
    [selected, setSelected] = useState<{ start: string; end: string } | null>(
      null,
    )
  const [fields, setFields] = useState({
      title: '',
      description: '',
      location: '',
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const requestId = useRef<string | null>(null),
    generation = useRef(0)
  useEffect(() => {
    if (inviteId && controller.meetings.some((m) => m.id === inviteId))
      document
        .getElementById(`invite-${inviteId}`)
        ?.scrollIntoView({ block: 'nearest' })
  }, [inviteId, controller.meetings])
  const update = (patch: Partial<MeetingSearch>) => {
    generation.current++
    setSearch((s) => ({ ...s, ...patch }))
    setSlots(null)
    setSelected(null)
    requestId.current = null
    setMessage('')
  }
  const dateFormat = new Intl.DateTimeFormat(english ? 'en-US' : 'zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const timeFormat = new Intl.DateTimeFormat(english ? 'en-US' : 'zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const formatEnd = (start: string, end: string) =>
    toDateString(new Date(start)) === toDateString(new Date(end))
      ? timeFormat.format(new Date(end))
      : dateFormat.format(new Date(end))
  const searchSlots = async () => {
    if (!search.peerIds.length) {
      setMessage(t.select)
      return
    }
    const current = ++generation.current
    setBusy(true)
    setMessage('')
    setSlots(null)
    setSelected(null)
    try {
      const found = await controller.findSlots(search, tasks, timeBlocks)
      if (current === generation.current) {
        setSlots(found)
        setSelected(null)
      }
    } catch (error) {
      if (current === generation.current)
        setMessage(
          error instanceof Error && error.message === 'sharing_required'
            ? t.sharingRequired
            : t.failure,
        )
    } finally {
      setBusy(false)
    }
  }
  const send = async () => {
    if (!selected || !fields.title.trim()) return
    setBusy(true)
    setMessage('')
    requestId.current ??= crypto.randomUUID()
    try {
      const result = await controller.create(
        search,
        selected,
        { ...fields, title: fields.title.trim() },
        tasks,
        timeBlocks,
        requestId.current,
      )
      setMessage(
        `${t.saved} ${result.emailSent ? t.emailSent : t.emailPending}`,
      )
      setSelected(null)
      setSlots(null)
      requestId.current = null
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === 'changed'
          ? t.changed
          : error instanceof Error && error.message === 'sharing_required'
            ? t.sharingRequired
            : t.failure,
      )
      if (error instanceof Error && error.message === 'changed') {
        setSlots(null)
        setSelected(null)
        requestId.current = null
      }
    } finally {
      setBusy(false)
    }
  }
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch {
      setMessage(t.failure)
    } finally {
      setBusy(false)
    }
  }
  const download = (m: MeetingInvitation) => {
    const url = URL.createObjectURL(
      new Blob([buildMeetingICS(m)], { type: 'text/calendar;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'huddle-meeting.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {t.timezone}: {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">{t.people}</legend>
        {!peers.length ? (
          <p className="text-sm text-muted-foreground">{t.noPeers}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {peers.map((peer) => (
              <label
                key={peer.peerId}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={search.peerIds.includes(peer.peerId)}
                  onChange={(e) =>
                    update({
                      peerIds: e.target.checked
                        ? [...search.peerIds, peer.peerId]
                        : search.peerIds.filter((id) => id !== peer.peerId),
                    })
                  }
                />
                {peer.displayName || (english ? 'Shared partner' : '共享夥伴')}
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            {t.from}
            <input
              type="date"
              className={inputClass}
              value={search.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            {t.to}
            <input
              type="date"
              className={inputClass}
              min={search.from}
              value={search.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            {t.start}
            <input
              type="time"
              className={inputClass}
              step="3600"
              value={`${String(search.startHour).padStart(2, '0')}:00`}
              onChange={(e) =>
                update({ startHour: Number(e.target.value.split(':')[0]) })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            {t.end}
            <input
              type="time"
              className={inputClass}
              step="3600"
              value={`${String(search.endHour).padStart(2, '0')}:00`}
              onChange={(e) =>
                update({ endHour: Number(e.target.value.split(':')[0]) })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            {t.duration}
            <select
              className={inputClass}
              value={search.durationMinutes}
              onChange={(e) =>
                update({ durationMinutes: Number(e.target.value) })
              }
            >
              {[15, 30, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {n} {t.minutes}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          type="button"
          disabled={!search.peerIds.length || busy}
          onClick={searchSlots}
        >
          {busy ? t.searching : t.search}
        </Button>
      </fieldset>
      {slots && (
        <section aria-label={t.slots}>
          <h3 className="mb-2 text-sm font-medium">{t.slots}</h3>
          {!slots.length ? (
            <p className="text-sm">{t.none}</p>
          ) : (
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {slots.map((slot) => (
                <button
                  disabled={busy}
                  type="button"
                  key={slot.start}
                  data-start={slot.start}
                  aria-pressed={selected?.start === slot.start}
                  onClick={() => {
                    setSelected(slot)
                    requestId.current = null
                  }}
                  className={`rounded-md border px-3 py-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring ${selected?.start === slot.start ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/30 bg-primary/5 hover:bg-primary/10'}`}
                >
                  {dateFormat.format(new Date(slot.start))} –{' '}
                  {formatEnd(slot.start, slot.end)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {selected && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <p className="font-medium">
            {dateFormat.format(new Date(selected.start))} –{' '}
            {formatEnd(selected.start, selected.end)}
          </p>
          {(['title', 'description', 'location'] as const).map((key) => (
            <label key={key} className="block space-y-1 text-sm">
              {t[key]}
              <input
                required={key === 'title'}
                maxLength={key === 'description' ? 2000 : 200}
                disabled={busy}
                className={inputClass}
                value={fields[key]}
                onChange={(e) => {
                  setFields({ ...fields, [key]: e.target.value })
                  requestId.current = null
                }}
              />
            </label>
          ))}
          <Button disabled={busy || !fields.title.trim()} type="submit">
            {busy ? t.saving : t.send}
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="rounded-md border p-3 text-sm">
          {message}
        </p>
      )}
      <section className="space-y-3 border-t pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">
            {t.inbox}
            {controller.pendingCount > 0 ? ` (${controller.pendingCount})` : ''}
          </h3>
          <Button
            type="button"
            variant="ghost"
            disabled={controller.loading || busy}
            onClick={() => controller.refresh()}
          >
            {t.refresh}
          </Button>
        </div>
        {controller.error && (
          <p role="alert" className="text-sm text-destructive">
            {t.failure}
          </p>
        )}
        {controller.loading && <p className="text-sm">{t.loading}</p>}
        {!controller.loading && !controller.meetings.length && (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        )}
        {controller.meetings.map((m) => {
          const mine = m.participants.find(
            (p) => p.user_id === controller.user?.id,
          )
          const organizer = m.organizer_id === controller.user?.id
          return (
            <article
              key={m.id}
              id={`invite-${m.id}`}
              className={`space-y-2 rounded-lg border p-4 ${inviteId === m.id ? 'border-primary bg-primary/5' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{m.title}</h4>
                <span className="text-xs text-muted-foreground">
                  {m.status === 'cancelled'
                    ? t.cancelled
                    : mine
                      ? t[mine.response]
                      : ''}
                </span>
              </div>
              <p className="text-sm">
                {dateFormat.format(new Date(m.starts_at))} –{' '}
                {formatEnd(m.starts_at, m.ends_at)}
              </p>
              {m.description && (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {m.description}
                </p>
              )}
              {m.location && (
                <p className="break-words text-sm">{m.location}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {m.participants
                  .map(
                    (p) =>
                      `${p.display_name || (english ? 'Partner' : '夥伴')} · ${t[p.response]}`,
                  )
                  .join(' / ')}
              </p>
              {organizer && (
                <p className="text-xs text-muted-foreground">
                  {t.email}:{' '}
                  {m.email_status &&
                  m.email_status.sent > 0 &&
                  m.email_status.pending === 0 &&
                  m.email_status.failed === 0
                    ? t.emailSent
                    : t.emailPending}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {m.status !== 'cancelled' &&
                  !organizer &&
                  (
                    ['accepted', 'tentative', 'declined'] as MeetingResponse[]
                  ).map((response) => (
                    <Button
                      key={response}
                      variant={
                        mine?.response === response ? 'default' : 'outline'
                      }
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act(() => controller.respond(m.id, response))
                      }
                    >
                      {t[response]}
                    </Button>
                  ))}
                {m.status !== 'cancelled' && organizer && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => act(() => controller.cancel(m.id))}
                  >
                    {t.cancel}
                  </Button>
                )}
                {organizer && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => act(() => controller.retryEmail(m.id))}
                  >
                    {t.retryEmail}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => download(m)}>
                  {t.ics}
                </Button>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
