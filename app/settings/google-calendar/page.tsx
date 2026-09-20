'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

type Connection={configured:boolean;connected:boolean;status?:string;last_synced_at?:string|null;error?:string|null;calendar_id?:string;time_zone?:string}
export default function GoogleCalendarPage(){
 const {user,loading}=useAuth(),{lang}=useI18n(),en=lang==='en',client=useMemo(()=>createClient(),[])
 const [connection,setConnection]=useState<Connection|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false)
 const [workspaces,setWorkspaces]=useState<{id:string;name:string}[]>([]),[selected,setSelected]=useState<string[]>([])
 const [zone,setZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone)
 const generation=useRef(0),uid=user?.id
 const reload=useCallback(async()=>{const r=await client.functions.invoke('google-calendar',{body:{action:'status'}});if(r.error)throw r.error;return r.data as Connection},[client])
 useEffect(()=>{const current=++generation.current;setConnection(null);setMessage('');setBusy(false);if(uid)void Promise.all([reload(),client.from('workspaces').select('id,name').eq('user_id',uid).eq('is_archived',false).order('sort_order')]).then(([value,rows])=>{if(current===generation.current){setConnection(value);if(rows.error)throw rows.error;setWorkspaces(rows.data||[]);setSelected([])}}).catch(()=>{if(current===generation.current)setMessage(en?'Calendar integration is not available yet. Try again later.':'日曆整合服務尚未就緒，請稍後重試。')});return()=>{generation.current++}},[uid,reload,en,client])
 async function act(action:'start'|'sync'|'disconnect',resolve=false){
  if(busy)return;const current=generation.current;setBusy(true);setMessage('')
  try{
   if(action==='start')new Intl.DateTimeFormat('en',{timeZone:zone}).format(new Date())
   const result=await client.functions.invoke('google-calendar',{body:{action,resolve_conflicts:resolve,...(action==='start'?{time_zone:zone,workspace_ids:selected}:{})}})
   if(result.error)throw result.error
   if(current!==generation.current)return
   if(action==='start'){
    const url=new URL(result.data.url)
    if(url.origin!=='https://accounts.google.com'||!url.pathname.startsWith('/o/oauth2/'))throw new Error('authorization_url')
    window.location.assign(url.href);return
   }
   const next=await reload();if(current!==generation.current)return;setConnection(next);setConfirm(false)
   const conflicts=Number(result.data.conflicts||0),remaining=Number(result.data.remaining||0)
   setMessage(action==='disconnect'?(result.data.revoked===false?(en?'Disconnected locally. Remove Huddle access in Google Account security settings too. Existing events remain.':'已停止連結。請另至 Google 帳號安全性設定移除 Huddle 權限；既有行程保留。'):(en?'Disconnected. Existing Google events are kept.':'已取消連結，Google 上現有的行程會保留。')):conflicts?(en?'Some Google events have changed. Review the sync status before retrying.':'部分 Google 行程已被修改，請確認同步狀態後再重試。'):remaining?(en?'Some events are still pending. Select Sync now to continue.':'還有行程待同步，請再次點擊立即同步繼續。'):(en?'Synchronization completed.':'同步已完成。'))
  }catch{if(current===generation.current)setMessage(en?'Unable to complete this action. Check your connection and time zone, then retry.':'操作未完成，請確認連線與時區後重試。')}
  finally{if(current===generation.current)setBusy(false)}
 }
 return <main className="mx-auto max-w-2xl space-y-7 px-5 py-8"><Link className="underline" href="/">{en?'Back to Huddle':'返回 Huddle'}</Link><h1 className="text-3xl font-semibold">Google Calendar</h1>
 <p className="text-muted-foreground">{en?'Send your scheduled Huddle events to a separate Huddle calendar in Google. Changes made in Google are not imported.':'把 Huddle 排好的行程同步到 Google 裡獨立的 Huddle 日曆。在 Google 修改的內容不會回傳 Huddle。'}</p>
 {loading?<p>{en?'Loading…':'載入中…'}</p>:!user?<Link href="/login" className="underline">{en?'Sign in to connect':'登入以連結日曆'}</Link>:<section className="space-y-5">
 {Capacitor.isNativePlatform()?<p>{en?'Google Calendar connection on mobile apps is still being prepared. Use Huddle in your web browser for now.':'手機 App 的 Google Calendar 連結仍在準備中，目前請使用瀏覽器版 Huddle。'}</p>:<>
 <p className="font-medium">{connection?.connected?(en?'Connected':'已連結'):en?'Not connected':'尚未連結'}</p>
 {connection?.last_synced_at&&<p className="text-sm">{en?'Last synchronized':'上次同步'}：{new Date(connection.last_synced_at).toLocaleString(en?'en-US':'zh-TW')}</p>}
 {connection?.status==='conflict'&&<Button variant="outline" disabled={busy} onClick={()=>act('sync',true)}>{en?'Replace conflicting Google copies with Huddle events':'以 Huddle 行程覆寫 Google 衝突項目'}</Button>}
 {connection?.error&&<p role="alert">{en?'Synchronization needs attention. Reconnect if permission has expired, or retry later.':'同步需要處理。若授權已失效，請重新連結；或稍後重試。'}</p>}
 {!connection?.configured?<p>{en?'Google Calendar integration is not enabled yet.':'Google Calendar 整合尚未啟用。'}</p>:connection.connected?<>
 <p className="text-sm">{en?'Time zone':'時區'}：{connection.time_zone}</p>
 <p className="text-sm text-muted-foreground">{en?'Only your own scheduled events are sent. Huddle does not send Google invitation emails. Use Sync now to check the latest changes.':'僅同步你自己的已排程行程，不會另外寄送 Google 邀請信。使用「立即同步」確認最新變更。'}</p>
 <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>act('sync')}>{busy?(en?'Working…':'處理中…'):(en?'Sync now':'立即同步')}</Button><Button variant="outline" disabled={busy} onClick={()=>setConfirm(true)}>{en?'Disconnect':'取消連結'}</Button></div>
 {confirm&&<div className="space-y-3 border-t pt-4"><p>{en?'Stop synchronization? The existing Huddle calendar in Google will remain.':'停止同步嗎？Google 上既有的 Huddle 日曆將保留。'}</p><Button variant="outline" disabled={busy} onClick={()=>act('disconnect')}>{en?'Confirm disconnect':'確認取消連結'}</Button><Button variant="ghost" onClick={()=>setConfirm(false)}>{en?'Keep connected':'保留連結'}</Button></div>}
 </>:<>
 <label className="block space-y-2 text-sm">{en?'Time zone for your Huddle schedule':'Huddle 行程的時區'}<input className="w-full rounded-md border bg-background px-3 py-2" value={zone} onChange={e=>setZone(e.target.value)} placeholder="Asia/Taipei" disabled={busy}/></label>
 <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">{en?'Workspaces to synchronize':'選擇要同步的工作區'}</legend>{workspaces.map(w=><label key={w.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(w.id)} disabled={busy} onChange={e=>setSelected(ids=>e.target.checked?[...ids,w.id]:ids.filter(id=>id!==w.id))}/>{w.name}</label>)}</fieldset>
 <p className="text-sm">{en?'Google will ask you to allow Huddle to create and manage its own calendar. Your other Google calendars are unchanged.':'Google 會請你允許 Huddle 建立並管理專屬日曆，不會改動其他 Google 日曆。'}</p>
 <Button disabled={busy||!zone.trim()||!selected.length} onClick={()=>act('start')}>{en?'Connect Google Calendar':'連結 Google Calendar'}</Button>
 </>}
 </>}
 </section>}
 <p className="text-sm text-muted-foreground">{en?'Sync range: 30 days in the past and 365 days ahead. Other Google calendars and time blocks are not included.':'同步範圍：過去 30 天至未來 365 天。其他 Google 日曆與時間區塊不包含在內。'}</p>
 {message&&<p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
 </main>
}
