'use client'

// Client wrappers for task assignment + organization RPCs
// (supabase/migrations/20260927120000_task_assignments_orgs.sql).
// Every authorization decision happens in the database; these helpers only
// shape data and map error codes to user-facing (i18n) messages.

import { createClient } from '@/lib/supabase/client'
import { t } from '@/lib/i18n'
import { isNative } from '@/lib/platform'
import type { TaskAssignment } from '@/lib/types'

/** sessionStorage key for an org invite token pending across the login round-trip. */
export const PENDING_ORG_INVITE_KEY = 'huddle-pending-org-invite'

/** Where to resume after login if an org invite is pending (else null). */
export function pendingOrgInvitePath(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_ORG_INVITE_KEY) ? '/org/invite' : null
  } catch {
    return null
  }
}

export interface AssignmentRecord extends TaskAssignment {
  taskId: string
  title: string
  isCompleted: boolean
  completedAt?: string
  scheduledDate?: string
  dueDate?: string
}

export interface AssignablePerson {
  userId: string
  displayName: string
  avatarUrl?: string
  source: 'share' | 'org'
  orgId?: string
  orgName?: string
}

export interface OrgSummary {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
  memberCount: number
  createdAt: string
}

export interface OrgMember {
  userId: string
  displayName: string
  avatarUrl?: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
}

export interface OrgBoardItem {
  taskId: string
  title: string
  assigneeId: string
  assigneeName: string
  assignerId: string
  assignerName: string
  isCompleted: boolean
  completedAt?: string
  dueDate?: string
  scheduledDate?: string
}

const ERRORS: Record<string, string> = {
  TASK_NOT_FOUND: '找不到這個任務，可能已被刪除或取消指派',
  RECURRING_NOT_SUPPORTED: '重複任務暫不支援指派',
  ASSIGNEE_NOT_ALLOWED: '只能指派給已共享行事曆的人，或同組織的成員',
  RETURN_NOTE_REQUIRED: '退回時請寫一句理由',
  PRO_REQUIRED: '建立組織需要 Pro 會員',
  ORG_LIMIT: '每人最多建立 3 個組織',
  INVALID_NAME: '組織名稱需為 1–60 字',
  ORG_FULL: '這個組織已達 200 位成員上限',
  OWNER_CANNOT_LEAVE: '擁有者無法退出組織，如要結束請解散組織',
  FORBIDDEN: '你沒有權限執行這個操作',
  REMOVED_FROM_ORG: '你已被移出這個組織，請聯絡管理員重新開放',
  'invalid invite': '邀請連結無效或已過期',
}

/** Map an RPC error to a translated, user-facing message. */
export function assignmentErrorMessage(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  for (const [code, msg] of Object.entries(ERRORS)) if (raw.includes(code)) return t(msg)
  // PostgREST "function not found" — migration not applied yet.
  if (raw.includes('Could not find the function') || raw.includes('PGRST202')) return t('指派功能尚未啟用，請稍後再試')
  return t('操作失敗，請再試一次')
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = createClient()
  // The generated Database type lists these functions; a loose call keeps the
  // wrapper generic without re-declaring each signature here.
  const { data, error } = await (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: T; error: unknown }>)(fn, args)
  if (error) throw error
  return data
}

type AssignmentRow = {
  task_id: string; role: 'assignee' | 'assigner'; peer_id: string; peer_name: string | null
  peer_avatar: string | null; status: 'active' | 'returned'; return_note: string | null
  organization_id: string | null; organization_name: string | null; assigned_at: string | null
  title: string; is_completed: boolean; completed_at: string | null
  scheduled_date: string | null; due_date: string | null
}

export async function listAssignments(): Promise<AssignmentRecord[]> {
  const rows = await rpc<AssignmentRow[]>('list_task_assignments')
  return (rows ?? []).map((r) => ({
    taskId: r.task_id,
    role: r.role,
    peerId: r.peer_id,
    peerName: r.peer_name || t('Huddle 使用者'),
    peerAvatar: r.peer_avatar ?? undefined,
    status: r.status,
    returnNote: r.return_note ?? undefined,
    organizationId: r.organization_id ?? undefined,
    organizationName: r.organization_name ?? undefined,
    assignedAt: r.assigned_at ?? undefined,
    title: r.title,
    isCompleted: r.is_completed,
    completedAt: r.completed_at ?? undefined,
    scheduledDate: r.scheduled_date ?? undefined,
    dueDate: r.due_date ?? undefined,
  }))
}

export function toTaskAssignment(r: AssignmentRecord): TaskAssignment {
  return {
    role: r.role, peerId: r.peerId, peerName: r.peerName, peerAvatar: r.peerAvatar,
    status: r.status, returnNote: r.returnNote, organizationId: r.organizationId,
    organizationName: r.organizationName, assignedAt: r.assignedAt,
  }
}

