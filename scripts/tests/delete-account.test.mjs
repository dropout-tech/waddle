import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../../supabase/functions/delete-account/index.ts',import.meta.url),'utf8').replace(/^import .*$/gm,'')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
const uid='00000000-0000-4000-8000-000000000001'
async function run(options={}){
 let handler;const actions=[],objects=new Map([[uid,[{id:'a',name:'a.png'},{id:null,name:'nested'},{id:'b',name:'b.png'}]],[uid+'/nested',[{id:'c',name:'c.png'}]]]);
 if(options.unsafe)objects.set(uid,[{id:'bad',name:'../foreign'}])
 const storage={list:async(path,{offset=0,limit=100})=>{actions.push('list:'+path);return {data:(objects.get(path)??[]).slice(offset,offset+Math.min(limit,2)),error:options.listFail?{}:null}},remove:async(paths)=>{actions.push(...paths.map(p=>'remove:'+p));if(options.removeFail)return {error:{}};for(const path of paths){const i=path.lastIndexOf('/'),folder=path.slice(0,i),name=path.slice(i+1);objects.set(folder,(objects.get(folder)??[]).filter(x=>x.name!==name))}return {error:null}}}
 const admin={rpc:async(name,args)=>{assert.equal(name,'begin_account_deletion');assert.equal(args.p_user_id,uid);actions.push('mark-deletion');return {error:options.markerFail?{}:null}},auth:{getUser:async()=>({data:{user:options.invalid?null:{id:uid,identities:options.apple?[{provider:'apple'}]:[]}},error:null}),admin:{deleteUser:async(id)=>{assert.equal(id,uid);actions.push('delete-auth');return {error:options.deleteFail?{}:null}}}},storage:{from:name=>{assert.equal(name,'notebook-images');return storage}},from:()=>({select(){return this},eq(field,id){assert.equal(id,uid);return this},maybeSingle:async()=>({data:options.google?{refresh_cipher:'sealed'}:null,error:null})})}
 vm.runInNewContext(js,{Deno:{env:{get:name=>({SUPABASE_URL:'https://local',SUPABASE_SERVICE_ROLE_KEY:'service',GOOGLE_CALENDAR_TOKEN_KEY:'cipher'})[name]},serve:fn=>handler=fn},createClient:()=>admin,unseal:async()=> 'token',fetch:async()=>{actions.push('revoke-google');return {ok:true}},Request,Response,URLSearchParams,AbortSignal,Set})
 const response=await handler(new Request('https://local',{method:'POST',headers:options.missing?{}:{Authorization:'Bearer test'},body:JSON.stringify({user_id:'other'})}));return {status:response.status,body:await response.json(),actions}
}
test('actual capped pages and nested storage removed before auth',async()=>{const r=await run();assert.equal(r.status,200);assert.equal(r.actions.filter(x=>x.startsWith('remove:')).length,3);assert.equal(r.actions.at(-1),'delete-auth');assert.ok(r.actions.filter(x=>x.startsWith('remove:')).every(x=>x.startsWith('remove:'+uid+'/')))})
for(const key of ['missing','invalid'])test(key,async()=>{const r=await run({[key]:true});assert.equal(r.status,401);assert.equal(r.actions.length,0)})
for(const key of ['listFail','removeFail','unsafe'])test(key+' blocks auth deletion',async()=>{const r=await run({[key]:true});assert.equal(r.status,500);assert.ok(!r.actions.includes('delete-auth'))})
test('Apple reauthorization is explicit before destruction',async()=>{const r=await run({apple:true});assert.equal(r.status,409);assert.equal(r.body.error,'apple_reauthorization_required');assert.equal(r.actions.length,0)})
test('Google revocation precedes auth deletion',async()=>{const r=await run({google:true});assert.equal(r.status,200);assert.equal(r.body.google_revoked,true);assert.ok(r.actions.indexOf('revoke-google')<r.actions.indexOf('delete-auth'))})
test('auth failure does not leak provider details or claim success',async()=>{const r=await run({deleteFail:true});assert.equal(r.status,500);assert.deepEqual(r.body,{error:'account_deletion_failed'})})

test('marker failure prevents any image or auth deletion',async()=>{const r=await run({markerFail:true});assert.equal(r.status,500);assert.deepEqual(r.actions,['mark-deletion'])})
