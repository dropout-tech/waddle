'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthGuard } from '@/components/auth/auth-guard'
import { useAuth } from '@/components/auth/auth-provider'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { useWaddleData } from '@/hooks/use-waddle-data'
import { useNotebook } from '@/hooks/use-notebook'
import { FocusScratchpad } from '@/components/scratchpad/focus-scratchpad'
import { NoteEditor } from '@/components/notebook/note-editor'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { useWaterReminder } from '@/hooks/use-water-reminder'
import { getWaterNextDueAt, getWaterReminderEnabled } from '@/lib/water-reminder'
import { focusNoteTitle, focusNoteExcerpt, makeSnapshot, widgetKinds, widgetNames, type WidgetKind, type WidgetSnapshot } from '@/lib/widgets/model'
import { widgetDemo } from '@/lib/widgets/demo'
import { WidgetCard } from './widget-card'
import { WidgetSync } from './widget-sync'
import { enableWidgetReminders } from '@/lib/widgets/reminders'
import { isNative } from '@/lib/platform'
import styles from './widgets.module.css'

export function WidgetGallery() {
  const {user,loading}=useAuth(); const params=useSearchParams(); const [real,setReal]=useState(false)
  useEffect(()=>{if(user && new URLSearchParams(location.search).has('open')) setReal(true)},[user])
  if(loading) return <main className={styles.page}>載入中…</main>
  return real&&user ? <AuthGuard><LiveGallery key={`${user.id}:${params.toString()}`} onDemo={()=>setReal(false)}/></AuthGuard> : <DemoGallery onLive={user?()=>setReal(true):undefined}/>
}
function GalleryFrame({data,onOpen,onComplete,onAction,live=false,onMode,children}:{data:WidgetSnapshot;onOpen:(kind:WidgetKind,id?:string,date?:string)=>void;onComplete:(id:string)=>void;onAction:(action:string)=>void;live?:boolean;onMode?:()=>void;children?:React.ReactNode}) {
  const [size,setSize]=useState<'small'|'medium'|'large'>('large'),[filter,setFilter]=useState('all')
  return <main className={styles.page}>
    {/* THESIS: A personal widget shelf keeps a month, a task and a thought within reach.
        OWN-WORLD: Existing Huddle cream, terracotta and sage; only original huddle-mascot.png.
        STORY: Preview eleven widgets, choose size, open existing workspaces.
        FIRST VIEWPORT: Brand at left; size controls above independent native-shaped widgets.
        FORM: User-approved widget collection, expanded with all accepted functions.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md */}
    <div className={styles.heading}><HuddleMascot className="h-20 w-20"/><div><h1>Huddle・把今天放在手邊</h1><p>小小的紀錄，讓生活更靠近想要的樣子。</p></div></div>
    <div className={styles.toolbar}><label>尺寸 <select aria-label="小工具尺寸" value={size} onChange={e=>setSize(e.target.value as typeof size)}><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label><label>種類 <select aria-label="小工具種類" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部 11 款</option>{widgetKinds.map(k=><option key={k} value={k}>{widgetNames[k]}</option>)}</select></label>{onMode?<button onClick={onMode}>{live?'查看示範':'使用我的資料'}</button>:<Link href="/login">登入使用自己的資料</Link>}<Link href="/">返回 Huddle</Link></div>
    <p className={styles.notice}>{live?'目前使用你的資料；內容編輯會儲存至原本的工作區。':'互動預覽 · 以下皆為示範資料，不會改動你的任務。'}</p>
    {children}
    {filter==='all'?<><div className={styles.composition}>{([{title:'月曆與今日任務',kinds:['overview']},{title:'隨手記・三個入口',kinds:['shortcuts','whiteboard','notebook']},{title:'專注記事與任務',kinds:['focus-note','tasks']}] as {title:string;kinds:WidgetKind[]}[]).map(group=><section className={styles.collection} key={group.title}><h2 className={styles.collectionTitle}>{group.title}</h2><div className={styles.stack}>{group.kinds.map(kind=><WidgetCard key={kind} kind={kind} data={data} size={size} onOpen={onOpen} onComplete={onComplete} onAction={onAction}/>)}</div></section>)}</div><h2 className={styles.moreTitle}>更多陪你安排日常的小工具</h2><div className={styles.grid}>{(['calendar','agenda','top-three','focus','water'] as WidgetKind[]).map(kind=><WidgetCard key={kind} kind={kind} data={data} size={size} onOpen={onOpen} onComplete={onComplete} onAction={onAction}/>)}</div></>:<div className={styles.grid}><WidgetCard kind={filter as WidgetKind} data={data} size={size} onOpen={onOpen} onComplete={onComplete} onAction={onAction}/></div>}
    <p className={styles.hint}>這是小工具的互動預覽與設定入口。手機主畫面版本仍在開發與實機驗收中，目前尚未提供可安裝版本。內容更新受系統排程影響；筆記與白板的完整編輯會在 App 中開啟。鎖定畫面只顯示安全摘要。</p>
  </main>
}
function DemoGallery({onLive}:{onLive?:()=>void}) {
  const [data,setData]=useState(widgetDemo),[message,setMessage]=useState(''),[note,setNote]=useState(''),[editing,setEditing]=useState<WidgetKind|null>(null)
  useEffect(()=>{if(data.focus.state!=='running')return;const id=setInterval(()=>setData(d=>({...d,focus:{...d.focus,seconds:Math.max(0,d.focus.seconds-1),state:d.focus.seconds<=1?'completed':'running'}})),1000);return()=>clearInterval(id)},[data.focus.state])
  const open=(kind:WidgetKind,_id?:string,date?:string)=>{setMessage(date?`${date}：示範開啟當日${widgetNames[kind]}`:`示範開啟${widgetNames[kind]}`);if(['notebook','focus-note','whiteboard'].includes(kind))setEditing(kind)}
  const action=(a:string)=>{
    if(a==='new-note'){setEditing('notebook');return}
    if(a==='water'||a==='snooze'){setMessage(a==='water'?'已記下一次喝水（示範）':'已延後 5 分鐘（示範）');return}
    if(a==='new-task'){setEditing('tasks');return}
    setData(d=>({...d,focus:{...d.focus,state:a==='pause'?'paused':a==='stop'?'idle':'running',seconds:a==='start'?1500:d.focus.seconds}}))
  }
  return <GalleryFrame data={data} onMode={onLive} onOpen={open} onComplete={id=>setData(d=>({...d,tasks:d.tasks.map(t=>t.id===id?{...t,completed:!t.completed}:t)}))} onAction={action}>
    <p role="status" className={styles.notice}>{message}</p>{editing&&<section className={styles.detail}><h2>{widgetNames[editing]} · 示範編輯</h2><textarea autoFocus aria-label="示範內容" value={note} onChange={e=>setNote(e.target.value)}/><button onClick={()=>{setData(d=>editing==='tasks'?{...d,tasks:[...d.tasks,{id:crypto.randomUUID(),title:note||'新任務',subtitle:'示範',actionable:true}]}:editing==='focus-note'?{...d,focus:{...d.focus,note}}:editing==='whiteboard'?{...d,boards:[{id:'demo-board',title:'我的白板',subtitle:note}]}:{...d,notes:[{id:'demo-note',title:note.split('\n')[0]||'新筆記',subtitle:note},...d.notes]});setEditing(null);setNote('');setMessage('已更新示範內容')}}>完成示範</button><button onClick={()=>setEditing(null)}>取消</button></section>}
  </GalleryFrame>
}
function LiveGallery({onDemo}:{onDemo:()=>void}) {
  const {user}=useAuth(), board=useWaddleData(), notebook=useNotebook(),timer=useFocusTimer(),water=useWaterReminder(),router=useRouter()
  const [boardDate,setBoardDate]=useState<string|undefined>(),[whiteboard,setWhiteboard]=useState(false),[noteId,setNoteId]=useState<string|null>(null),[message,setMessage]=useState('')
  const tasks=useMemo(()=>board.workspaces.filter(w=>!w.isArchived).flatMap(w=>w.categories.filter(c=>!c.isArchived).flatMap(c=>c.tasks)),[board.workspaces])
  const today=new Date().toDateString()
  const baseData=useMemo(()=>makeSnapshot({accountId:user!.id,epoch:'',tasks,blocks:board.timeBlocks,boards:board.scratchpadByDate,notes:notebook.notes}),[user!.id,tasks,board.timeBlocks,board.scratchpadByDate,notebook.notes,today])
  const data={...baseData}
  data.focus={state:timer.state,title:timer.session?.label??'慢慢來，先專心一件事',seconds:timer.displayTime,endAt:null,note:focusNoteExcerpt(notebook.notes,data.today,timer.session?.label)}
  data.water={enabled:getWaterReminderEnabled(),nextAt:getWaterNextDueAt(),count:0}
  const open=(kind:WidgetKind,id?:string,date?:string)=>{
    if(kind==='whiteboard'){setBoardDate(date&&board.scratchpadByDate[date]?date:undefined);setWhiteboard(true);return}
    if(kind==='focus-note'){
      const title=focusNoteTitle(data.today,timer.session?.label)
      let n=notebook.notes.find(n=>n.title===title)
      if(!n){n=notebook.createNote()??undefined;if(n)notebook.renameNote(n.id,title)}
      if(n)setNoteId(n.id);return
    }
    if(kind==='notebook'){if(id==='new'){const n=notebook.createNote();if(n)setNoteId(n.id);return}const n=id?notebook.notes.find(n=>n.id===id):notebook.notes[0];if(n)setNoteId(n.id);else router.push('/notebook/');return}
    if(kind==='focus'){timer.setIsExpanded(true);return}
    if(kind==='water'){setMessage('可按「喝了」重新安排提醒，或稍後提醒。');return}
    if(kind==='shortcuts')return
    const q=new URLSearchParams({widget:kind==='tasks'&&id==='new'?'new-task':kind});if(id)q.set('task',id);if(date)q.set('date',date);router.push(`/?${q}`)
  }
  const initial=useRef(false)
  useEffect(()=>{if(initial.current||board.isLoading||notebook.loading)return;initial.current=true;const q=new URLSearchParams(location.search),k=q.get('open') as WidgetKind;if(widgetKinds.includes(k))open(k,q.get('id')??undefined,q.get('date')??undefined)},[board.isLoading,notebook.loading]) // Only consume the launch destination once, after data authorization.
  const action=(a:string)=>{
    if(a==='new-note'){const n=notebook.createNote();if(n)setNoteId(n.id)}
    else if(a==='new-task')router.push('/?widget=new-task')
    else if(a==='start')timer.startTimer({presetIndex:0,forceMini:true})
    else if(a==='pause')timer.pauseTimer()
    else if(a==='resume')timer.resumeTimer()
    else if(a==='stop')timer.stopTimer()
    else if(a==='water'){water.dismiss();setMessage('已重新安排下次喝水提醒')}
    else if(a==='snooze'){water.snooze();setMessage('已延後 5 分鐘')}
  }
  const note=notebook.notes.find(n=>n.id===noteId)
  if(board.isLoading||notebook.loading)return <main className={styles.page}>正在載入你的小工具資料…</main>
  return <GalleryFrame data={data} live onMode={onDemo} onOpen={open} onAction={action} onComplete={id=>void board.toggleTaskComplete(id)}>
    {isNative()&&<WidgetSync notes={notebook.notes} workspaces={board.workspaces} timeBlocks={board.timeBlocks} boards={board.scratchpadByDate}/>}
    <p role="status">{message}</p>
    {isNative()&&<button className={styles.primary} onClick={()=>void enableWidgetReminders(user!.id).then(ok=>{setMessage(ok?'背景專注與喝水提醒已啟用':'尚未允許通知，請至系統設定開啟');window.dispatchEvent(new Event('huddle-widget-refresh'))})}>啟用背景提醒</button>}
    {whiteboard&&<FocusScratchpad initialDate={boardDate} isOpen onOpenChange={setWhiteboard} scratchpadByDate={board.scratchpadByDate} onAddItem={board.addScratchpadItem} onUpdateItem={board.updateScratchpadItem} onDeleteItem={board.deleteScratchpadItem} onReorderItems={board.reorderScratchpadItems} onClearDate={board.clearScratchpadDate}/>}
    {note&&<section className={styles.detail}><button onClick={()=>setNoteId(null)}>返回小工具</button><span role="status">{notebook.saveStatus==='error'?'儲存失敗，請保留內容並重試':notebook.saveStatus==='saving'?'儲存中…':'記事本'}</span><NoteEditor note={note} onTitleChange={title=>notebook.renameNote(note.id,title)} onContentChange={content=>notebook.saveNoteContent(note.id,content)} uploadImage={notebook.uploadImage}/></section>}
  </GalleryFrame>
}
