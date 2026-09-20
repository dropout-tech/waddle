-- Off by default. Enable only after paid launch and migration validation.
create table public.meeting_plan_config (
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.meeting_plan_config values(true,false);
alter table public.meeting_plan_config enable row level security;
revoke all on public.meeting_plan_config from public,anon,authenticated;
grant all on public.meeting_plan_config to service_role;
create index meeting_organizer_created_idx on public.meeting_invitations(organizer_id,created_at);

create function meeting_private.plan_usage() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); checked timestamptz:=clock_timestamp(); month_start timestamptz; month_end timestamptz; pro boolean; enabled boolean; used integer;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 month_start:=date_trunc('month',checked at time zone 'Asia/Taipei') at time zone 'Asia/Taipei';
 month_end:=(date_trunc('month',checked at time zone 'Asia/Taipei')+interval '1 month') at time zone 'Asia/Taipei';
 select exists(select 1 from public.billing_entitlements where user_id=u and entitlement='pro' and expires_at>checked) into pro;
 select coalesce((select c.enabled from public.meeting_plan_config c where id=true),false) into enabled;
 select count(*) into used from public.meeting_invitations where organizer_id=u and created_at>=month_start and created_at<month_end;
 return jsonb_build_object('enabled',enabled,'plan',case when pro then 'pro' else 'free' end,'monthly_limit',case when pro then 50 else 3 end,'invitee_limit',case when pro then 10 else 2 end,'used',used,'period_start',month_start,'resets_at',month_end,'checked_at',checked);
end $$;
revoke all on function meeting_private.plan_usage() from public,anon;
grant execute on function meeting_private.plan_usage() to authenticated;
create function public.get_meeting_plan_usage() returns jsonb language sql security invoker set search_path='' as $$ select meeting_private.plan_usage(); $$;
revoke all on function public.get_meeting_plan_usage() from public,anon;
grant execute on function public.get_meeting_plan_usage() to authenticated;

create or replace function meeting_private.create_invitation(p_title text,p_description text,p_location text,p_start timestamptz,p_end timestamptz,p_time_zone text,p_invitees uuid[],p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); peers uuid[]; payload jsonb; existing public.meeting_invitations; mid uuid; quota jsonb; creation_time timestamptz;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 select array_agg(distinct x order by x) into peers from unnest(p_invitees) x;
 if p_request_id is null or peers is null or cardinality(peers) not between 1 and 10 or array_position(peers,null) is not null or u=any(peers) then raise exception 'invalid invitees or request id' using errcode='22023'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 or length(coalesce(p_description,''))>2000 or length(coalesce(p_location,''))>500 or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start or p_end>p_start+interval '24 hours' or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone) then raise exception 'invalid meeting details' using errcode='22023'; end if;
 payload:=jsonb_build_object('title',trim(p_title),'description',coalesce(p_description,''),'location',coalesce(p_location,''),'start',extract(epoch from p_start),'end',extract(epoch from p_end),'time_zone',p_time_zone,'invitees',peers);
 -- Serialize all creates for an organizer, including different request IDs.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meeting-plan:'||u::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||p_request_id::text,0));
 select * into existing from public.meeting_invitations where organizer_id=u and client_request_id=p_request_id;
 if found then
  if existing.request_payload<>payload then raise exception 'request id already used with different details' using errcode='22023'; end if;
  return existing.id;
 end if;
 if p_start<=now() then raise exception 'meeting must start in the future' using errcode='22023'; end if;
 if exists(select 1 from unnest(peers) x where not exists(select 1 from public.calendar_shares s where s.user_lo=least(u,x) and s.user_hi=greatest(u,x))) then raise exception 'invitees must be shared calendar partners' using errcode='42501'; end if;
 quota:=meeting_private.plan_usage();
 if (quota->>'enabled')::boolean then
  if cardinality(peers)>(quota->>'invitee_limit')::int then raise exception 'meeting_invitee_limit' using errcode='P0001'; end if;
  if (quota->>'used')::int>=(quota->>'monthly_limit')::int then raise exception 'meeting_monthly_limit' using errcode='P0001'; end if;
 end if;
 creation_time:=(quota->>'checked_at')::timestamptz;
 insert into public.meeting_invitations(organizer_id,title,description,location,starts_at,ends_at,time_zone,client_request_id,request_payload,created_at) values(u,trim(p_title),coalesce(p_description,''),coalesce(p_location,''),p_start,p_end,p_time_zone,p_request_id,payload,creation_time) returning id into mid;
 insert into public.meeting_attendees(meeting_id,user_id,response) values(mid,u,'accepted');
 insert into public.meeting_attendees(meeting_id,user_id) select mid,x from unnest(peers) x;
 insert into public.meeting_email_outbox(meeting_id,recipient_id,event_type) select mid,x,'invitation' from unnest(peers) x;
 return mid;
end $$;
