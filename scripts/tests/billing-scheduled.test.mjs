import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createScheduledHandler} from '../../supabase/functions/billing-reconcile-scheduled/core.mjs'
const secret='Bearer '+ 's'.repeat(40), id='e33d985b-4bcb-456f-9658-9cc1085185ab'
function setup(extra={}){const finished=[],saved=[];return {finished,saved,handler:createScheduledHandler({secret,configured:true,entitlementId:'pro',claim:async()=>[{user_id:id,lease_id:'lease'}],fetchSubscriber:async()=>({request_date_ms:1,subscriber:{entitlements:{}}}),persist:async(...args)=>saved.push(args),finish:async(...args)=>finished.push(args),...extra})}}
const request=authorization=>new Request('https://local',{method:'POST',headers:{authorization:authorization??secret}})
test('secret-only no enumeration and no work before authorization',async()=>{let called=false;const s=setup({claim:async()=>{called=true;return []}});assert.equal((await s.handler(request('wrong'))).status,401);assert.equal(called,false)})
test('success uses stable lease key and returns aggregate only',async()=>{const s=setup(),r=await s.handler(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{processed:1,succeeded:1,failed:0});assert.equal(s.saved[0][0],'scheduled:lease');assert.deepEqual(s.finished,[[id,'lease',true]])})
test('provider failure retries without persisting imaginary expiry',async()=>{const s=setup({fetchSubscriber:async()=>{throw Error()}});assert.equal((await s.handler(request())).status,503);assert.equal(s.saved.length,0);assert.deepEqual(s.finished,[[id,'lease',false]])})
test('finish failure is recoverable and never exposed',async()=>{const s=setup({finish:async()=>{throw Error('private')}});const r=await s.handler(request());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private'))})
test('oversized claims fail closed',async()=>{const s=setup({claim:async()=>Array(11).fill({})});assert.equal((await s.handler(request())).status,503);assert.equal(s.saved.length,0)})
test('short or missing cron secret disables worker',async()=>{assert.equal((await setup({secret:'short'}).handler(request())).status,503)})
