import { createScheduledHandler } from './core.mjs'
const env=(name:string)=>Deno.env.get(name)??''
const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),apiKey=env('REVENUECAT_SECRET_API_KEY'),entitlementId=env('REVENUECAT_PRO_ENTITLEMENT_ID')
async function rpc(name:string,body:unknown){
 const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${service}`,apikey:service,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)})
 if(!response.ok)throw Error('Database operation failed')
 const text=await response.text(); return text?JSON.parse(text):null
}
Deno.serve(createScheduledHandler({
 secret:env('BILLING_CRON_AUTHORIZATION'),configured:Boolean(url&&service&&apiKey&&entitlementId),entitlementId,
 claim:()=>rpc('claim_billing_reconciliation',{}),
 async fetchSubscriber(id:string){
  const response=await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(10000)})
  if(!response.ok)throw Error('Subscriber lookup failed')
  return response.json()
 },
 persist:(id:string,snapshots:unknown[])=>rpc('apply_billing_snapshot',{p_event_id:id,p_snapshots:snapshots}),
 finish:(id:string,lease:string,success:boolean)=>rpc('finish_billing_reconciliation',{p_user_id:id,p_lease_id:lease,p_success:success})
}))
