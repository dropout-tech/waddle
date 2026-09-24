'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { createClient } from '@/lib/supabase/client'
export default function GoogleCalendarCallback(){
 const {user,loading}=useAuth(),{lang}=useI18n(),en=lang==='en',started=useRef(false)
 const [state,setState]=useState<'waiting'|'success'|'failed'|'denied'>('waiting')
 useEffect(()=>{
  if(loading||!user||started.current)return
  started.current=true
  const params=new URLSearchParams(location.search),code=params.get('code'),oauthState=params.get('state')
  // This code belongs only to Calendar OAuth; never pass it to Supabase Auth.
  history.replaceState(null,'',location.pathname)
  if(params.has('error')){setState('denied');return}
  if(!code||!oauthState){setState('failed');return}
  const watchdog=setTimeout(()=>setState('failed'),25000)
  void createClient().functions.invoke('google-calendar',{body:{action:'finish',code,state:oauthState}}).then(result=>{clearTimeout(watchdog);setState(result.error?'failed':'success')}).catch(()=>{clearTimeout(watchdog);setState('failed')})
 },[loading,user])
 return <main className="mx-auto max-w-xl space-y-5 px-5 py-12"><h1 className="text-2xl font-semibold">Google Calendar</h1><p role="status">{!loading&&!user?(en?'Return to Huddle and reconnect from your signed-in browser.':'請返回已登入的 Huddle 瀏覽器，重新連結日曆。'):state==='success'?(en?'Calendar connected. You can now synchronize your schedule.':'日曆已連結，可以開始同步行程。'):state==='denied'?(en?'Authorization cancelled. Your calendars are unchanged.':'已取消授權，日曆沒有變更。'):state==='failed'?(en?'Connection could not be confirmed. Check its status before reconnecting.':'尚未確認連結完成，請先查看連結狀態，再重新授權。'):(en?'Connecting your calendar…':'正在連結日曆…')}</p><Link className="inline-flex min-h-11 items-center underline" href="/settings/google-calendar">{en?'Return to calendar settings':'返回日曆整合設定'}</Link></main>
}
