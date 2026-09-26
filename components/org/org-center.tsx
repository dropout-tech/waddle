'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Copy, Crown, Link2, Loader2, LogOut, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { PersonAvatar } from '@/components/assignments/task-assign-section'
import {
  getMyOrganizations,
  createOrganization,
  createOrgInvite,
  orgInviteLink,
  getOrgMembers,
  getOrgBoard,
  removeOrgMember,
  setOrgMemberRole,
  leaveOrg,
  deleteOrganization,
  assignmentErrorMessage,
  notifyAssignmentsChanged,
  type OrgSummary,
  type OrgMember,
  type OrgBoardItem,
} from '@/lib/assignments'

const ROLE_LABEL: Record<OrgMember['role'], string> = { owner: '擁有者', admin: '管理員', member: '成員' }

export function OrgCenter() {
  const { t } = useI18n()
  const [data, setData] = useState<{ canCreate: boolean; orgs: OrgSummary[] } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getMyOrganizations()
      setData(res)
      setError('')
      setSelected((cur) => (cur && res.orgs.some((o) => o.id === cur) ? cur : res.orgs[0]?.id ?? null))
    } catch (err) {
      setData({ canCreate: false, orgs: [] })
      setError(assignmentErrorMessage(err))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!data) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  const org = data.orgs.find((o) => o.id === selected) ?? null

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data.orgs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {data.orgs.map((o) => (
            <button key={o.id} onClick={() => setSelected(o.id)}
              className={cn('min-h-11 rounded-full border px-4 text-sm', o.id === selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
              {o.name}
            </button>
          ))}
          {data.canCreate && !creating && (
            <button onClick={() => setCreating(true)} className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted">
              <Plus className="h-4 w-4" />{t('新組織')}
            </button>
          )}
        </div>
      )}
      {(data.orgs.length === 0 || creating) && (
        <CreateOrg canCreate={data.canCreate} onCancel={data.orgs.length ? () => setCreating(false) : undefined}
          onCreated={async (id) => { setCreating(false); setSelected(id); await load() }} />
      )}
      {org && !creating && <OrgDetail key={org.id} org={org} onChanged={load} />}
    </div>
  )
}

