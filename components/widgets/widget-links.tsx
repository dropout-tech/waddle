'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { isNative } from '@/lib/platform'
import { parseWidgetURL, type WidgetDestination } from '@/lib/widgets/model'
import { widgetAccount } from '@/lib/widgets/native'
let pending: WidgetDestination | null = null
export function WidgetLinks() {
  const { user, loading } = useAuth(); const router = useRouter()
  useEffect(()=>{
    if (!isNative()) return
    let live=true, remove:(()=>void)|undefined
    const receive=(url:string)=> { const d=parseWidgetURL(url); if(!d) return; pending=d; window.dispatchEvent(new Event('huddle-widget-link')) }
    void import('@capacitor/app').then(async({App})=>{
      const h=await App.addListener('appUrlOpen',e=>receive(e.url)); if(!live){void h.remove();return} remove=()=>void h.remove()
      const launch=await App.getLaunchUrl(); if(live && launch?.url) receive(launch.url)
    })
    return ()=>{live=false;remove?.()}
  },[])
  useEffect(()=>{
    const route=()=>{
      if(loading || !user || !pending) return
      const d=pending, owner=widgetAccount(); pending=null
      if(d.accountId && (d.accountId !== user.id || (d.epoch && owner.epoch && d.epoch !== owner.epoch))) return
      const q=new URLSearchParams({open:d.kind}); if(d.id) q.set('id',d.id); if(d.date) q.set('date',d.date)
      router.push(`/widgets/?${q}`)
    }
    route(); window.addEventListener('huddle-widget-link',route)
    return ()=>window.removeEventListener('huddle-widget-link',route)
  },[user,loading,router])
  return null
}
