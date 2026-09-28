// 「我的 Huddle」 widget data + penguin-voiced reminder wording.
// Run: node --test scripts/tests/widget-pet.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
// '@/x' and extensionless relative imports → the .ts file (or its index.ts), as the bundler does.
const tsFile=base=>existsSync(base+'.ts')?base+'.ts':existsSync(resolve(base,'index.ts'))?resolve(base,'index.ts'):null
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('@/'))return next(pathToFileURL(tsFile(resolve(specifier.slice(2)))).href,context)
  if(specifier.startsWith('.')&&context.parentURL&&!/\.[cm]?[jt]s$/.test(specifier)){
    const file=tsFile(fileURLToPath(new URL(specifier,context.parentURL)))
    if(file)return next(pathToFileURL(file).href,context)
  }
  return next(specifier,context)
}})
const {widgetPet,WIDGET_PET_LINES}=await import('../../lib/widgets/pet.ts')
const {petVoiced,petVoiceName,setPetVoice}=await import('../../lib/pet/voice.ts')
const {setLang}=await import('../../lib/i18n/index.ts')
const pet={adopted:true,enabled:true,name:'麻糬',color:'mustard',accessory:'hat',chattiness:'medium',quietDuringFocus:true}

test('not adopted (or hidden) → the widget invites adoption and carries no lines',()=>{
  for(const p of [null,{...pet,adopted:false},{...pet,enabled:false}]){
    const w=widgetPet(p,{overdue:0,lang:'zh-TW',day:'2026-09-28'})
    assert.equal(w.adopted,false);assert.deepEqual(w.lines,[])
  }
})
test('adopted: look passes through, lines are short, stable for the day, and rotate by day',()=>{
  const a=widgetPet(pet,{overdue:0,lang:'zh-TW',day:'2026-09-28'}), b=widgetPet(pet,{overdue:0,lang:'zh-TW',day:'2026-09-28'}), c=widgetPet(pet,{overdue:0,lang:'zh-TW',day:'2026-09-29'})
  assert.equal(a.color,'mustard');assert.equal(a.accessory,'hat');assert.equal(a.name,'麻糬')
  assert.equal(a.lines.length,WIDGET_PET_LINES)
  for(const l of a.lines)assert.ok(Array.from(l).length<=30,l)
  assert.deepEqual(a.lines,b.lines);assert.notDeepEqual(a.lines,c.lines)
  assert.equal(a.overdueLine,'')
})
test('overdue line carries the real count; English mode draws English lines',()=>{
  const zh=widgetPet(pet,{overdue:3,lang:'zh-TW',day:'2026-09-28'})
  assert.match(zh.overdueLine,/3/)
  const en=widgetPet(pet,{overdue:2,lang:'en',day:'2026-09-28'})
  assert.match(en.overdueLine,/2/)
  for(const l of en.lines)assert.ok(!/[一-鿿]/.test(l),l)
})
test('unknown colour / accessory fall back safely',()=>{
  const w=widgetPet({...pet,color:'neon',accessory:'crown'},{overdue:0,lang:'zh-TW',day:'2026-09-28'})
  assert.equal(w.color,'ink');assert.equal(w.accessory,'none')
})
test('reminders: penguin voice changes wording only, both languages; unchanged without a penguin',()=>{
  const n={title:'會議提醒 · 提案會議',body:'15:00 開始（10 分鐘後）'}
  setLang('zh-TW')
  assert.deepEqual(petVoiced(n,'麻糬'),{title:'麻糬：呱！',body:'會議提醒 · 提案會議\n15:00 開始（10 分鐘後）'})
  assert.deepEqual(petVoiced(n,null),n)
  setLang('en')
  assert.equal(petVoiced(n,'Mochi').title,'Mochi: Honk!')
  setLang('zh-TW')
  assert.equal(petVoiceName({...pet,enabled:false}),null)
  setPetVoice(pet);assert.equal(petVoiced(n).title,'麻糬：呱！')
  setPetVoice(null);assert.deepEqual(petVoiced(n),n)
})
