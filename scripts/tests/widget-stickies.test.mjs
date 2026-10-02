// 便條紙 widget: paging until 5 non-blank notes are found. Run: node --test scripts/tests/widget-stickies.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const tsFile=base=>existsSync(base+'.ts')?base+'.ts':existsSync(resolve(base,'index.ts'))?resolve(base,'index.ts'):null
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/'))return next(pathToFileURL(tsFile(resolve(specifier.slice(2)))).href,context)
  if(specifier.startsWith('.')&&context.parentURL&&!/\.[cm]?[jt]s$/.test(specifier)){
    const file=tsFile(fileURLToPath(new URL(specifier,context.parentURL)))
    if(file)return next(pathToFileURL(file).href,context)
  }
  return next(specifier,context)
}})
const {loadStickyRows,stickySummaries,STICKY_LIMIT}=await import('../../lib/widgets/model.ts')
const doc=text=>({type:'doc',content:[{type:'paragraph',...(text?{content:[{type:'text',text}]}:{})}]})
const row=(i,text)=>({id:`n${i}`,content:doc(text),color:'yellow',updatedAt:new Date(2026,0,1,0,0,1000-i).toISOString()})
/** newest-first table of `blank` empty notes followed by `filled` written ones, served in pages. */
const table=(blank,filled)=>{
  const all=[...Array.from({length:blank},(_,i)=>row(i,'')),...Array.from({length:filled},(_,i)=>row(blank+i,`note ${i}`))]
  const calls=[]
  return {calls,page:async(from,to)=>{calls.push([from,to]);return {rows:all.slice(from,to+1),error:null}}}
}

test('many blank notes first: still returns 5 non-blank (old limit(12) would give 0)',async()=>{
  const t=table(30,10)
  const rows=await loadStickyRows(t.page)
  assert.equal(stickySummaries(rows).length,STICKY_LIMIT)
  assert.ok(t.calls.length>1)
})
test('stops after the first page when it already holds 5 non-blank notes',async()=>{
  const t=table(0,50)
  await loadStickyRows(t.page)
  assert.equal(t.calls.length,1)
})
test('fewer than 5 notes exist: returns what there is, one short page',async()=>{
  const t=table(2,3)
  const rows=await loadStickyRows(t.page)
  assert.equal(rows.length,5)
  assert.equal(stickySummaries(rows).length,3)
  assert.equal(t.calls.length,1)
})
test('bounded: all-blank table stops at maxPages',async()=>{
  const t=table(500,0)
  await loadStickyRows(t.page,20,5)
  assert.equal(t.calls.length,5)
})
test('any page failing → null (caller keeps its last good rows)',async()=>{
  let n=0
  const rows=await loadStickyRows(async()=>(++n===2?{rows:null,error:new Error('x')}:{rows:Array.from({length:20},(_,i)=>row(i,'')),error:null}))
  assert.equal(rows,null)
})
