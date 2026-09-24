import { snapshot } from '../revenuecat-webhook/core.mjs'
async function equalSecret(a,b) {
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
 const [x,y]=await Promise.all([digest(a),digest(b)])
 return x.reduce((diff,byte,i)=>diff|(byte^y[i]),0)===0
}
export function createScheduledHandler({secret,configured,entitlementId,claim,fetchSubscriber,persist,finish}) {
 return async request=>{
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405})
  if(!configured||secret.length<32)return Response.json({error:'billing_not_configured'},{status:503})
  if(!await equalSecret(request.headers.get('authorization')??'',secret))return Response.json({error:'unauthorized'},{status:401})
  let jobs
  try { jobs=await claim(); if(!Array.isArray(jobs)||jobs.length>10)throw Error() }catch{return Response.json({error:'claim_failed'},{status:503})}
  let succeeded=0,failed=0
  // Parallel bounded batch finishes within the durable three-minute lease.
  await Promise.all(jobs.map(async job=>{
   try {
    const value=snapshot(await fetchSubscriber(job.user_id),job.user_id,entitlementId)
    await persist(`scheduled:${job.lease_id}`,[value])
    await finish(job.user_id,job.lease_id,true)
    succeeded++
   }catch{
    failed++
    try{await finish(job.user_id,job.lease_id,false)}catch{/* lease expiry permits recovery */}
   }
  }))
  return Response.json({processed:jobs.length,succeeded,failed},{status:failed?503:200})
 }
}
