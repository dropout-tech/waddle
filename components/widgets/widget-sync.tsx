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
import { applyWidgetActions, withWatchFocus, WATCH_FOCUS_TTL_MS } from '@/lib/widgets/actions'
import { widgetPet } from '@/lib/widgets/pet'
import { isTaskOverdue } from '@/lib/task-utils'
import { getLang } from '@/lib/i18n'
import { checkInDate } from '@/lib/daily-check-in'
import type { WidgetSnapshot } from '@/lib/widgets/model'
import type { PetSettings } from '@/lib/pet/types'
import type { Workspace, TimeBlock, ScratchpadItem, NotebookNote } from '@/lib/types'

type Timer=ReturnType<typeof useFocusTimer>
/** Live Activity / focus widget payload, derived from the in-memory timer only (no network). */
function focusOf(timer:Timer,notes:NotebookNote[],today:string):WidgetSnapshot['focus'] {
  const s=timer.session
  return {mode:s?.mode,state:timer.state,title:s?.label ?? '慢慢來，先專心一件事',seconds:timer.displayTime,endAt:s && timer.state==='running' && s.mode==='pomodoro' ? s.startedAt.getTime()+s.pausedMs+s.targetSeconds*1000:null,note:focusNoteExcerpt(notes,today,s?.label)}
}

export function WidgetSync({workspaces,timeBlocks,boards,notes,pet=null}:{workspaces:Workspace[];timeBlocks:TimeBlock[];boards:Record<string,ScratchpadItem[]>;notes?:NotebookNote[];pet?:PetSettings|null}) {
  const {user}=useAuth(), timer=useFocusTimer(), notebook=useNotebook()
  const latest=useRef({workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user,pet})
  // Last snapshot that reached the native store — lets a focus start/pause/stop
  // republish instantly instead of waiting on the debounced, network-bound sync.
  const lastSnap=useRef<WidgetSnapshot|null>(null)
  useEffect(()=>{latest.current={workspaces,timeBlocks,boards,timer,notes:notes??notebook.notes,user,pet}},[workspaces,timeBlocks,boards,timer,notebook.notes,notes,user,pet])
  useEffect(()=>{
    let alive=true, busy=false, again=false
    let checkIn:{at:number;value?:WidgetSnapshot['checkIn']}|undefined
    const sync=async():Promise<void>=>{
      // A change that lands mid-sync must not be dropped (it used to wait for the 30s tick).
      if(busy) {again=true;return}
      if(!alive || !latest.current.user) return
      busy=true
      try {
        const source=latest.current.user.id, auth=widgetAccount()
        if(auth.accountId !== source || !auth.epoch) return
        const {actions=[],focusCommand}=await HuddleWidgets.read()
        const db=createClient()
        // A watch "start" during the ~2s completion farewell waits in its slot (not acked) and
        // runs on the refresh that follows the timer going idle; stale ones are still dropped.
        const watch=focusCommand?.action==='start' && latest.current.timer.state==='completed' && Date.now()-focusCommand.at<WATCH_FOCUS_TTL_MS ? undefined : focusCommand
        const {queue,dropped}=withWatchFocus(actions,watch,source,auth.epoch)
        // Widget taps (task ticks, water, focus timer) and the Apple Watch focus command, replayed
        // in order through one path — lib/widgets/actions.ts → timer.applyWidgetFocus.
        const replay=await applyWidgetActions(queue,{db,source,epoch:auth.epoch,
          isCurrent:()=>alive && widgetAccount().accountId===source && widgetAccount().epoch===auth.epoch,
          focus:(op,at)=>latest.current.timer.applyWidgetFocus(op,at),
          water:at=>recordWaterFromWidget(at),
          notify:message=>toast.info(message)})
        if(replay.aborted) return
        const handled=[...dropped,...replay.handled]
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
        snapshot.water={enabled:getWaterReminderEnabled(),nextAt:getWaterNextDueAt(),count:0}
        // 「我的 Huddle」: look + ready-rendered lines; the widget picks the bubble itself.
        const overdue=x.workspaces.filter(w=>!w.isArchived).flatMap(w=>w.categories.filter(c=>!c.isArchived).flatMap(c=>c.tasks)).filter(t=>isTaskOverdue(t,snapshot.today)).length
        snapshot.pet=widgetPet(x.pet,{overdue,lang:getLang(),day:snapshot.today})
        // Check-in status for the watch; refreshed at most every 5 minutes or when the Taipei day changes.
        if(!checkIn||Date.now()-checkIn.at>300_000||checkIn.value?.date!==checkInDate()) {
          const {data,error}=await db.rpc('get_daily_check_in_status').single()
          if(!alive || widgetAccount().accountId!==source || widgetAccount().epoch!==auth.epoch) return
          checkIn={at:Date.now(),value:error||!data?undefined:{date:data.check_in_date,checkedIn:data.checked_in,points:data.total_points}}
        }
        snapshot.checkIn=checkIn.value
        // Read the timer after the network awaits so a start/pause during the fetch isn't overwritten.
        snapshot.focus=focusOf(latest.current.timer,latest.current.notes,snapshot.today)
        await publishWidgets(snapshot)
        lastSnap.current=snapshot
        await syncWidgetReminders(snapshot)
      } catch { /* Keep last snapshot; widget shows its last update time. */ }
      finally {busy=false;if(again && alive) {again=false;void sync()}}
    }
    let changeTimer: ReturnType<typeof setTimeout> | undefined
    const onChange=()=>{clearTimeout(changeTimer);changeTimer=setTimeout(()=>void sync(),750)}
    window.addEventListener('huddle-widget-refresh',onChange)
    const onVisible=()=>{if(document.visibilityState==='visible') void sync()}
    const id=window.setInterval(()=>void sync(),30_000)
    const first=window.setTimeout(()=>void sync(),750)
    window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible)
    return ()=>{alive=false;lastSnap.current=null;clearTimeout(changeTimer);window.removeEventListener('huddle-widget-refresh',onChange);clearInterval(id);clearTimeout(first);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible)}
  },[user?.id])
  useEffect(()=>{window.dispatchEvent(new Event('huddle-widget-refresh'))},[workspaces,timeBlocks,boards,notebook.notes,notes,timer.state,timer.session,pet])
  // Focus start / pause / resume / stop → push the Live Activity right away from the
  // last published snapshot (only `focus` changes; the full sync above follows).
  useEffect(()=>{
    const last=lastSnap.current, auth=widgetAccount()
    if(!last || !user || last.accountId!==user.id || auth.accountId!==last.accountId || auth.epoch!==last.epoch) return
    const next={...last,generatedAt:new Date().toISOString(),focus:focusOf(timer,notes??notebook.notes,last.today)}
    lastSnap.current=next
    void publishWidgets(next).catch(()=>{})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only focus transitions, not every tick
  },[timer.state,timer.session])
  return null
}
