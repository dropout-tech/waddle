-- Meeting follow-ups ("對方答應的事" → my own 追蹤任務).
--  1. Automatic self import (context.autoSelf) now also creates the follow-up
--     tasks (result.tasks[i].followUp = true, built by
--     supabase/functions/meeting-import/contract.ts validateResult). It routes
--     them through route_meeting_tasks → import_meeting_tasks with exactly the
--     payload the web client sends on a manual save (title, owner, dueDate,
--     assigneeId = me; components/meetings/meeting-workspace.tsx), so the task
--     title, due date and description are identical to the manual path.
--  2. get_task_meeting_source(task): which meeting import created this task.
--  3. list_meeting_followups(include_done): my follow-up tasks still waiting
--     on the other side.
-- Both client RPCs are SECURITY INVOKER: they read only through the caller's
-- own RLS (meeting_imports_read_own, tasks_select_own and the restrictive
-- suspension policies) and additionally pin every row to auth.uid(), because
-- tasks_select_assignee also exposes other people's rows to an assignee.
-- tasks is not altered (tasks.source lives in migrations-draft/ and is
-- independent: it reacts to imported_tasks, which this path still writes).
-- Rollback: supabase/rollback/20261003040000_meeting_followups_down.sql

-- Same body as 20260925083539_meeting_assignments.sql; only the WHERE gains
-- the follow-up branch. A follow-up never matches the explicit-self branch
-- (a participant on my side makes the task "ours"), and both live in one
-- WHERE, so a task is routed at most once.
create or replace function public.finish_meeting_import_v2(p_user uuid,p_id uuid,p_result jsonb,p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.meeting_imports; self_tasks jsonb;
begin
  perform public.finish_meeting_import(p_user,p_id,p_result,p_usage);
  select * into r from public.meeting_imports where id=p_id and user_id=p_user;
  if p_result is not null and coalesce((r.context->>'autoSelf')::boolean,false) then
    select coalesce(jsonb_agg(jsonb_build_object('index',t.ordinality-1,'title',t.value->>'title','owner',t.value->>'owner',
      'dueDate',t.value->>'dueDate','assigneeId',p_user)), '[]'::jsonb) into self_tasks
    from jsonb_array_elements(p_result->'tasks') with ordinality t(value,ordinality)
    where (t.value->>'assignmentConfidence'='explicit' and exists (
      select 1 from jsonb_array_elements(r.context->'participants') p
      where p->>'id'=t.value->>'ownerParticipantId' and p->>'userId'=p_user::text
    )) or t.value->'followUp'='true'::jsonb;
    if jsonb_array_length(self_tasks)>0 then
      -- Sub-transaction: follow-ups make this branch common, so a failed
      -- auto-create (category archived mid-run, account suspended) must not
      -- roll back the stored AI result; the user can still save by hand.
      begin
        perform public.route_meeting_tasks(p_user,p_id,(r.context->>'categoryId')::uuid,self_tasks);
      exception when others then
        raise warning 'meeting autoSelf skipped for %: %', p_id, sqlerrm;
      end;
    end if;
  end if;
  select * into r from public.meeting_imports where id=p_id and user_id=p_user;
  return to_jsonb(r);
end $$;
-- create or replace keeps the existing grants (service_role only).

-- imported_tasks is {"<index>": "<task uuid>"} written by import_meeting_tasks.
-- Values are compared as text, so a malformed value can never raise a cast
-- error; it simply matches nothing.
create or replace function public.get_task_meeting_source(p_task_id uuid)
returns table(import_id uuid, title text, meeting_date date)
language sql stable security invoker set search_path='' as $$
  select m.id, m.title, m.meeting_date
    from public.meeting_imports m
   where m.user_id = auth.uid()
     and exists (select 1 from public.tasks t where t.id = p_task_id and t.user_id = auth.uid())
     and exists (select 1 from jsonb_each_text(m.imported_tasks) v where lower(v.value) = p_task_id::text)
   order by m.created_at desc
   limit 1
$$;

-- A task is a follow-up when result.tasks[index].followUp is true; records
-- written before followUp existed fall back to ownerSide = 'theirs'; with
-- neither field (or a non-boolean followUp and no ownerSide) it is not listed.
-- counterpart = the owner text the task was saved with (checklist, i.e. what
-- the user confirmed or edited), else the AI result's owner.
create or replace function public.list_meeting_followups(p_include_done boolean default false)
returns table(task_id uuid, title text, due_date date, is_completed boolean, counterpart text,
  import_id uuid, meeting_title text, meeting_date date)
language sql stable security invoker set search_path='' as $$
  select t.id, t.title, t.due_date, t.is_completed,
         coalesce(nullif(trim(m.checklist->v.key->>'owner'),''), nullif(trim(item.value->>'owner'),'')),
         m.id, m.title, m.meeting_date
    from public.meeting_imports m
    cross join lateral jsonb_each_text(m.imported_tasks) v
    cross join lateral (select case when v.key ~ '^[0-9]{1,3}$' and jsonb_typeof(m.result->'tasks')='array'
                                    then m.result->'tasks'->(v.key::integer) end as value) item
    join public.tasks t on t.id = case when v.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                       then v.value::uuid end
   where m.user_id = auth.uid()
     and t.user_id = auth.uid()
     and not t.is_archived
     and (p_include_done or not t.is_completed)
     and jsonb_typeof(item.value) = 'object'
     and case when jsonb_typeof(item.value->'followUp') = 'boolean' then item.value->'followUp' = 'true'::jsonb
              else item.value->>'ownerSide' = 'theirs' end
   order by t.due_date asc nulls last, m.meeting_date desc, t.created_at, t.id
$$;

revoke all on function public.get_task_meeting_source(uuid) from public, anon;
revoke all on function public.list_meeting_followups(boolean) from public, anon;
grant execute on function public.get_task_meeting_source(uuid) to authenticated;
grant execute on function public.list_meeting_followups(boolean) to authenticated;
