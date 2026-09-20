const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('lib/auth/desktop-oauth.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function setup() {
  const data = new Map(); const calls = []; const exports = {}
  const auth = {signInWithOAuth: async options => { calls.push(['signIn',options]); return {data:{url:'https://auth.example/oauth'}} }, exchangeCodeForSession: async code => { calls.push(['exchange',code]); return { data:{session:{user:{id:'test'}}}, error:null } }}
  const bridge = {isDesktop:true,beginOAuth:async()=> 'nonce',openOAuth:async url => { calls.push(['open',url]) },cancelOAuth:async()=>calls.push(['cancel'])}
  vm.runInNewContext(source,{exports,require:()=>({createClient:()=>({auth})}),window:{huddleDesktop:bridge,location:{origin:'https://waddle.zeabur.app'}},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},URL,Date,setTimeout,clearTimeout,Map,Error})
  return {api:exports,data,calls,auth}
}
test('renderer opens external PKCE flow and cancellation permits retry', async()=>{
 const {api,calls} = setup()
 const pending = api.desktopSignIn('google')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(calls[0][1].options.skipBrowserRedirect,true)
 assert.equal(new URL(calls[0][1].options.redirectTo).searchParams.get('desktop_state'),'nonce')
 assert.equal(calls[1][0],'open')
 const rejected = assert.rejects(pending,/已取消/)
 await api.cancelDesktopOAuth(); await rejected
})
test('renderer validates state and exchanges code only once across duplicate mounts', async()=>{
 const {api,data,calls} = setup()
 data.set(api.DESKTOP_PENDING,JSON.stringify({state:'nonce',expires:Date.now()+1000}))
 assert.equal(await api.completeDesktopOAuth('code','nonce'),true)
 assert.equal(await api.completeDesktopOAuth('code','nonce'),true)
 assert.equal(calls.filter(c=>c[0]==='exchange').length,1)
 assert.equal(data.has(api.DESKTOP_PENDING),false)
 assert.equal(await api.completeDesktopOAuth('attacker','wrong'),false)
 assert.equal(calls.length,1)
})
test('expired state never exchanges credentials',async()=>{
 const {api,data,calls} = setup()
 data.set(api.DESKTOP_PENDING,JSON.stringify({state:'nonce',expires:Date.now()-1000}))
 assert.equal(await api.completeDesktopOAuth('expired','nonce'),false)
 assert.equal(calls.length,0)
})
