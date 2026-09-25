-- Monthly quota is shared across devices and enforced only by trusted server RPCs.
create table public.meeting_imports (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null default date_trunc('month', now() at time zone 'Asia/Taipei')::date,
  title text not null check (char_length(title) between 1 and 160),
  meeting_date date not null,
  transcript text not null check (char_length(transcript) between 20 and 40000),
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  result jsonb,
  imported_tasks jsonb not null default '{}'::jsonb,
  usage jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (status <> 'succeeded' or result is not null)
);
create index meeting_imports_user_month on public.meeting_imports(user_id, month, status);
alter table public.meeting_imports enable row level security;
create policy meeting_imports_read_own on public.meeting_imports for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.meeting_imports from anon, authenticated;
grant select on public.meeting_imports to authenticated;
grant all on public.meeting_imports to service_role;

-- These SECURITY INVOKER RPCs are callable only by the Edge Function's service
-- role after getUser verifies the caller. No client can set quota or AI results.
create function public.reserve_meeting_import(p_user uuid, p_id uuid, p_title text, p_date date, p_transcript text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.meeting_imports; m date := date_trunc('month', now() at time zone 'Asia/Taipei')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 726));
  update public.meeting_imports set status='failed', finished_at=now()
    where user_id=p_user and status='pending' and created_at < now()-interval '5 minutes';
  select * into r from public.meeting_imports where id=p_id;
  if found then
    if r.user_id <> p_user or r.transcript <> p_transcript or r.title <> p_title or r.meeting_date <> p_date then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('claimed',false,'meeting',to_jsonb(r));
  end if;
  if (select count(*) from public.meeting_imports where user_id=p_user and month=m and status in ('pending','succeeded')) >= 20 then
    raise exception 'MONTHLY_LIMIT';
  end if;
  if (select count(*) from public.meeting_imports where user_id=p_user and created_at>now()-interval '1 hour') >= 30 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.meeting_imports(id,user_id,title,meeting_date,transcript) values(p_id,p_user,p_title,p_date,p_transcript) returning * into r;
  return jsonb_build_object('claimed',true,'meeting',to_jsonb(r));
end $$;

create function public.finish_meeting_import(p_user uuid, p_id uuid, p_result jsonb, p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.meeting_imports;
begin
  update public.meeting_imports set status=case when p_result is null then 'failed' else 'succeeded' end,
    result=p_result, usage=p_usage, finished_at=now()
    where id=p_id and user_id=p_user and status='pending' returning * into r;
  if not found then raise exception 'REQUEST_EXPIRED'; end if;
  return to_jsonb(r);
end $$;

-- One transaction for task insertion and its durable source mapping. Replaying
-- a selection returns existing IDs; deleting a task never recreates it silently.
create function public.import_meeting_tasks(p_user uuid, p_id uuid, p_category uuid, p_tasks jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.meeting_imports; c public.categories; w public.workspaces; item jsonb;
  idx integer; task_id uuid; mapping jsonb; source text;
begin
  select * into r from public.meeting_imports where id=p_id and user_id=p_user and status='succeeded' for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  select * into c from public.categories where id=p_category and user_id=p_user and not is_archived;
  if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
  select * into w from public.workspaces where id=c.workspace_id and user_id=p_user and not is_archived;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) not between 1 and 20 then raise exception 'INVALID_TASKS'; end if;
  mapping := r.imported_tasks;
  for item in select value from jsonb_array_elements(p_tasks) loop
    idx := (item->>'index')::integer;
    if idx is null or idx < 0 or idx >= jsonb_array_length(r.result->'tasks') then raise exception 'INVALID_INDEX'; end if;
    if mapping ? idx::text then continue; end if;
    if coalesce(char_length(trim(item->>'title')),0) not between 1 and 200
      or coalesce(char_length(item->>'owner'),0)>100 then raise exception 'INVALID_TASK'; end if;
    source := r.result->'tasks'->idx->>'source';
    task_id := gen_random_uuid();
    insert into public.tasks(id,user_id,workspace_id,category_id,title,description,due_date,calendar_color)
    values(task_id,p_user,w.id,c.id,trim(item->>'title'),
      '會議：'||r.title||'（'||r.meeting_date::text||'）'||E'\n負責人（文字備註）：'||coalesce(nullif(trim(item->>'owner'),''),'待確認')||E'\n來源原文：'||source,
      nullif(item->>'dueDate','')::date,w.color);
    mapping := mapping || jsonb_build_object(idx::text,task_id);
  end loop;
  update public.meeting_imports set imported_tasks=mapping where id=p_id;
  return mapping;
end $$;
revoke all on function public.reserve_meeting_import(uuid,uuid,text,date,text) from public,anon,authenticated;
revoke all on function public.finish_meeting_import(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.import_meeting_tasks(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_meeting_import(uuid,uuid,text,date,text) to service_role;
grant execute on function public.finish_meeting_import(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.import_meeting_tasks(uuid,uuid,uuid,jsonb) to service_role;
