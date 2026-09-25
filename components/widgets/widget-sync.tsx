'use client'
import { toast } from 'sonner'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { useFocusTimer } from '@/components/timer/focus-timer-provider'
import { useNotebook } from '@/hooks/use-notebook'
import { boardThumbnail } from '@/lib/widgets/thumbnail'
import { syncWidgetReminders } from '@/lib/widgets/reminders'
import { focusNoteExcerpt, makeSnapshot } from '@/lib/widgets/model'
import { HuddleWidgets, publishWidgets, widgetAccount } from '@/lib/widgets/native'
import { rowToTask } from '@/lib/supabase/mappers'
import { createClient } from '@/lib/supabase/client'
import { getWaterNextDueAt, getWaterReminderEnabled } from '@/lib/water-reminder'
import type { Workspace, TimeBlock, ScratchpadItem, NotebookNote } from '@/lib/types'

export function WidgetSync({workspaces,timeBlocks,boards,notes}:{workspaces:Workspace[];timeBlocks:TimeBlock[];boards:Record<string,ScratchpadItem[]>;notes?:NotebookNote[]}) {
  const {user}=useAuth(), timer=useFocusTimer(), notebook=useNotebook()
  const latest=useRef({workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user})
  useEffect(()=>{latest.current={workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user}},[workspaces,timeBlocks,boards,timer,notebook.notes,notes,user])
  useEffect(()=>{
    let alive=true, busy=false
    const sync=async()=>{
      if(busy || !alive || !latest.current.user) return
      busy=true
      try {
        const source=latest.current.user.id, auth=widgetAccount()
        if(auth.accountId !== source || !auth.epoch) return
        const {actions=[]}=await HuddleWidgets.read()
        const db=createClient(), handled:string[]=[]
        for(const action of actions) {
          if(!alive || widgetAccount().accountId !== source || widgetAccount().epoch !== auth.epoch) return
          if(action.accountId!==source || action.epoch!==auth.epoch) continue
          // Explicit SET, never toggle: retry after a crash cannot undo completion.
          const {data:current,error:readError}=await db.from('tasks').select('id,is_completed,updated_at,is_recurring,is_archived').eq('id',action.taskId).eq('user_id',source).maybeSingle()
          if(!alive || widgetAccount().accountId !== source || widgetAccount().epoch !== auth.epoch) return
          if(readError) continue
          if(!current || current.is_completed || current.is_archived || current.is_recurring || current.updated_at!==action.revision) {handled.push(action.id);if(!current?.is_completed)toast.info('小工具任務已變更，請在 App 確認最新內容');continue}
          const {data,error}=await db.from('tasks').update({is_completed:true,completed_at:new Date().toISOString()}).eq('id',action.taskId).eq('user_id',source).eq('updated_at',action.revision).select('id')
          if(!error && data?.length) handled.push(action.id)
        }
        if(handled.length) {await HuddleWidgets.acknowledge({accountId:source,epoch:auth.epoch,ids:handled});window.dispatchEvent(new Event('huddle-widget-synced'));return}
        if(!alive || widgetAccount().accountId!==source || widgetAccount().epoch!==auth.epoch) return
        const x=latest.current
        const snapshot=makeSnapshot({accountId:source,epoch:auth.epoch,tasks:x.workspaces.filter(w=>!w.isArchived).flatMap(w=>w.categories.filter(c=>!c.isArchived).flatMap(c=>c.tasks)),blocks:x.timeBlocks,boards:x.boards,notes:x.notes})
        // Completion revisions and displayed task content must come from the same server row.
        if(snapshot.tasks.length) {
          const {data:rows,error}=await db.from('tasks').select('*').eq('user_id',source).in('id',snapshot.tasks.map(t=>t.id))
          if(error) return
          if(!alive || widgetAccount().accountId!==source || widgetAccount().epoch!==auth.epoch) return
          const labels=new Map(snapshot.tasks.map(t=>[t.id,t.subtitle]))
          snapshot.tasks=makeSnapshot({accountId:source,epoch:auth.epoch,tasks:(rows??[]).map(r=>rowToTask(r,'','',labels.get(r.id)??'')),blocks:[],boards:{}}).tasks
        }
        snapshot.boards = snapshot.boards.map(b => ({...b, thumbnail: boardThumbnail(x.boards[b.id] ?? [])}))
        const s=x.timer.session
        snapshot.focus={mode:s?.mode,state:x.timer.state,title:s?.label ?? '慢慢來，先專心一件事',seconds:x.timer.displayTime,endAt:s && x.timer.state==='running' && s.mode==='pomodoro' ? s.startedAt.getTime()+s.pausedMs+s.targetSeconds*1000:null,note:focusNoteExcerpt(x.notes,snapshot.today,s?.label)}
        snapshot.water={enabled:getWaterReminderEnabled(),nextAt:getWaterNextDueAt(),count:0}
        await publishWidgets(snapshot)
        await syncWidgetReminders(snapshot)
      } catch { /* Keep last snapshot; widget shows its last update time. */ }
      finally {busy=false}
    }
    let changeTimer: ReturnType<typeof setTimeout> | undefined
    const onChange=()=>{clearTimeout(changeTimer);changeTimer=setTimeout(()=>void sync(),750)}
    window.addEventListener('huddle-widget-refresh',onChange)
    const onVisible=()=>{if(document.visibilityState==='visible') void sync()}
    const id=window.setInterval(()=>void sync(),30_000)
    const first=window.setTimeout(()=>void sync(),750)
    window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible)
    return ()=>{alive=false;clearTimeout(changeTimer);window.removeEventListener('huddle-widget-refresh',onChange);clearInterval(id);clearTimeout(first);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible)}
  },[user?.id])
  useEffect(()=>{window.dispatchEvent(new Event('huddle-widget-refresh'))},[workspaces,timeBlocks,boards,notebook.notes,notes,timer.state,timer.session])
  return null
}