export async function listAssignablePeople(): Promise<AssignablePerson[]> {
  const rows = await rpc<{ user_id: string; display_name: string | null; avatar_url: string | null; source: 'share' | 'org'; org_id: string | null; org_name: string | null }[]>('get_assignable_people')
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name || t('Huddle 使用者'),
    avatarUrl: r.avatar_url ?? undefined,
    source: r.source,
    orgId: r.org_id ?? undefined,
    orgName: r.org_name ?? undefined,
  }))
}

export const assignTask = (taskId: string, assigneeId: string, orgId?: string) =>
  rpc<void>('assign_task', { p_task: taskId, p_assignee: assigneeId, p_org: orgId ?? null })
export const unassignTask = (taskId: string) => rpc<void>('unassign_task', { p_task: taskId })
export const returnTask = (taskId: string, note: string) => rpc<void>('return_task', { p_task: taskId, p_note: note })

export async function getMyOrganizations(): Promise<{ canCreate: boolean; orgs: OrgSummary[] }> {
  const data = await rpc<{ can_create: boolean; orgs: { id: string; name: string; role: OrgSummary['role']; member_count: number; created_at: string }[] }>('get_my_organizations')
  return {
    canCreate: Boolean(data?.can_create),
    orgs: (data?.orgs ?? []).map((o) => ({ id: o.id, name: o.name, role: o.role, memberCount: o.member_count, createdAt: o.created_at })),
  }
}
export const createOrganization = (name: string) => rpc<string>('create_organization', { p_name: name })
export const createOrgInvite = (orgId: string) => rpc<string>('create_org_invite', { p_org: orgId })
export async function previewOrgInvite(token: string) {
  const rows = await rpc<{ org_name: string; inviter_name: string | null; member_count: number; already_member: boolean }[]>('preview_org_invite', { p_token: token })
  const r = rows?.[0]
  return r ? { orgName: r.org_name, inviterName: r.inviter_name ?? '', memberCount: Number(r.member_count), alreadyMember: r.already_member } : null
}
export const acceptOrgInvite = (token: string) => rpc<string>('accept_org_invite', { p_token: token })
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await rpc<{ user_id: string; display_name: string | null; avatar_url: string | null; role: OrgMember['role']; joined_at: string }[]>('get_org_members', { p_org: orgId })
  return (rows ?? []).map((r) => ({ userId: r.user_id, displayName: r.display_name || t('Huddle 使用者'), avatarUrl: r.avatar_url ?? undefined, role: r.role, joinedAt: r.joined_at }))
}
export async function getOrgBoard(orgId: string): Promise<OrgBoardItem[]> {
  const rows = await rpc<{ task_id: string; title: string; assignee_id: string; assignee_name: string | null; assigner_id: string; assigner_name: string | null; is_completed: boolean; completed_at: string | null; due_date: string | null; scheduled_date: string | null }[]>('get_org_board', { p_org: orgId })
  return (rows ?? []).map((r) => ({
    taskId: r.task_id, title: r.title, assigneeId: r.assignee_id,
    assigneeName: r.assignee_name || t('Huddle 使用者'), assignerId: r.assigner_id,
    assignerName: r.assigner_name || t('Huddle 使用者'), isCompleted: r.is_completed,
    completedAt: r.completed_at ?? undefined, dueDate: r.due_date ?? undefined, scheduledDate: r.scheduled_date ?? undefined,
  }))
}
export const removeOrgMember = (orgId: string, userId: string) => rpc<void>('remove_org_member', { p_org: orgId, p_user: userId })
export const setOrgMemberRole = (orgId: string, userId: string, role: 'admin' | 'member') => rpc<void>('set_org_member_role', { p_org: orgId, p_user: userId, p_role: role })
export const leaveOrg = (orgId: string) => rpc<void>('leave_org', { p_org: orgId })
export const deleteOrganization = (orgId: string) => rpc<void>('delete_organization', { p_org: orgId })

/** Invite link: token in the fragment so it never reaches a server log. */
export function orgInviteLink(token: string): string {
  // Native WebViews have a capacitor:// origin that can't be shared; use the
  // public web origin like enrollmentLink() in lib/operations/client.ts.
  const origin = !isNative() && /^https?:$/.test(window.location.protocol)
    ? window.location.origin
    : 'https://waddle.zeabur.app'
  return `${origin}/org/invite#t=${encodeURIComponent(token)}`
}

/** Broadcast so the board data hook refetches after an assignment change. */
export const ASSIGNMENTS_CHANGED_EVENT = 'huddle:assignments-changed'
export function notifyAssignmentsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED_EVENT))
}
