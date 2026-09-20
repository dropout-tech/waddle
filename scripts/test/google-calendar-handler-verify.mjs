import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import * as core from '../../supabase/functions/google-calendar/core.mjs'
const source=fs.readFileSync(new URL('../../supabase/functions/google-calendar/index.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export async function handler','async function handler')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
const uid='00000000-0000-0000-0000-000000000001',session='10000000-0000-0000-0000-000000000001',wid='20000000-0000-0000-0000-000000000001'
const key=Buffer.alloc(32,1).toString('base64url'),jwt='x.'+Buffer.from(JSON.stringify({session_id:session})).toString('base64url')+'.x'
async function setup(options={}){
 let handler;const calls=[],tables={google_calendar_connections:options.connected?[{user_id:uid,generation:'generation1',refresh_cipher:await core.seal('refresh',key,uid),time_zone:'Asia/Taipei',workspace_ids:[wid],calendar_id:'calendar1',status:'connected',...options.connection}]:[],google_calendar_oauth_states:[],google_calendar_event_mappings:options.mappings||[],workspaces:[{id:wid,user_id:uid}]}
 let conflictVersion=0
 const admin={auth:{getUser:async()=>({data:{user:options.badAuth?null:{id:uid}},error:null})},from(table){let mode='select',patch,filters=[],single=false
  const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},gt(k,v){filters.push(row=>row[k]>v);return q},in(k,v){filters.push(row=>v.includes(row[k]));return q},update(p){mode='update';patch=p;return q},insert(p){mode='insert';patch=p;return q},delete(){mode='delete';return q},maybeSingle(){single=true;return q},then(resolve,reject){
   let found=tables[table].filter(r=>filters.every(fn=>fn(r)))
   if(mode==='insert'){const row={...patch};if(table==='google_calendar_oauth_states')row.expires_at=new Date(Date.now()+600000).toISOString();tables[table].push(row);found=[row]}
   if(mode==='update')found.forEach(r=>Object.assign(r,patch))
   if(mode==='delete')tables[table]=tables[table].filter(r=>!found.includes(r))
   return Promise.resolve({data:single?found[0]||null:found,error:null}).then(resolve,reject)
  }};return q},rpc:async(name,args)=>{if(name==='google_calendar_claim'){const c=tables.google_calendar_connections[0];if(options.busy||!c||c.generation!==args.p_generation)return{data:false,error:null};c.lease_id=args.p_lease;c.lease_until=new Date(Date.now()+120000).toISOString();return{data:true,error:null}}
   return{data:{tasks:options.tasks||[],meetings:[],mappings:tables.google_calendar_event_mappings.map(x=>({...x}))},error:options.snapshotFailure?'bad':null}
  }}
 const env={SUPABASE_URL:'https://fake.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',GOOGLE_CALENDAR_CLIENT_ID:'client',GOOGLE_CALENDAR_CLIENT_SECRET:'secret',GOOGLE_CALENDAR_TOKEN_KEY:key,GOOGLE_CALENDAR_REDIRECT_URI:'https://app.invalid/settings/google-calendar/callback',...options.env}
 const remotes=new Map((options.remotes||[]).map(r=>[r.id,r]))
 vm.runInNewContext(js,{...core,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:()=>admin,crypto,Response,Request,URL,URLSearchParams,AbortSignal,Date,Intl,atob,setTimeout,fetch:async(url,req)=>{
  calls.push({url,...req});if(url.includes('/token'))return new Response(JSON.stringify(options.invalidGrant?{error:'invalid_grant'}:{access_token:'access',refresh_token:'refresh',scope:core.SCOPE}),{status:options.invalidGrant?400:200})
  if(url.includes('/revoke'))return new Response('{}',{status:options.revokeFailure?500:200})
  if(url.endsWith('/calendars')&&req.method==='POST'){if(options.calendarLost)throw Error('network');return new Response('{"id":"newcalendar"}')}
  const id=url.split('/events/')[1]?.split('?')[0]
  if(req.method==='GET'){if(options.google403)return new Response('{}',{status:403});if(options.google429)return new Response('{}',{status:429});return new Response(JSON.stringify(remotes.get(id)||{}),{status:remotes.has(id)?200:404})}
  if(req.method==='DELETE'){remotes.delete(id);return new Response(null,{status:204})}
  if(req.method==='POST'||req.method==='PUT'){if(options.etagConflict&&conflictVersion++===0)return new Response('{}',{status:412});const body=JSON.parse(req.body),newId=body.id||id,event={...body,id:newId,etag:'etag1'};remotes.set(newId,event);if(options.insertLost&&conflictVersion++===0)throw Error('lost response');return new Response(JSON.stringify(event))}
  throw Error('unexpected fetch')
 }})
 const send=async body=>{const res=await handler(new Request('https://fake.invalid',{method:'POST',headers:options.noToken?{}:{Authorization:'Bearer '+jwt},body:JSON.stringify(body)}));return{status:res.status,...await res.json()}}
 return{send,tables,calls,remotes}
}
let count=0
async function scenario(name,fn){await fn();count++}
await scenario('no auth',async()=>{const m=await setup({noToken:true});assert.equal((await m.send({action:'status'})).status,401);assert.equal(m.calls.length,0)})
await scenario('invalid auth',async()=>{const m=await setup({badAuth:true});assert.equal((await m.send({action:'status'})).status,401)})
await scenario('configuration honest and no secrets',async()=>{const m=await setup({env:{GOOGLE_CALENDAR_CLIENT_ID:''}});assert.equal((await m.send({action:'status'})).configured,false);assert.equal((await m.send({action:'start'})).error,'not_configured')})
await scenario('OAuth PKCE once-only',async()=>{const m=await setup();const start=await m.send({action:'start',time_zone:'Asia/Taipei',workspace_ids:[wid]});const url=new URL(start.url);assert.equal(url.searchParams.get('scope'),core.SCOPE);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(!JSON.stringify(start).includes('verifier'));const state=url.searchParams.get('state');assert.equal((await m.send({action:'finish',state:'wrong',code:'code'})).error,'invalid_state');assert.equal((await m.send({action:'finish',state,code:'code'})).connected,true);assert.equal((await m.send({action:'finish',state,code:'code'})).error,'already_connected');assert.ok(!m.tables.google_calendar_connections[0].refresh_cipher.includes('refresh'))})
await scenario('OAuth rejects another user and session',async()=>{const m=await setup();const start=await m.send({action:'start',time_zone:'Asia/Taipei',workspace_ids:[wid]});const state=new URL(start.url).searchParams.get('state'),row=m.tables.google_calendar_oauth_states[0];row.user_id=wid;assert.equal((await m.send({action:'finish',state,code:'code'})).error,'invalid_state');row.user_id=uid;row.session_id=wid;assert.equal((await m.send({action:'finish',state,code:'code'})).error,'invalid_state');assert.equal(m.calls.length,0)})
await scenario('foreign workspace rejected',async()=>{const m=await setup();assert.equal((await m.send({action:'start',time_zone:'Asia/Taipei',workspace_ids:[session]})).error,'invalid_workspace')})
const today=core.localDay(new Date(),'Asia/Taipei'),task={id:'task1',workspace_id:wid,title:'Test',scheduled_date:today,scheduled_start_time:'09:00:00',scheduled_end_time:'10:00:00'}
await scenario('create then idempotent no duplicates',async()=>{const m=await setup({connected:true,tasks:[task]});assert.equal((await m.send({action:'sync'})).status,'connected');assert.equal((await m.send({action:'sync'})).changed,0);assert.equal(m.remotes.size,1);assert.equal(m.calls.filter(c=>c.method==='POST'&&c.url.includes('/events?')).length,1);assert.ok(m.calls.filter(c=>c.method==='POST'&&c.url.includes('/events?')).every(c=>c.url.includes('sendUpdates=none')&&!c.body.includes('attendees')))})
await scenario('lost insert recovery uses stable id',async()=>{const m=await setup({connected:true,tasks:[task],insertLost:true});assert.equal((await m.send({action:'sync'})).error,'integration_failed');assert.equal((await m.send({action:'sync'})).status,'connected');assert.equal(m.remotes.size,1)})
await scenario('external edit conflict then explicit overwrite',async()=>{const m=await setup({connected:true,tasks:[task]});await m.send({action:'sync'});const remote=[...m.remotes.values()][0];remote.summary='Other edit';assert.equal((await m.send({action:'sync'})).conflicts,1);assert.equal(remote.summary,'Other edit');assert.equal((await m.send({action:'sync',resolve_conflicts:true})).status,'connected');assert.equal([...m.remotes.values()][0].summary,'Test')})
await scenario('source delete removes mapped event',async()=>{const tasks=[task],m=await setup({connected:true,tasks});await m.send({action:'sync'});tasks.length=0;assert.equal((await m.send({action:'sync'})).status,'connected');assert.equal(m.remotes.size,0)})
await scenario('snapshot failure never deletes',async()=>{const m=await setup({connected:true,snapshotFailure:true,mappings:[{source_key:'gone',event_id:'event',user_id:uid,payload:{}}],remotes:[{id:'event'}]});assert.equal((await m.send({action:'sync'})).error,'integration_failed');assert.equal(m.calls.some(x=>x.method==='DELETE'),false)})
await scenario('reauth state',async()=>{const m=await setup({connected:true,invalidGrant:true});assert.equal((await m.send({action:'sync'})).error,'reauth_required');assert.equal(m.tables.google_calendar_connections[0].status,'reauth_required')})
await scenario('busy serialization',async()=>{const m=await setup({connected:true,busy:true});assert.equal((await m.send({action:'sync'})).error,'sync_busy');assert.equal(m.calls.length,0)})
await scenario('disconnect revocation failure still forgets credential',async()=>{const m=await setup({connected:true,revokeFailure:true});const r=await m.send({action:'disconnect'});assert.equal(r.connected,false);assert.equal(r.revoked,false);assert.equal(m.tables.google_calendar_connections.length,0);assert.equal(m.calls.some(x=>x.url.includes('/calendars/')),false)})
await scenario('uncertain calendar never auto creates duplicate',async()=>{const m=await setup({connected:true,connection:{calendar_id:null},calendarLost:true});await m.send({action:'sync'});assert.equal(m.tables.google_calendar_connections[0].status,'calendar_creation_uncertain');await m.send({action:'sync'});assert.equal(m.calls.filter(x=>x.url.endsWith('/calendars')).length,1)})
await scenario('permission denial no writes',async()=>{const m=await setup({connected:true,tasks:[task],google403:true});assert.equal((await m.send({action:'sync'})).error,'google_permission_denied');assert.equal(m.remotes.size,0)})
await scenario('continuation >80 eventually complete',async()=>{const tasks=Array.from({length:85},(_,i)=>({...task,id:'t'+i})),m=await setup({connected:true,tasks});const a=await m.send({action:'sync'});assert.equal(a.status,'partial');assert.equal(a.remaining,5);assert.equal((await m.send({action:'sync'})).status,'connected');assert.equal(m.remotes.size,85)})
console.log(`PASS ${count} Google Edge handler mock scenarios; no network or real credentials`)
