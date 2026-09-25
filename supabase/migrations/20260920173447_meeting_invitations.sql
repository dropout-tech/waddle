-- RPC-only invitations. Private definer functions enforce membership explicitly.
create schema if not exists meeting_private;
revoke all on schema meeting_private from public, anon;
grant usage on schema meeting_private to authenticated;
create table public.meeting_invitations (
 id uuid primary key default gen_random_uuid(), organizer_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), description text not null default '' check(length(description)<=2000),
 location text not null default '' check(length(location)<=500), starts_at timestamptz not null, ends_at timestamptz not null,
 time_zone text not null, status text not null default 'active' check(status in ('active','cancelled')),
 client_request_id uuid not null, request_payload jsonb not null, created_at timestamptz not null default now(),
 unique(organizer_id,client_request_id), check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create table public.meeting_attendees (
 meeting_id uuid references public.meeting_invitations(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 response text not null default 'pending' check(response in ('pending','accepted','tentative','declined')),
 updated_at timestamptz not null default now(), primary key(meeting_id,user_id)
);
create index meeting_attendees_user_idx on public.meeting_attendees(user_id,meeting_id);
create index meeting_invitations_time_idx on public.meeting_invitations(starts_at,ends_at);
create table public.meeting_email_outbox (
 id uuid primary key default gen_random_uuid(), meeting_id uuid not null references public.meeting_invitations(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade, event_type text not null check(event_type in ('invitation','cancellation')),
 status text not null default 'pending' check(status in ('pending','sent','failed')), created_at timestamptz not null default now(),
 sent_at timestamptz, last_error text, unique(meeting_id,recipient_id,event_type)
);
alter table public.meeting_invitations enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_email_outbox enable row level security;
-- No client table policies/grants: all reads and writes use membership-checked RPCs.
revoke all on public.meeting_invitations,public.meeting_attendees,public.meeting_email_outbox from public,anon,authenticated;
grant all on public.meeting_invitations,public.meeting_attendees,public.meeting_email_outbox to service_role;

create function meeting_private.create_invitation(p_title text,p_description text,p_location text,p_start timestamptz,p_end timestamptz,p_time_zone text,p_invitees uuid[],p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); peers uuid[]; payload jsonb; existing public.meeting_invitations; mid uuid;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select array_agg(distinct x order by x) into peers from unnest(p_invitees) x;
 if p_request_id is null or peers is null or cardinality(peers) not between 1 and 10 or array_position(peers,null) is not null or u=any(peers) then raise exception 'invalid invitees or request id' using errcode='22023'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 or length(coalesce(p_description,''))>2000 or length(coalesce(p_location,''))>500 or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end>p_start+interval '24 hours' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'invalid meeting details' using errcode='22023'; end if;
 payload:=jsonb_build_object('title',trim(p_title),'description',coalesce(p_description,''),'location',coalesce(p_location,''),'start',extract(epoch from p_start),'end',extract(epoch from p_end),'time_zone',p_time_zone,'invitees',peers);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||p_request_id::text,0));
 select * into existing from public.meeting_invitations where organizer_id=u and client_request_id=p_request_id;
 if found then
  if existing.request_payload<>payload then raise exception 'request id already used with different details' using errcode='22023'; end if;
  return existing.id;
 end if;
 if p_start<=now() then raise exception 'meeting must start in the future' using errcode='22023'; end if;
 if exists(select 1 from unnest(peers) x where not exists(select 1 from public.calendar_shares s where s.user_lo=least(u,x) and s.user_hi=greatest(u,x))) then raise exception 'invitees must be shared calendar partners' using errcode='42501'; end if;
 insert into public.meeting_invitations(organizer_id,title,description,location,starts_at,ends_at,time_zone,client_request_id,request_payload) values(u,trim(p_title),coalesce(p_description,''),coalesce(p_location,''),p_start,p_end,p_time_zone,p_request_id,payload) returning id into mid;
 insert into public.meeting_attendees(meeting_id,user_id,response) values(mid,u,'accepted');
 insert into public.meeting_attendees(meeting_id,user_id) select mid,x from unnest(peers) x;
 insert into public.meeting_email_outbox(meeting_id,recipient_id,event_type) select mid,x,'invitation' from unnest(peers) x;
 return mid;
