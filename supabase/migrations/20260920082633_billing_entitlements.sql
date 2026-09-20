-- Preparation only: apply to staging and validate before enabling purchases.
create table public.billing_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null check (entitlement = 'pro'),
  expires_at timestamptz,
  observed_at_ms bigint not null,
  primary key (user_id, entitlement)
);
alter table public.billing_entitlements enable row level security;
revoke all on public.billing_entitlements from public, anon, authenticated;
grant select on public.billing_entitlements to authenticated;
grant all on public.billing_entitlements to service_role;
create policy billing_read_own on public.billing_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.billing_processed_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.billing_processed_events enable row level security;
revoke all on public.billing_processed_events from public, anon, authenticated;
grant all on public.billing_processed_events to service_role;

-- Service-only invoker: transaction rollback also rolls back the event marker.
create function public.apply_billing_snapshot(p_event_id text, p_snapshots jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare item jsonb;
begin
  insert into public.billing_processed_events(event_id) values (p_event_id)
  on conflict do nothing;
  if not found then return; end if;
  -- Deterministic row order prevents opposite-direction transfer deadlocks.
  for item in select value from jsonb_array_elements(p_snapshots) order by value->>'user_id' loop
    -- Deleted accounts and obsolete aliases must not block the other transfer participants.
    begin
      insert into public.billing_entitlements(user_id, entitlement, expires_at, observed_at_ms)
      values ((item->>'user_id')::uuid, 'pro', (item->>'expires_at')::timestamptz, (item->>'observed_at_ms')::bigint)
      on conflict (user_id, entitlement) do update set
        expires_at = excluded.expires_at, observed_at_ms = excluded.observed_at_ms
      where excluded.observed_at_ms > public.billing_entitlements.observed_at_ms;
    exception when foreign_key_violation then
      null;
    end;
  end loop;
end;
$$;
revoke all on function public.apply_billing_snapshot(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_snapshot(text, jsonb) to service_role;
