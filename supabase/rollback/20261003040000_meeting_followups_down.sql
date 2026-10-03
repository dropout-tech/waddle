-- Rollback for 20261003040000_meeting_followups.sql.
-- Ship a frontend that no longer calls get_task_meeting_source /
-- list_meeting_followups FIRST (the calls would fail with "function does not
-- exist"). Follow-up tasks already created automatically stay as normal tasks.
set lock_timeout = '5s';
drop function if exists public.list_meeting_followups(boolean);
drop function if exists public.get_task_meeting_source(uuid);

-- Previous body (20260925083539_meeting_assignments.sql): explicit self only.
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
    where t.value->>'assignmentConfidence'='explicit' and exists (
      select 1 from jsonb_array_elements(r.context->'participants') p
      where p->>'id'=t.value->>'ownerParticipantId' and p->>'userId'=p_user::text
    );
    if jsonb_array_length(self_tasks)>0 then
      perform public.route_meeting_tasks(p_user,p_id,(r.context->>'categoryId')::uuid,self_tasks);
    end if;
  end if;
  select * into r from public.meeting_imports where id=p_id and user_id=p_user;
  return to_jsonb(r);
end $$;
