'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { useCalendarSharing } from '@/hooks/use-calendar-sharing'
import { useMeetingInvitations } from '@/hooks/use-meeting-invitations'
import { MeetingPanel } from '@/components/meetings/meeting-dialog'
export default function MeetingsPage(){
 const {user,loading}=useAuth();const {lang}=useI18n();const en=lang==='en';const {peers}=useCalendarSharing(!!user);const [inviteId,setInviteId]=useState<string>();const controller=useMeetingInvitations(undefined,inviteId)
 useEffect(()=>{
  const id=new URLSearchParams(location.search).get('invite')
  if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return
  queueMicrotask(()=>setInviteId(id))
  try{
   if(!user&&!loading)sessionStorage.setItem('huddle-pending-meeting-invite',id)
   if(user)sessionStorage.removeItem('huddle-pending-meeting-invite')
  }catch{/* The invitation remains readable even when browser storage is blocked. */}
 },[user,loading])
 if(loading)return <main className="p-8">{en?'Loading…':'載入中…'}</main>
 if(!user)return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-2xl">{en?'Meeting invitation':'會議邀請'}</h1><p>{en?'Sign in to view and respond to your invitation.':'請先登入以查看並回覆邀請。'}</p><Link className="underline" href="/login">{en?'Sign in':'登入'}</Link></main>
 return <main className="mx-auto max-w-3xl space-y-5 p-5 sm:p-8"><Link href="/" className="text-sm underline">{en?'Back to calendar':'返回行事曆'}</Link><h1 className="text-2xl font-semibold">{en?'Meeting invitations':'會議邀請'}</h1><p className="text-sm text-muted-foreground">{en?'Common times reflect currently shared calendars, not a guaranteed reservation.':'共同空檔僅依目前共享行程判斷，不代表已保留時段。'}</p><MeetingPanel controller={controller} peers={peers} tasks={[]} timeBlocks={[]} inviteId={inviteId}/></main>
}
