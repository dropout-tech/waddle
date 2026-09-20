// Auth identity is authoritative; storage is deleted before the auth row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { unseal } from '../google-calendar/core.mjs'
const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const json=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}})
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 if(req.method!=='POST')return json({error:'method_not_allowed'},405)
 try{
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer /i,'')
  if(!jwt)return json({error:'unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!service)return json({error:'not_configured'},503)
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await admin.auth.getUser(jwt)
  if(authError||!user||!/^[0-9a-f-]{36}$/i.test(user.id))return json({error:'unauthorized'},401)
  // Apple token revocation requires a retained token or fresh authorization code.
  // Never pretend an auth-row deletion revokes Sign in with Apple.
  if(user.identities?.some(identity=>identity.provider==='apple'))return json({error:'apple_reauthorization_required'},409)
  const uid=user.id,storage=admin.storage.from('notebook-images')
  // Snapshot all pages before removals: deleting while using offsets skips files.
  // Names are single segments from Storage; reject traversal/foreign prefixes.
  const files:string[]=[],folders=[uid],seen=new Set<string>()
  for(let index=0;index<folders.length;index++){
   if(folders.length>1000)throw Error('storage_capacity')
   const folder=folders[index]
   let offset=0
   for(let page=0;;page++){
    if(page>=200)throw Error('storage_capacity')
    const {data,error}=await storage.list(folder,{limit:100,offset,sortBy:{column:'name',order:'asc'}})
    if(error||!Array.isArray(data))throw Error('storage_list_failed')
    if(!data.length)break
    for(const item of data){
     if(typeof item.name!=='string'||!item.name||item.name==='.'||item.name==='..'||/[\\/\u0000]/.test(item.name))throw Error('unsafe_storage_path')
     const path=`${folder}/${item.name}`
     if(!path.startsWith(`${uid}/`)||seen.has(path))throw Error('storage_changed')
     seen.add(path)
     if(item.id)files.push(path);else folders.push(path)
     if(files.length>10000)throw Error('storage_capacity')
    }
    // Advance actual count; some servers cap pages below requested limit.
    offset+=data.length
   }
  }
  for(let i=0;i<files.length;i+=100){const {error}=await storage.remove(files.slice(i,i+100));if(error)throw Error('storage_remove_failed')}
  // Fail closed if an upload raced cleanup. Retrying safely continues cleanup.
  for(const folder of folders){
   let offset=0
   for(let page=0;;page++){
    if(page>=200)throw Error('storage_capacity')
    const {data,error}=await storage.list(folder,{limit:100,offset,sortBy:{column:'name',order:'asc'}})
    if(error||!data)throw Error('storage_verify_failed')
    if(!data.length)break
    if(data.some(item=>item.id||!folders.includes(`${folder}/${item.name}`)))throw Error('storage_changed')
    offset+=data.length
   }
  }
  let googleRevoked:boolean|null=null
  const {data:connection,error:connectionError}=await admin.from('google_calendar_connections').select('refresh_cipher').eq('user_id',uid).maybeSingle()
  // Old deployments without the integration table have no stored calendar token.
  if(connectionError&&connectionError.code!=='42P01'&&connectionError.code!=='PGRST205')throw Error('database_failed')
  if(connection){
   googleRevoked=false
   try{
    const key=Deno.env.get('GOOGLE_CALENDAR_TOKEN_KEY')||''
    if(key){const refresh=await unseal(connection.refresh_cipher,key,uid);const r=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refresh}),signal:AbortSignal.timeout(10000)});googleRevoked=r.ok}
   }catch{/* best effort provider revocation; encrypted local credentials cascade */}
  }
  const {error:deleteError}=await admin.auth.admin.deleteUser(uid)
  if(deleteError)throw Error('auth_delete_failed')
  return json({success:true,google_revoked:googleRevoked},200)
 }catch{return json({error:'account_deletion_failed'},500)}
})
