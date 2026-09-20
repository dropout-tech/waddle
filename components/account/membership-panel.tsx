'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/components/auth/auth-provider'
import { useI18n } from '@/lib/i18n/react'
import { createClient } from '@/lib/supabase/client'
import { loadNativeBillingSession } from '@/lib/billing/load-native-session'
import { DeleteAccountButton } from '@/components/auth/delete-account-button'
import { Button } from '@/components/ui/button'

type BillingSession = Awaited<ReturnType<typeof loadNativeBillingSession>>
type Offer = {identifier:string;localizedPrice:string;period?:string}
type Referral = {code:string;campaign_enabled:boolean;has_redeemed:boolean;rewards:{id:string;months:number;status:string;created_at:string}[]}
type AccountRPC = (name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>

export function MembershipPanel() {
 const {user,loading}=useAuth(),{lang}=useI18n(),en=lang==='en'
 const client=useMemo(()=>createClient(),[]),session=useRef<BillingSession|null>(null)
 const generation=useRef(0), lifecycle=useRef<Promise<void>>(Promise.resolve()), locale=useRef(en)
 locale.current=en
 const [storedUid,setStoredUid]=useState<string>()
 const [offers,setOffers]=useState<Offer[]>([]),[expires,setExpires]=useState<string|null>(null),[referral,setReferral]=useState<Referral|null>(null)
 const [billingReady,setBillingReady]=useState(false)
 const [busy,setBusy]=useState(false),[code,setCode]=useState(''),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false)
 const uid=user?.id
 useEffect(()=>{
  const current=++generation.current;let local:BillingSession|null=null
  const active=()=>current===generation.current
  lifecycle.current=lifecycle.current.catch(()=>{}).then(async()=>{
   setStoredUid(uid);setLoaded(false);setBusy(false);setBillingReady(false);setOffers([]);setExpires(null);setReferral(null);setMessage('')
   if(!uid){setLoaded(true);return}
   local=await loadNativeBillingSession(uid)
   if(!active()){await local.dispose();return}session.current=local
   const [packages,snapshot,refs]=await Promise.all([
    local.packages(),client.from('billing_entitlements').select('expires_at').eq('user_id',uid).eq('entitlement','pro').maybeSingle(),
    (client.rpc as unknown as AccountRPC)('get_my_referral')
   ])
   if(!active())return
   if(packages.status==='ready'){setOffers(packages.value);setBillingReady(true)}
   if(!snapshot.error)setExpires((snapshot.data as {expires_at:string|null}|null)?.expires_at??null)
   if(!refs.error)setReferral(refs.data as Referral)
   if(snapshot.error||refs.error)setMessage(locale.current?'Some account services are not available yet. Please retry later.':'部分會員服務尚未就緒，請稍後重試。')
   setLoaded(true)
  }).catch(()=>{if(active()){setLoaded(true);setMessage(locale.current?'Unable to load membership. Please reload.':'無法載入會員資料，請重新整理。')}})
  return()=>{generation.current++;session.current=null;lifecycle.current=lifecycle.current.catch(()=>{}).then(async()=>{await local?.dispose().catch(()=>{})})}
 },[uid,client])
 async function storeAction(kind:'purchase'|'restore',offer?:string){
  if(!session.current||busy)return
  const current=generation.current;setBusy(true);setMessage('')
  try{
   const result=kind==='purchase'?await session.current.purchase(offer!):await session.current.restore()
   if(current!==generation.current)return
   if(result.status==='cancelled'){setMessage(en?'Purchase cancelled.':'已取消購買。');return}
   if(result.status!=='ready')throw new Error('store')
   setMessage(en?'Checking your purchase with the server…':'正在向伺服器確認購買狀態…')
   const sync=await client.functions.invoke('billing-reconcile',{body:{}})
   if(sync.error)throw new Error('pending')
   const snapshot=await client.from('billing_entitlements').select('expires_at').eq('user_id',uid!).eq('entitlement','pro').maybeSingle()
   if(snapshot.error)throw new Error('pending')
   if(current!==generation.current)return
   setExpires((snapshot.data as {expires_at:string|null}|null)?.expires_at??null)
   setMessage((snapshot.data as {expires_at:string|null}|null)?.expires_at&&Date.parse((snapshot.data as unknown as {expires_at:string}).expires_at)>Date.now()?(en?'Pro is active.':'Pro 已啟用。'):(en?'No active Pro entitlement was found. If your store shows a pending purchase, check again later.':'目前尚無有效 Pro 權益。若商店顯示待處理付款，請稍後重新確認。'))
  }catch(error){if(current===generation.current)setMessage(error instanceof Error&&error.message==='pending'?(en?'Store action completed; server confirmation is pending. Restore purchases later—do not purchase again.':'商店操作已完成，伺服器尚未確認。請稍後恢復購買，不要重複付款。'):(en?'Unable to complete the store action. Please try again.':'無法完成商店操作，請重試。'))}
  finally{if(current===generation.current)setBusy(false)}
 }
 async function redeem(){
  if(busy||!referral?.campaign_enabled)return
  const current=generation.current;setBusy(true);setMessage('')
  try{
   const result=await (client.rpc as unknown as AccountRPC)('redeem_referral',{p_code:code.trim().toUpperCase()})
   if(result.error)throw result.error
   const refs=await (client.rpc as unknown as AccountRPC)('get_my_referral')
   if(refs.error)throw refs.error
   if(current!==generation.current)return
   setReferral(refs.data as Referral);setCode('');setMessage(en?'Referral recorded. Your reward is pending official store redemption; Pro has not been extended yet.':'推薦已登記，獎勵待官方商店兌換；目前尚未延長 Pro。')
  }catch{if(current===generation.current)setMessage(en?'Unable to redeem this code. Check the code and activity eligibility, then retry.':'無法兌換此推薦碼，請確認代碼及活動資格後重試。')}
  finally{if(current===generation.current)setBusy(false)}
 }
 async function share(){
  if(!referral?.campaign_enabled)return
  // A code remains useful without trusting an arbitrary return URL or exposing contact data.
  const text=en?`Join me on Huddle. My referral code: ${referral.code}`:`一起用 Huddle 整理生活，我的推薦碼：${referral.code}`
  try{if(navigator.share)await navigator.share({title:'Huddle',text});else{await navigator.clipboard.writeText(text);setMessage(en?'Referral code copied.':'已複製推薦碼。')}}catch{setMessage(en?'Sharing was cancelled or unavailable. You can copy the code below.':'分享已取消或無法使用，可自行複製下方代碼。')}
 }
 if(loading||(uid&&storedUid!==uid))return <p>{en?'Loading…':'載入中…'}</p>
 if(!user)return <p><Link href="/login" className="underline">{en?'Sign in to view your membership':'登入以查看會員方案'}</Link></p>
 const pro=!!expires&&Date.parse(expires)>Date.now(),native=Capacitor.isNativePlatform()
 return <div className="space-y-8">
  <section className="space-y-3" aria-labelledby="plan-heading"><h2 id="plan-heading" className="text-xl font-semibold">{en?'Your membership':'你的會員方案'} · {pro?'Pro':en?'Free':'免費版'}</h2>
   {!loaded&&<p role="status">{en?'Checking membership…':'正在確認會員狀態…'}</p>}
   {pro&&<p>{en?'Access until':'權益至'} {new Date(expires!).toLocaleDateString(en?'en-US':'zh-TW')}</p>}
   <p className="text-sm text-muted-foreground">{en?'Free keeps your tasks, calendar, notes, whiteboard and focus tools. Pro is planned for more shared partners and group scheduling.':'免費版保留任務、日曆、記事本、白板與專注工具。Pro 規劃提供更多共享夥伴及多人約時間額度。'}</p>
   <p className="font-medium">NT$149 {en?'/ month':'／月'} · NT$1,290 {en?'/ year, billed yearly':'／年，一次收取年費'}</p>
   {offers.length===0&&<p className="text-sm">{en?'Subscriptions are not available here yet. Creating an account will not charge you.':'目前此處尚未開放訂閱，建立帳號不會收費。'}</p>}
   {offers.filter(o=>o.period==='monthly'||o.period==='annual').map(offer=><Button key={offer.identifier} disabled={busy} onClick={()=>storeAction('purchase',offer.identifier)} className="mr-2">{offer.period==='annual'?(en?'Annual':'年繳'):(en?'Monthly':'月繳')} · {offer.localizedPrice}</Button>)}
   {offers.length>0&&<p className="text-sm text-muted-foreground">{en?'Payment is charged to your store account. Subscriptions renew automatically unless cancelled before renewal. The store shows the final price and billing date.':'費用由商店帳號收取，訂閱會自動續訂，請在續訂前取消。最終金額與扣款日期以商店確認畫面為準。'}</p>}
   <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy||!native||!billingReady} onClick={()=>storeAction('restore')}>{en?'Restore purchases':'恢復購買'}</Button>{native&&<a className="inline-flex min-h-11 items-center underline" href={Capacitor.getPlatform()==='ios'?'https://apps.apple.com/account/subscriptions':'https://play.google.com/store/account/subscriptions'} target="_blank" rel="noreferrer">{en?'Manage store subscription':'管理商店訂閱'}</a>}</div>
   <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={en?'/en/terms':'/terms'}>{en?'Terms':'服務條款'}</Link><Link className="underline" href={en?'/en/privacy':'/privacy'}>{en?'Privacy':'隱私政策'}</Link><Link className="underline" href={en?'/en/refunds':'/refunds'}>{en?'Refunds':'退款政策'}</Link></div>
  </section>
  <section className="space-y-4 border-t pt-6" aria-labelledby="referral-heading"><h2 id="referral-heading" className="text-xl font-semibold">{en?'Bring a friend to Huddle':'揪朋友，一起 Huddle'}</h2>
   <p className="text-sm text-muted-foreground">{en?'Planned launch offer: each eligible new referral gives both people 3 months of Pro, with up to 12 months for the inviter. Store redemption is required.':'首發活動規劃：每位符合資格的新朋友，雙方各得 3 個月 Pro，推薦人最多累積 12 個月。需完成商店優惠兌換。'}</p>
   {!referral?.campaign_enabled?<p>{en?'This activity is not open yet. No referral reward is being granted.':'活動尚未開放，目前不會發放推薦獎勵。'}</p>:<><p className="break-all text-lg font-semibold" aria-label={en?'Your referral code':'你的推薦碼'}>{referral.code}</p><Button variant="outline" onClick={share}>{en?'Share my code':'分享我的推薦碼'}</Button>{!referral.has_redeemed&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void redeem()}}><label className="min-w-0 flex-1 space-y-1 text-sm">{en?'Friend’s referral code':'朋友的推薦碼'}<input className="w-full rounded-md border bg-background px-3 py-2" value={code} onChange={e=>setCode(e.target.value)} maxLength={32} autoCapitalize="characters" disabled={busy} required/></label><Button disabled={busy||!code.trim()}>{en?'Redeem code':'兌換推薦碼'}</Button></form>}</>}
   {!!referral?.rewards.length&&<ul className="space-y-2 text-sm">{referral.rewards.map(reward=><li key={reward.id}>{reward.months} {en?'months':'個月'} · {reward.status==='redeemed'?(en?'Redeemed':'已兌換'):reward.status==='revoked'?(en?'Revoked':'已撤銷'):(en?'Awaiting store redemption':'待商店兌換')}</li>)}</ul>}
  </section>
  <section className="space-y-3 border-t pt-6"><h2 className="font-semibold">{en?'Delete account':'刪除帳號'}</h2><p className="text-sm text-muted-foreground">{en?'You can request deletion here. Cancel any active store subscription separately.':'可在此刪除帳號；進行中的商店訂閱請另行取消。'}</p><DeleteAccountButton/></section>
  {message&&<p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
 </div>
}