function CreateOrg({ canCreate, onCreated, onCancel }: { canCreate: boolean; onCreated: (id: string) => Promise<void>; onCancel?: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await createOrganization(name.trim())
      toast.success(t('組織已建立'))
      await onCreated(id)
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-testid="org-create" className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">{t('建立組織')}</h2>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Pro</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('組織成員不必互相共享行事曆，就能彼此指派任務，並在組織看板看到每個人被指派的進度。私人任務永遠不會公開。')}
      </p>
      {canCreate ? (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={t('組織名稱，例如「行銷部」')}
            aria-label={t('組織名稱')} className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
          <div className="flex gap-2">
            {onCancel && <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-sm">{t('取消')}</button>}
            <button type="submit" disabled={busy || !name.trim()} className="min-h-11 rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('建立')}
            </button>
          </div>
        </form>
      ) : (
        <div data-testid="org-upgrade" className="rounded-xl bg-muted/60 p-4">
          <p className="text-sm">{t('建立組織是 Pro 會員功能。升級後就能建立組織、產生邀請連結。')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('收到別人的邀請連結？直接打開連結即可免費加入。')}</p>
          <Link href="/membership" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">{t('查看 Pro 會員')}</Link>
        </div>
      )}
    </section>
  )
}

function OrgDetail({ org, onChanged }: { org: OrgSummary; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [members, setMembers] = useState<OrgMember[] | null>(null)
  const [board, setBoard] = useState<OrgBoardItem[] | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const manager = org.role === 'owner' || org.role === 'admin'

  const load = useCallback(async () => {
    try {
      const [m, b] = await Promise.all([getOrgMembers(org.id), getOrgBoard(org.id)])
      if (alive.current) { setMembers(m); setBoard(b) }
    } catch (err) {
      if (alive.current) { setMembers([]); setBoard([]); toast.error(assignmentErrorMessage(err)) }
    }
  }, [org.id])
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [load])

  async function run(action: () => Promise<unknown>, ok: string, after?: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      toast.success(ok)
      notifyAssignmentsChanged()
      await (after ?? load)()
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  async function makeLink() {
    setBusy(true)
    try {
      setLink(orgInviteLink(await createOrgInvite(org.id)))
    } catch (err) {
      toast.error(assignmentErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success(t('已複製邀請連結')) }
    catch { toast.error(t('無法自動複製，請手動選取連結')) }
  }

  const byAssignee = new Map<string, OrgBoardItem[]>()
  for (const item of board ?? []) byAssignee.set(item.assigneeId, [...(byAssignee.get(item.assigneeId) ?? []), item])

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{org.name}</h2>
            <p className="text-xs text-muted-foreground">{t('你的角色：{role}', { role: t(ROLE_LABEL[org.role]) })} · {t('{count} 位成員', { count: org.memberCount })}</p>
          </div>
          {org.role === 'owner' ? (
            <button disabled={busy} onClick={() => { if (window.confirm(t('確定解散「{name}」？所有組織內的指派都會解除。', { name: org.name }))) void run(() => deleteOrganization(org.id), t('組織已解散'), onChanged) }}
              className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />{t('解散組織')}
            </button>
          ) : (
            <button disabled={busy} onClick={() => { if (window.confirm(t('確定退出「{name}」？你在組織內的指派都會解除。', { name: org.name }))) void run(() => leaveOrg(org.id), t('已退出組織'), onChanged) }}
              className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">
              <LogOut className="h-4 w-4" />{t('退出組織')}
            </button>
          )}
        </div>
        {manager && (
          <div data-testid="org-invite" className="mt-4 rounded-xl bg-muted/50 p-3">
            <p className="mb-2 text-sm font-medium">{t('邀請成員')}</p>
            {link ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('邀請連結')}
                  className="min-h-11 flex-1 truncate rounded-lg border border-border bg-background px-3 text-xs" />
                <button onClick={copy} className="flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-4 text-sm text-primary-foreground"><Copy className="h-4 w-4" />{t('複製')}</button>
              </div>
            ) : (
              <button disabled={busy} onClick={makeLink} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm">
                <Link2 className="h-4 w-4" />{t('產生邀請連結')}
              </button>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t('連結 7 天內有效、可多人使用；重新產生會讓舊連結失效。')}</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 font-semibold">{t('成員')}</h3>
        {members === null ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <ul data-testid="org-members" className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.userId} className="flex min-h-14 items-center gap-3 py-2">
                <PersonAvatar name={m.displayName} url={m.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.displayName}{m.userId === user?.id ? ` ${t('（你）')}` : ''}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">{m.role === 'owner' && <Crown className="h-3 w-3" />}{t(ROLE_LABEL[m.role])}</p>
                </div>
                {org.role === 'owner' && m.role !== 'owner' && (
                  <button disabled={busy} onClick={() => run(() => setOrgMemberRole(org.id, m.userId, m.role === 'admin' ? 'member' : 'admin'), t('已更新角色'))}
                    className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">
                    {m.role === 'admin' ? t('改為成員') : t('設為管理員')}
                  </button>
                )}
                {m.role !== 'owner' && m.userId !== user?.id && (org.role === 'owner' || (org.role === 'admin' && m.role === 'member')) && (
                  <button disabled={busy} onClick={() => { if (window.confirm(t('確定將 {name} 移出組織？', { name: m.displayName }))) void run(() => removeOrgMember(org.id, m.userId), t('已移除成員')) }}
                    className="min-h-11 rounded-lg px-2 text-xs text-destructive hover:bg-destructive/10">
                    {t('移除')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="org-board" className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-1 font-semibold">{t('組織看板')}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t('只顯示在這個組織內被指派的任務；每個人的私人任務不會出現在這裡。')}</p>
        {board === null || members === null ? <Loader2 className="h-4 w-4 animate-spin" /> : board.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{t('目前沒有組織內的指派。打開任務，在「指派給」選擇組織成員即可。')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {members.filter((m) => byAssignee.has(m.userId)).map((m) => {
              const items = byAssignee.get(m.userId) ?? []
              return (
                <div key={m.userId} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <PersonAvatar name={m.displayName} url={m.avatarUrl} size={24} />
                    <p className="flex-1 truncate text-sm font-medium">{m.displayName}</p>
                    <span className="text-xs text-muted-foreground">{t('{done}/{total} 完成', { done: items.filter((i) => i.isCompleted).length, total: items.length })}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((i) => (
                      <li key={i.taskId} className="flex items-center gap-2 text-sm">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', i.isCompleted ? 'bg-primary' : 'bg-muted-foreground/40')} />
                        <span className={cn('min-w-0 flex-1 truncate', i.isCompleted && 'text-muted-foreground line-through')}>{i.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{i.dueDate ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
