// Real Electron + actual floating modules; isolated local HTTP fixture, no user data.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { _electron as electron } from 'playwright'
const temp=mkdtempSync('/tmp/huddle-floating-runtime-')
const moduleCode = file => ts.transpileModule(readFileSync(file,'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
const script=`function isDesktop(){return true} function isNative(){return false}\n${moduleCode('lib/floating-window.ts')}\n${moduleCode('lib/floating-hub.ts')}\nwindow.testHub={openFloatingHub,getHubState,closeFloatingHub};document.querySelector('button').onclick=()=>openFloatingHub('timer').then(ok=>{document.body.dataset.result=String(ok);if(ok){const w=getHubState().window;w.document.body.innerHTML='<button id="shared">timer</button>';w.document.querySelector('button').onclick=()=>document.body.dataset.shared='yes';w.addEventListener('pagehide',hubWindowClosed)}});`
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/floating-host.html'?readFileSync('public/floating-host.html'):`<button id="open">Open</button><script>${script}</script>`)});await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
let passes=0;const check=(message,value)=>{assert.ok(value,message);console.log('PASS',message);passes++}
try {
 for(const legacy of [false,true]){
  const harness=path.join(temp,`main-${legacy}.cjs`)
  writeFileSync(harness,`const {app,shell}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,String(legacy)))});app.setAsDefaultProtocolClient=()=>true;globalThis.external=[];shell.openExternal=async url=>globalThis.external.push(url);${legacy?`app.on('web-contents-created',(_e,w)=>{const orig=w.setWindowOpenHandler.bind(w);w.setWindowOpenHandler=fn=>orig(details=>{const result=fn(details);if(result.overrideBrowserWindowOptions)delete result.overrideBrowserWindowOptions.alwaysOnTop;return result})});`:''}require(${JSON.stringify(path.resolve('desktop/main.cjs'))});`)
  const app=await electron.launch({args:[harness],env:{...process.env,HUDDLE_APP_URL:base}})
  try {
   const page=await app.firstWindow();await page.locator('#open').click();await page.waitForFunction(()=>document.body.dataset.result==='true')
   const windows=app.windows();const child=windows.find(p=>p!==page);check(`${legacy?'Legacy':'Updated'} desktop button creates a usable same-origin window`,!!child && child.url()===base+'/floating-host.html')
   await child.locator('#shared').click();check('Child shares live main-window state',await page.getAttribute('body','data-shared')==='yes')
   check('Native always-on-top matches shell capability',await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/floating-host.html')).isAlwaysOnTop())===!legacy)
   const count=app.windows().length;await page.evaluate(()=>testHub.openFloatingHub('note',{noteId:'fixture-note'}));check('Reopening reuses the existing window and changes tab',app.windows().length===count && await page.evaluate(()=>testHub.getHubState().tab==='note'&&testHub.getHubState().noteId==='fixture-note'))
   check('Child cannot invoke privileged main-window OAuth IPC',await child.evaluate(async()=>{try{await window.huddleDesktop.beginOAuth();return false}catch{return true}}))
   await child.evaluate(()=>window.open('https://example.invalid','external'));check('External URL stays outside embedded windows',(await app.evaluate(()=>globalThis.external)).includes('https://example.invalid/'))
   await child.close();await page.waitForFunction(()=>testHub.getHubState().window===null);check('Closing native window clears hub state',true)
   await page.locator('#open').click();await page.waitForFunction(()=>testHub.getHubState().window!==null);await page.evaluate(()=>testHub.closeFloatingHub());check('Close button clears hub state',await page.evaluate(()=>testHub.getHubState().window===null))
   await page.evaluate(()=>Promise.all([testHub.openFloatingHub('timer'),testHub.openFloatingHub('note'),testHub.openFloatingHub('scratchpad')]))
   check('Rapid requests reuse one pending child and preserve latest tab',app.windows().length===2 && await page.evaluate(()=>testHub.getHubState().tab==='scratchpad'))
   const beforeReload=app.windows().find(p=>p!==page);await page.reload();if(!beforeReload.isClosed())await beforeReload.waitForEvent('close');check('Parent reload closes dependent floating panel',beforeReload.isClosed())
   await page.locator('#open').click();await page.waitForFunction(()=>testHub.getHubState().window!==null)
   const reloadingChild=app.windows().find(p=>p!==page);await reloadingChild.reload().catch(()=>{});await page.waitForFunction(()=>testHub.getHubState().window===null);check('Child reload closes inert host and resets launcher',reloadingChild.isClosed())
  }finally{await app.close()}
 }
 console.log(`Desktop floating verification: ${passes} checks passed; no real auth or data access.`)
}finally{server.close();rmSync(temp,{recursive:true,force:true})}
