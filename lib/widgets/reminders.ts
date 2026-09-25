import { LocalNotifications } from '@capacitor/local-notifications'
import { isNative } from '@/lib/platform'
import type { WidgetSnapshot } from './model'
const KIND='huddle-widget'
const FOCUS_ID=2100000001, WATER_ID=2100000002
let currentAccount:string|null=null, signature='', sequence:Promise<unknown>=Promise.resolve()
export async function clearWidgetReminders(accountId:string|null) {
  currentAccount=accountId;signature=''
  if(!isNative())return
  sequence=sequence.catch(()=>{}).then(async()=>{
    const pending=await LocalNotifications.getPending()
    const own=pending.notifications.filter(n=>n.extra?.kind===KIND).map(n=>({id:n.id}))
    if(own.length)await LocalNotifications.cancel({notifications:own})
  });await sequence
}
export async function enableWidgetReminders(accountId:string) {
  if(!isNative())return false
  const result=await LocalNotifications.requestPermissions()
  if(result.display!=='granted')return false
  localStorage.setItem(`huddle.widget-reminders:${accountId}`,'1');signature='';return true
}
export async function syncWidgetReminders(snapshot:WidgetSnapshot) {
  if(!isNative()||snapshot.accountId!==currentAccount)return
  const enabled=localStorage.getItem(`huddle.widget-reminders:${snapshot.accountId}`)==='1'
  const key=JSON.stringify([snapshot.accountId,enabled,snapshot.focus.state,snapshot.focus.endAt,snapshot.water.enabled,snapshot.water.nextAt])
  if(signature===key)return
  sequence=sequence.catch(()=>{}).then(async()=>{
    if(snapshot.accountId!==currentAccount)return
    const pending=await LocalNotifications.getPending(), own=pending.notifications.filter(n=>n.extra?.kind===KIND)
    if(own.length)await LocalNotifications.cancel({notifications:own.map(n=>({id:n.id}))})
    if(!enabled || (await LocalNotifications.checkPermissions()).display!=='granted')return
    const items=[]
    if(snapshot.focus.state==='running'&&snapshot.focus.endAt&&snapshot.focus.endAt>Date.now()) items.push({id:FOCUS_ID,title:'Huddle · 專注完成',body:'辛苦了，留下這次專注的收穫。',schedule:{at:new Date(snapshot.focus.endAt)},extra:{kind:KIND,accountId:snapshot.accountId,destination:'focus-note'}})
    if(snapshot.water.enabled&&snapshot.water.nextAt&&snapshot.water.nextAt>Date.now()) items.push({id:WATER_ID,title:'Huddle · 喝水提醒',body:'喝口水，休息一下。',schedule:{at:new Date(snapshot.water.nextAt)},extra:{kind:KIND,accountId:snapshot.accountId,destination:'water'}})
    if(snapshot.accountId!==currentAccount)return
    if(items.length)await LocalNotifications.schedule({notifications:items})
    signature=key
  });await sequence
}
