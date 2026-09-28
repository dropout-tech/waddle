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
import { getWaterNextDueAt, getWaterReminderEnabled, recordWaterFromWidget } from '@/lib/water-reminder'
import { applyWidgetActions } from '@/lib/widgets/actions'
import { widgetPet } from '@/lib/widgets/pet'
import { isTaskOverdue } from '@/lib/task-utils'
import { getLang } from '@/lib/i18n'
import type { PetSettings } from '@/lib/pet/types'
import type { Workspace, TimeBlock, ScratchpadItem, NotebookNote } from '@/lib/types'

export function WidgetSync({workspaces,timeBlocks,boards,notes,pet=null}:{workspaces:Workspace[];timeBlocks:TimeBlock[];boards:Record<string,ScratchpadItem[]>;notes?:NotebookNote[];pet?:PetSettings|null}) {
  const {user}=useAuth(), timer=useFocusTimer(), notebook=useNotebook()
  const latest=useRef({workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user,pet})
  useEffect(()=>{latest.current={workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user,pet}},[workspaces,timeBlocks,boards,timer,notebook.notes,notes,user,pet])
  useEffect(()=>{
    let alive=true, busy=false
    const sync=async()=>{
      if(busy || !alive || !latest.current.user) return
      busy=true
      try {
        const source=latest.current.user.id, auth=widgetAccount()
        if(auth.accountId !== source || !auth.epoch) return
        const {actions=[]}=await HuddleWidgets.read()
        const db=createClient()
        // Widget taps (task ticks, water, focus timer) replayed in order — lib/widgets/actions.ts.
        const {handled,aborted}=await applyWidgetActions(actions,{db,source,epoch:auth.epoch,
          isCurrent:()=>alive && widgetAccount().accountId===source && widgetAccount().epoch===auth.epoch,
          focus:(op,at)=>latest.current.timer.applyWidgetFocus(op,at),
          water:at=>recordWaterFromWidget(at),
          notify:message=>toast.info(message)})
        if(aborted) return
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
        // 「我的 Huddle」: look + ready-rendered lines; the widget picks the bubble itself.
        const overdue=x.workspaces.filter(w=>!w.isArchived).flatMap(w=>w.categories.filter(c=>!c.isArchived).flatMap(c=>c.tasks)).filter(t=>isTaskOverdue(t,snapshot.today)).length
        snapshot.pet=widgetPet(x.pet,{overdue,lang:getLang(),day:snapshot.today})
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
  useEffect(()=>{window.dispatchEvent(new Event('huddle-widget-refresh'))},[workspaces,timeBlocks,boards,notebook.notes,notes,timer.state,timer.session,pet])
  return null
}
