-- Durable recipient-only notifications, created in the same transaction as invitations.
create table public.meeting_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 meeting_id uuid not null references public.meeting_invitations(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 kind text not null check (kind in ('invitation','response','cancellation')),
 response text check (response in ('accepted','tentative','declined')),
 created_at timestamptz not null default now(), read_at timestamptz
);
alter table public.meeting_notifications enable row level security;
revoke all on public.meeting_notifications from public,anon,authenticated;
create index meeting_notifications_unread_idx on public.meeting_notifications(recipient_id,created_at desc,id desc) where read_at is null;

create function meeting_private.notify_attendee() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select organizer_id into owner_id from public.meeting_invitations where id=new.meeting_id;
 if new.user_id=owner_id then return new; end if;
 if TG_OP='INSERT' then
  insert into public.meeting_notifications(recipient_id,meeting_id,actor_id,kind)
  values(new.user_id,new.meeting_id,owner_id,'invitation');
 elsif new.response is distinct from old.response then
  insert into public.meeting_notifications(recipient_id,meeting_id,actor_id,kind,response)
  values(owner_id,new.meeting_id,new.user_id,'response',new.response);
 end if;
 return new;
end $$;
revoke all on function meeting_private.notify_attendee() from public,anon,authenticated;
create trigger meeting_attendee_notification after insert or update of response on public.meeting_attendees
for each row execute function meeting_private.notify_attendee();

create function meeting_private.notify_cancellation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status is distinct from new.status then
  insert into public.meeting_notifications(recipient_id,meeting_id,actor_id,kind)
  select user_id,new.id,new.organizer_id,'cancellation' from public.meeting_attendees
  where meeting_id=new.id and user_id<>new.organizer_id;
 end if;
 return new;
end $$;
revoke all on function meeting_private.notify_cancellation() from public,anon,authenticated;
create trigger meeting_cancel_notification after update of status on public.meeting_invitations
for each row execute function meeting_private.notify_cancellation();

create function meeting_private.list_notifications() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select jsonb_build_object('unread_count',count(*)) into result
 from public.meeting_notifications where recipient_id=u and read_at is null;
 return result || jsonb_build_object('items',coalesce((select jsonb_agg(rowdata order by created_at desc,id desc) from (
 select n.id,n.created_at,jsonb_build_object('id',n.id,'meeting_id',n.meeting_id,'kind',n.kind,'response',n.response,
 'title',m.title,'actor_name',coalesce(p.display_name,'Huddle member'),'created_at',n.created_at) rowdata
 from public.meeting_notifications n join public.meeting_invitations m on m.id=n.meeting_id
 left join public.profiles p on p.id=n.actor_id
 where n.recipient_id=u and n.read_at is null order by n.created_at desc,n.id desc limit 50
 ) q),'[]'::jsonb));
end $$;
create function meeting_private.read_notification(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 update public.meeting_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid();
 if not found then raise exception 'notification unavailable' using errcode='42501'; end if;
end $$;
create function public.get_meeting_notifications() returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.list_notifications(); $$;
create function public.read_meeting_notification(p_id uuid) returns void language sql security invoker set search_path='' as $$ select meeting_private.read_notification(p_id); $$;
revoke all on function meeting_private.list_notifications(),meeting_private.read_notification(uuid),public.get_meeting_notifications(),public.read_meeting_notification(uuid) from public,anon;
grant execute on function meeting_private.list_notifications(),meeting_private.read_notification(uuid),public.get_meeting_notifications(),public.read_meeting_notification(uuid) to authenticated;

-- Existing invitations remain accessible; do not fabricate historical notifications.
-- Keep the historical email audit table, but stop enqueuing new emails.
create or replace function meeting_private.create_invitation(p_title text,p_description text,p_location text,p_start timestamptz,p_end timestamptz,p_time_zone text,p_invitees uuid[],p_request_id uuid)
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
 return mid;
end $$;

create or replace function meeting_private.cancel(p_meeting_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from public.meeting_invitations where id=p_meeting_id and organizer_id=u for update;
 if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
 update public.meeting_invitations set status='cancelled' where id=p_meeting_id;
end $$;
