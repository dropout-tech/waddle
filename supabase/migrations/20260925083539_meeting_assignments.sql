alter table public.meeting_imports add column context jsonb not null default '{}'::jsonb;
alter table public.meeting_imports add column checklist jsonb not null default '{}'::jsonb;

create table public.meeting_task_assignments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meeting_imports(id) on delete cascade,
  source_index integer not null check (source_index between 0 and 19),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  source text not null,
  meeting_title text not null,
  meeting_date date not null,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(meeting_id,source_index),
  check(sender_id<>recipient_id)
);
create index meeting_assignments_recipient on public.meeting_task_assignments(recipient_id,status,created_at desc);
alter table public.meeting_task_assignments enable row level security;
-- No direct writes: recipient decisions and task creation must be atomic.
create policy meeting_assignments_participants on public.meeting_task_assignments for select to authenticated
using ((select auth.uid()) in (sender_id,recipient_id));
revoke all on public.meeting_task_assignments from anon,authenticated;
grant select on public.meeting_task_assignments to authenticated;
grant all on public.meeting_task_assignments to service_role;

create function public.reserve_meeting_import_v2(p_user uuid,p_id uuid,p_title text,p_date date,p_transcript text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reservation jsonb; old_context jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,726));
  select context into old_context from public.meeting_imports where id=p_id and user_id=p_user;
  if found and old_context<>p_context then raise exception 'REQUEST_CONFLICT'; end if;
  reservation:=public.reserve_meeting_import(p_user,p_id,p_title,p_date,p_transcript);
  if (reservation->>'claimed')::boolean then
    update public.meeting_imports set context=p_context where id=p_id and user_id=p_user;
  end if;
  return reservation;
end $$;

create function public.route_meeting_tasks(p_user uuid,p_id uuid,p_category uuid,p_tasks jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.meeting_imports; item jsonb; idx integer; recipient uuid; assignment uuid;
  edited jsonb; task_map jsonb; sender text;
begin
  select * into r from public.meeting_imports where id=p_id and user_id=p_user and status='succeeded' for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'INVALID_TASKS'; end if;
  edited:=r.checklist;
  select coalesce(nullif(display_name,''),'Huddle 使用者') into sender from public.profiles where id=p_user;
  for item in select value from jsonb_array_elements(p_tasks) loop
    idx:=(item->>'index')::integer;
    if idx is null or idx<0 or idx>=jsonb_array_length(r.result->'tasks') then raise exception 'INVALID_INDEX'; end if;
    if r.imported_tasks ? idx::text or exists(select 1 from public.meeting_task_assignments where meeting_id=p_id and source_index=idx) then continue; end if;
    if coalesce(char_length(trim(item->>'title')),0) not between 1 and 200 or coalesce(char_length(item->>'owner'),0)>100 then raise exception 'INVALID_TASK'; end if;
    recipient:=nullif(item->>'assigneeId','')::uuid;
    -- Cast even for unassigned drafts so malformed dates never become durable.
    perform nullif(item->>'dueDate','')::date;
    if recipient=p_user then
      task_map:=public.import_meeting_tasks(p_user,p_id,p_category,jsonb_build_array(item));
      r.imported_tasks:=task_map;
    elsif recipient is not null then
      perform 1 from public.calendar_shares where user_lo=least(p_user,recipient) and user_hi=greatest(p_user,recipient) for share;
      if not found then raise exception 'RECIPIENT_NOT_CONNECTED'; end if;
      insert into public.meeting_task_assignments(meeting_id,source_index,sender_id,recipient_id,sender_name,title,due_date,source,meeting_title,meeting_date)
      values(p_id,idx,p_user,recipient,coalesce(sender,'Huddle 使用者'),trim(item->>'title'),nullif(item->>'dueDate','')::date,
        r.result->'tasks'->idx->>'source',r.title,r.meeting_date) returning id into assignment;
    end if;
    edited:=edited||jsonb_build_object(idx::text,item);
  end loop;
  update public.meeting_imports set checklist=edited where id=p_id;
  return jsonb_build_object('importedTasks',r.imported_tasks,'checklist',edited);
end $$;

create function public.finish_meeting_import_v2(p_user uuid,p_id uuid,p_result jsonb,p_usage jsonb)
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

create function public.respond_meeting_assignment(p_user uuid,p_id uuid,p_accept boolean,p_category uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.meeting_task_assignments; c public.categories; w public.workspaces; v_task_id uuid;
begin
  select * into a from public.meeting_task_assignments where id=p_id and recipient_id=p_user for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  if a.status<>'pending' then return to_jsonb(a); end if;
  if p_accept then
    select * into c from public.categories where id=p_category and user_id=p_user and not is_archived;
    if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
    select * into w from public.workspaces where id=c.workspace_id and user_id=p_user and not is_archived;
    if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
    perform 1 from public.calendar_shares where user_lo=least(a.sender_id,p_user) and user_hi=greatest(a.sender_id,p_user) for share;
    if not found then raise exception 'RECIPIENT_NOT_CONNECTED'; end if;
    insert into public.tasks(user_id,workspace_id,category_id,title,due_date,description,calendar_color)
    values(p_user,w.id,c.id,a.title,a.due_date,'指派人：'||a.sender_name||E'\n會議：'||a.meeting_title||'（'||a.meeting_date::text||'）'||E'\n來源原文：'||a.source,w.color)
    returning id into v_task_id;
  end if;
  update public.meeting_task_assignments set status=case when p_accept then 'accepted' else 'rejected' end,
    task_id=v_task_id,responded_at=now() where id=p_id returning * into a;
  return to_jsonb(a);
end $$;

revoke all on function public.reserve_meeting_import_v2(uuid,uuid,text,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.route_meeting_tasks(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_meeting_import_v2(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.respond_meeting_assignment(uuid,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.reserve_meeting_import_v2(uuid,uuid,text,date,text,jsonb) to service_role;
grant execute on function public.route_meeting_tasks(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_meeting_import_v2(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.respond_meeting_assignment(uuid,uuid,boolean,uuid) to service_role;
