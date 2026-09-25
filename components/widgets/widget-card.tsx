'use client'
import Image from 'next/image'
import { CalendarDays, Check, Plus, NotebookPen, PanelsTopLeft, Focus, ArrowUpRight, Droplets, Play, Pause, Square } from 'lucide-react'
import { HuddleMascot } from '@/components/branding/waddle-mascot'
import { widgetNames, type WidgetKind, type WidgetSnapshot, type WidgetItem } from '@/lib/widgets/model'
import styles from './widgets.module.css'
export interface WidgetCardProps {kind:WidgetKind;data:WidgetSnapshot;size:'small'|'medium'|'large';onOpen:(kind:WidgetKind,id?:string,date?:string)=>void;onComplete:(id:string)=>void;onAction:(action:string)=>void}
export function WidgetCard({kind,data,size,onOpen,onComplete,onAction}:WidgetCardProps) {
  const limit=size==='small'?2:size==='medium'?3:5
  const shortcuts=<div className={styles.shortcuts}>{([{kind:'whiteboard',Icon:PanelsTopLeft},{kind:'notebook',Icon:NotebookPen},{kind:'focus-note',Icon:Focus}] as const).map(({kind:k,Icon})=><button key={k} onClick={()=>onOpen(k)}><Icon size={21}/><span>{widgetNames[k]}</span></button>)}</div>
  const rows=(items:WidgetItem[],tasks=false)=> <div className={styles.rows}>{items.length?items.slice(0,limit).map(item=><div className={styles.row} key={`${item.id}-${item.date}`}>
    {tasks?<button className={styles.check} aria-label={`${item.completed?'取消完成':'完成'} ${item.title}`} aria-pressed={!!item.completed} onClick={()=>item.actionable?onComplete(item.id):onOpen('tasks',item.id)}>{item.completed?<Check size={17}/>:<span/>}</button>:item.time?<time>{item.time}</time>:null}
    <button className={styles.rowText} onClick={()=>onOpen(kind,item.id,item.date)}><span className={item.completed?styles.done:''}>{item.title}</span><small>{item.subtitle}</small></button>
  </div>):<p className={styles.empty}>這裡還有空間，慢慢安排。</p>}</div>
  const calendar=<><div className={styles.monthTitle}>{Number(data.today.slice(0,4))} 年 {Number(data.today.slice(5,7))} 月</div><div className={styles.calendar}>{['日','一','二','三','四','五','六'].map(d=><small key={d}>{d}</small>)}{data.days.map(day=><button key={day.date} className={`${day.inMonth?'':styles.outside} ${day.date===data.today?styles.today:''}`} aria-label={`${day.date}，${day.count} 個安排`} onClick={()=>onOpen('calendar',undefined,day.date)}><span>{day.day}</span>{day.count>0&&<i/>}</button>)}</div></>
  return <article className={`${styles.widget} ${styles[size]}`} data-widget={kind}>
    <header><h2>{widgetNames[kind]}</h2><button aria-label={`開啟${widgetNames[kind]}`} onClick={()=>onOpen(kind)}><ArrowUpRight size={19}/></button></header>
    {(kind==='calendar'||kind==='overview')&&calendar}
    {kind==='overview'&&<><h3>今天，慢慢來</h3>{rows(data.agenda.slice(0,1))}{rows(data.tasks.slice(0,2),true)}{size!=='small'&&shortcuts}</>}
    {kind==='agenda'&&rows(data.agenda)}
    {(kind==='tasks'||kind==='top-three')&&<>{rows(kind==='top-three'?data.tasks.filter(t=>!t.completed).slice(0,3):data.tasks,true)}<button className={styles.textButton} onClick={()=>onAction('new-task')}><Plus size={17}/>新增任務</button></>}
    {kind==='shortcuts'&&<><p>想法來了，先留下來。</p>{shortcuts}</>}
    {kind==='whiteboard'&&<><div className={styles.boardPreview}>{data.boards[0]?<><h3>{data.boards[0].title}</h3>{data.boards[0].thumbnail&&<Image src={data.boards[0].thumbnail} alt="白板摘要預覽" width={480} height={240} className={styles.thumbnail}/>}<p>{data.boards[0].subtitle||'打開白板，繼續放上你的想法。'}</p></>:<p>攤開想法，從一個念頭開始。</p>}</div><button className={styles.textButton} onClick={()=>onOpen('whiteboard',data.boards[0]?.id,data.boards[0]?.date)}>開啟白板 <ArrowUpRight size={17}/></button></>}
    {kind==='notebook'&&<>{rows(data.notes)}<button className={styles.textButton} onClick={()=>onAction('new-note')}><Plus size={17}/>新筆記</button></>}
    {kind==='focus-note'&&<><h3>{data.focus.title}</h3><p className={styles.excerpt}>{data.focus.note||'把這次專注的想法，先記下來。'}</p><div className={styles.noteAction}><button className={styles.primary} onClick={()=>onOpen('focus-note')}>記一筆</button><HuddleMascot className="h-16 w-16"/></div></>}
    {kind==='focus'&&<><p>{data.focus.title}</p><div className={styles.timer}>{String(Math.floor(data.focus.seconds/60)).padStart(2,'0')}:{String(data.focus.seconds%60).padStart(2,'0')}</div><div className={styles.actions}><button className={styles.primary} onClick={()=>onAction(data.focus.state==='running'?'pause':data.focus.state==='paused'?'resume':'start')}>{data.focus.state==='running'?<Pause size={17}/>:<Play size={17}/>} {data.focus.state==='running'?'暫停':data.focus.state==='paused'?'繼續':'開始專注'}</button>{data.focus.state!=='idle'&&<button aria-label="結束專注" onClick={()=>onAction('stop')}><Square size={18}/></button>}</div></>}
    {kind==='water'&&<><Droplets className={styles.waterIcon} size={32}/><h3>喝口水，休息一下</h3><p>{data.water.enabled?'照自己的步調，補充一點水。':'提醒尚未開啟'}</p><div className={styles.actions}><button className={styles.primary} onClick={()=>onAction('water')}>喝了</button><button onClick={()=>onAction('snooze')}>稍後提醒</button></div></>}
    <footer><CalendarDays size={12}/><span>{data.accountId==='demo'?'示範資料':`更新 ${new Date(data.generatedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}`}</span></footer>
  </article>
}
