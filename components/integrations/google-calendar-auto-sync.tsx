'use client'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/components/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'

/** Opt-in, foreground-only synchronization. Server always reads authoritative data. */
export function GoogleCalendarAutoSync({revision}:{revision:string}){
 const {user}=useAuth()
 useEffect(()=>{
  if(!user||Capacitor.isNativePlatform())return
  const client=createClient();let stopped=false,running=false
  const enabled=()=>{
   if(stopped||document.visibilityState!=='visible')return false
   try{return localStorage.getItem(`huddle-google-auto:${user.id}`)==='true'}catch{return false}
  }
  const invoke=async(action:'status'|'sync')=>{
   if(!enabled())return null
   const {data:{session}}=await client.auth.getSession()
   if(!enabled()||session?.user.id!==user.id)return null
   // Pin this wake to its original account, even if the SDK session changes.
   return client.functions.invoke('google-calendar',{body:{action},headers:{Authorization:`Bearer ${session.access_token}`}})
  }
  const run=async()=>{
   if(running||!enabled())return
   running=true
   try{
    const status=await invoke('status')
    if(!enabled()||!status||status.error||!status.data?.configured||!status.data?.connected)return
    if(['conflict','reauth_required','calendar_creation_uncertain'].includes(status.data.status))return
    // Bound each foreground wake; partial runs can continue on the next interval.
    for(let batch=0;batch<3&&enabled();batch++){
     const r=await invoke('sync')
     if(!enabled()||!r||r.error||['conflict','reauth_required','calendar_creation_uncertain'].includes(r.data?.status)||r.data?.conflicts||!r.data?.remaining)return
    }
   }finally{running=false}
  }
  const safeRun=()=>{void run().catch(()=>{})}
  const delay=setTimeout(safeRun,3000),timer=setInterval(safeRun,60000)
  document.addEventListener('visibilitychange',safeRun);window.addEventListener('huddle-google-sync-preference',safeRun)
  return()=>{stopped=true;clearTimeout(delay);clearInterval(timer);document.removeEventListener('visibilitychange',safeRun);window.removeEventListener('huddle-google-sync-preference',safeRun)}
 },[user?.id,revision])
 return null
}
