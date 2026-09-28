import { registerPlugin, Capacitor } from '@capacitor/core'
import type { WidgetSnapshot } from './model'
/** Queued by the Apple Watch (ios/App/App/WatchBridge.swift); acknowledged by id like actions. */
export interface WatchFocusCommand { id:string; action:'start'|'pause'|'resume'; accountId:string; epoch:string; at:number }
interface WidgetPlugin {
  setAccount(input:{accountId:string}):Promise<{epoch:string}>
  publish(input:{snapshot:WidgetSnapshot}):Promise<void>
  read():Promise<{snapshot?:WidgetSnapshot; actions?:{id:string;taskId:string;revision:string;accountId:string;epoch:string}[]; focusCommand?:WatchFocusCommand}>
  acknowledge(input:{accountId:string;epoch:string;ids:string[]}):Promise<void>
}
export const HuddleWidgets = registerPlugin<WidgetPlugin>('HuddleWidgets')
let account: string | null = null
let epoch = ''
let serial: Promise<unknown> = Promise.resolve()
export function widgetAccount() { return { accountId: account, epoch } }
export function setWidgetAccount(next: string | null) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  // Invalidate synchronously. A queued callback can never resurrect the old account.
  account = next; epoch = ''
  serial = serial.catch(()=>{}).then(async()=>{
    const res = await HuddleWidgets.setAccount({accountId:next ?? ''})
    if (account === next) epoch = res.epoch
  })
  return serial
}
export async function publishWidgets(snapshot: WidgetSnapshot) {
  if (!Capacitor.isNativePlatform()) return
  await serial.catch(()=>{})
  if (snapshot.accountId !== account || !epoch || snapshot.epoch !== epoch) return
  const expected = epoch
  serial = serial.catch(()=>{}).then(async()=> {
    if (snapshot.accountId === account && epoch === expected) await HuddleWidgets.publish({snapshot:{...snapshot,epoch:expected}})
  })
  await serial
}