end $$;
create function meeting_private.list_invitations(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to>p_from+interval '366 days' then raise exception 'invalid range' using errcode='22023'; end if;
 select coalesce(jsonb_agg(rowdata order by starts_at),'[]'::jsonb) into result from (
 select m.starts_at,jsonb_build_object('id',m.id,'organizer_id',m.organizer_id,'title',m.title,'description',m.description,'location',m.location,'starts_at',m.starts_at,'ends_at',m.ends_at,'time_zone',m.time_zone,'status',m.status,'created_at',m.created_at,
 'participants',(select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',coalesce(p.display_name,'Huddle member'),'response',a.response) order by a.user_id) from public.meeting_attendees a left join public.profiles p on p.id=a.user_id where a.meeting_id=m.id),
 'email_status',case when m.organizer_id=u then (select jsonb_build_object('pending',count(*) filter(where o.status='pending'),'sent',count(*) filter(where o.status='sent'),'failed',count(*) filter(where o.status='failed')) from public.meeting_email_outbox o where o.meeting_id=m.id and o.event_type=case when m.status='cancelled' then 'cancellation' else 'invitation' end) else null end) rowdata
 from public.meeting_invitations m where m.starts_at<p_to and m.ends_at>p_from and exists(select 1 from public.meeting_attendees a where a.meeting_id=m.id and a.user_id=u)
 ) q;
 return result;
end $$;
create function meeting_private.respond(p_meeting_id uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.meeting_invitations;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into m from public.meeting_invitations where id=p_meeting_id for update;
 if not found or not exists(select 1 from public.meeting_attendees where meeting_id=p_meeting_id and user_id=u) then raise exception 'invitation unavailable' using errcode='42501'; end if;
 if m.status<>'active' or m.organizer_id=u or p_response is null or p_response not in ('accepted','tentative','declined') then raise exception 'invalid response' using errcode='22023'; end if;
 update public.meeting_attendees set response=p_response,updated_at=now() where meeting_id=p_meeting_id and user_id=u;
end $$;
create function meeting_private.cancel(p_meeting_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from public.meeting_invitations where id=p_meeting_id and organizer_id=u for update;
 if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
 update public.meeting_invitations set status='cancelled' where id=p_meeting_id;
 insert into public.meeting_email_outbox(meeting_id,recipient_id,event_type) select p_meeting_id,user_id,'cancellation' from public.meeting_attendees where meeting_id=p_meeting_id and user_id<>u on conflict do nothing;
end $$;
create function meeting_private.shared_busy(p_peers uuid[],p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to>p_from+interval '366 days' or p_peers is null or cardinality(p_peers)>11 or array_position(p_peers,null) is not null then raise exception 'invalid range or peers' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_peers) x where x<>u and not exists(select 1 from public.calendar_shares s where s.user_lo=least(u,x) and s.user_hi=greatest(u,x))) then raise exception 'calendar sharing required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'starts_at',m.starts_at,'ends_at',m.ends_at) order by m.starts_at),'[]'::jsonb) into result from public.meeting_attendees a join public.meeting_invitations m on m.id=a.meeting_id where a.user_id=any(p_peers) and (a.user_id=u or exists(select 1 from public.meeting_attendees own where own.meeting_id=m.id and own.user_id=u)) and a.response='accepted' and m.status='active' and m.starts_at<p_to and m.ends_at>p_from;
 return result;
end $$;

create function public.create_meeting_invitation(p_title text,p_description text,p_location text,p_start timestamptz,p_end timestamptz,p_time_zone text,p_invitees uuid[],p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$ select meeting_private.create_invitation(p_title,p_description,p_location,p_start,p_end,p_time_zone,p_invitees,p_request_id); $$;
revoke all on function public.create_meeting_invitation(text,text,text,timestamptz,timestamptz,text,uuid[],uuid) from public,anon;
grant execute on function public.create_meeting_invitation(text,text,text,timestamptz,timestamptz,text,uuid[],uuid) to authenticated;
revoke all on function meeting_private.create_invitation(text,text,text,timestamptz,timestamptz,text,uuid[],uuid) from public,anon;
grant execute on function meeting_private.create_invitation(text,text,text,timestamptz,timestamptz,text,uuid[],uuid) to authenticated;

create function public.get_meeting_invitations(p_from timestamptz,p_to timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.list_invitations(p_from,p_to); $$;
revoke all on function public.get_meeting_invitations(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_meeting_invitations(timestamptz,timestamptz) to authenticated;
revoke all on function meeting_private.list_invitations(timestamptz,timestamptz) from public,anon;
grant execute on function meeting_private.list_invitations(timestamptz,timestamptz) to authenticated;

create function public.respond_meeting_invitation(p_meeting_id uuid,p_response text) returns void language sql security invoker set search_path='' as $$ select meeting_private.respond(p_meeting_id,p_response); $$;
revoke all on function public.respond_meeting_invitation(uuid,text) from public,anon;
grant execute on function public.respond_meeting_invitation(uuid,text) to authenticated;
revoke all on function meeting_private.respond(uuid,text) from public,anon;
grant execute on function meeting_private.respond(uuid,text) to authenticated;

create function public.cancel_meeting_invitation(p_meeting_id uuid) returns void language sql security invoker set search_path='' as $$ select meeting_private.cancel(p_meeting_id); $$;
revoke all on function public.cancel_meeting_invitation(uuid) from public,anon;
grant execute on function public.cancel_meeting_invitation(uuid) to authenticated;
revoke all on function meeting_private.cancel(uuid) from public,anon;
grant execute on function meeting_private.cancel(uuid) to authenticated;

create function public.get_shared_meeting_busy(p_peers uuid[],p_from timestamptz,p_to timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.shared_busy(p_peers,p_from,p_to); $$;
revoke all on function public.get_shared_meeting_busy(uuid[],timestamptz,timestamptz) from public,anon;
grant execute on function public.get_shared_meeting_busy(uuid[],timestamptz,timestamptz) to authenticated;
revoke all on function meeting_private.shared_busy(uuid[],timestamptz,timestamptz) from public,anon;
grant execute on function meeting_private.shared_busy(uuid[],timestamptz,timestamptz) to authenticated;
-- Persist the provider retry window: never automatically resend an uncertain old attempt.
alter table public.meeting_email_outbox add column first_attempt_at timestamptz;

create function meeting_private.get_invitation(p_meeting_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.meeting_invitations; result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into m from public.meeting_invitations i where i.id=p_meeting_id and exists(select 1 from public.meeting_attendees a where a.meeting_id=i.id and a.user_id=u);
 if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
 select value into result from jsonb_array_elements(meeting_private.list_invitations(m.starts_at,m.ends_at)) where value->>'id'=p_meeting_id::text;
 return result;
end $$;
create function public.get_meeting_invitation(p_meeting_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.get_invitation(p_meeting_id); $$;
revoke all on function meeting_private.get_invitation(uuid),public.get_meeting_invitation(uuid) from public,anon;
grant execute on function meeting_private.get_invitation(uuid),public.get_meeting_invitation(uuid) to authenticated;

-- Recover a lost create response without revealing another organizer's request.
create function meeting_private.get_invitation_by_request(p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); mid uuid;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select id into mid from public.meeting_invitations where organizer_id=u and client_request_id=p_request_id;
 if mid is null then return null; end if;
 return meeting_private.get_invitation(mid);
end $$;
create function public.get_meeting_invitation_by_request(p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.get_invitation_by_request(p_request_id); $$;
revoke all on function meeting_private.get_invitation_by_request(uuid),public.get_meeting_invitation_by_request(uuid) from public,anon;
grant execute on function meeting_private.get_invitation_by_request(uuid),public.get_meeting_invitation_by_request(uuid) to authenticated;
