'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { isNative } from '@/lib/platform'
import { parseWidgetURL, widgetPath, type WidgetDestination } from '@/lib/widgets/model'
import { queueWidgetLaunch } from '@/lib/widgets/launch'
import { widgetAccount } from '@/lib/widgets/native'
let pending: WidgetDestination | null = null
export function WidgetLinks() {
  const { user, loading } = useAuth(); const router = useRouter(); const pathname = usePathname()
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
      // Straight to the real screen (see widgetPath). Board destinations are
      // queued rather than pushed: when the board is already on screen a push
      // to the same page would not remount it, so it would never see the query.
      const path=widgetPath(d)
      if(path.startsWith('/?')) { queueWidgetLaunch(path.slice(2)); if(pathname !== '/') router.push('/') }
      else router.push(path)
    }
    route(); window.addEventListener('huddle-widget-link',route)
    return ()=>window.removeEventListener('huddle-widget-link',route)
  },[user,loading,router,pathname])
  return null
}
