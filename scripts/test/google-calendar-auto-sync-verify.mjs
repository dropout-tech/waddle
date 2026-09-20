import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../../components/integrations/google-calendar-auto-sync.tsx',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export function GoogleCalendarAutoSync','function GoogleCalendarAutoSync')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function setup(options={}){
 let user={id:'A'},session={user:{id:'A'},access_token:'tokenA'},cleanup
 const preferences=new Map(options.enabled?[['huddle-google-auto:A','true']]:[]),calls=[],timers=new Map(),events=new Map(),pending=[]
 let timer=0
 const document={visibilityState:options.hidden?'hidden':'visible',addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)}
 const window={addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)}
 const client={auth:{getSession:async()=>({data:{session}})},functions:{invoke:async(name,args)=>{calls.push(args);if(options.defer?.(args.body.action,calls.length))return await new Promise(resolve=>pending.push(resolve));return {data:args.body.action==='status'?{configured:true,connected:true,status:options.status||'connected'}:{status:'connected',remaining:0,...options.result},error:null}}}}
 const context={useAuth:()=>({user}),createClient:()=>client,Capacitor:{isNativePlatform:()=>!!options.native},useEffect:fn=>{cleanup=fn()},document,window,localStorage:{getItem:k=>preferences.get(k)},setTimeout:fn=>{timers.set(++timer,fn);return timer},setInterval:fn=>{timers.set(++timer,fn);return timer},clearTimeout:k=>timers.delete(k),clearInterval:k=>timers.delete(k)}
 vm.createContext(context);vm.runInContext(js,context)
 const mount=()=>vm.runInContext('GoogleCalendarAutoSync({revision:"r"})',context)
 mount()
 return{calls,preferences,pending,document,mount,cleanup:()=>cleanup?.(),wake:async()=>{[...timers.values()][0]?.();await flush();await flush()},setUser:u=>{user=u;session={user:u,access_token:'token'+u.id}},resolve:async data=>{pending.shift()({data,error:null});await flush();await flush()}}
}
let checks=0
async function test(name,fn){await fn();checks++}
await test('optout makes no API calls',async()=>{const m=setup();await m.wake();assert.equal(m.calls.length,0)})
await test('native disabled',async()=>{const m=setup({enabled:true,native:true});await m.wake();assert.equal(m.calls.length,0)})
await test('hidden does not sync',async()=>{const m=setup({enabled:true,hidden:true});await m.wake();assert.equal(m.calls.length,0)})
await test('optin status and one sync bound to token',async()=>{const m=setup({enabled:true});await m.wake();assert.deepEqual(m.calls.map(x=>x.body.action),['status','sync']);assert.ok(m.calls.every(x=>x.headers.Authorization==='Bearer tokenA'))})
await test('existing conflict stops',async()=>{const m=setup({enabled:true,status:'conflict'});await m.wake();assert.equal(m.calls.length,1)})
await test('partial conflict stops continuation',async()=>{const m=setup({enabled:true,result:{status:'conflict',remaining:4,conflicts:1}});await m.wake();assert.equal(m.calls.length,2)})
await test('bounded three batches per wake',async()=>{const m=setup({enabled:true,result:{status:'partial',remaining:4}});await m.wake();assert.equal(m.calls.length,4)})
await test('account switch cannot continue old request',async()=>{const m=setup({enabled:true,defer:action=>action==='status'});await m.wake();m.cleanup();m.setUser({id:'B'});m.mount();await m.resolve({configured:true,connected:true,status:'connected'});await m.wake();assert.equal(m.calls.length,1)})
await test('session changes even before React cleanup cannot send new account sync',async()=>{const m=setup({enabled:true,defer:action=>action==='status'});await m.wake();m.setUser({id:'B'});await m.resolve({configured:true,connected:true,status:'connected'});assert.equal(m.calls.length,1)})
await test('optout during pending status stops',async()=>{const m=setup({enabled:true,defer:action=>action==='status'});await m.wake();m.preferences.set('huddle-google-auto:A','false');await m.resolve({configured:true,connected:true,status:'connected'});assert.equal(m.calls.length,1)})
await test('optout between batches stops',async()=>{const m=setup({enabled:true,defer:action=>action==='sync'});await m.wake();m.preferences.set('huddle-google-auto:A','false');await m.resolve({status:'partial',remaining:5});assert.equal(m.calls.length,2)})
await test('concurrent wake does not duplicate request',async()=>{const m=setup({enabled:true,defer:action=>action==='status'});await m.wake();await m.wake();assert.equal(m.calls.length,1)})
console.log(`PASS ${checks} foreground Google sync effect tests; mocked auth/API, no Google requests`)
