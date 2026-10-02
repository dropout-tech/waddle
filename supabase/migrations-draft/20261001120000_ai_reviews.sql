-- ─────────────────────────────────────────────────────────────────────────────
-- AI consent ledger (multi-feature) + AI review reports.
-- Spec: spec-ai-review.md v3 (F2, F5, F6, F11, F12, section 6.3).
-- Design: docs/features/ai-review-design.md.
--
-- DRAFT: not applied to any database yet. Purely additive: three new tables
-- and new functions. No existing table, function, policy or grant is changed.
--
-- Tables
--   public.ai_consents        Append-only consent log shared by every AI
--                             feature ('ai_review', 'meeting_import'). One row
--                             per decision; the newest row per (user, feature)
--                             is the current state. Each feature has its own
--                             copy version and data-scope version; consent for
--                             one feature never covers the other. The 會議重點
--                             switch (F11) lives in scope_options of the
--                             'ai_review' rows. Members: SELECT own rows only.
--   public.ai_review_usage    Quota ledger: account, Taipei month, status,
--                             token usage, timestamps. Never any content.
--                             Members: no access at all. Deleting a report
--                             never touches it, so quota cannot be refunded.
--   public.ai_review_reports  The saved report: five text sections, numbers,
--                             token usage, consent version, period. Never the
--                             material that was sent to the model.
--                             Members: SELECT and DELETE own rows only.
--
-- Functions (all SECURITY DEFINER, search_path = '', EXECUTE revoked from
-- public / anon / authenticated and granted to service_role only: they are
-- called by Edge Functions AFTER auth.getUser() verified the caller, and act
-- on the explicit p_user. Clients cannot call any of them.)
--   public.record_ai_consent        Append a grant / withdrawal for a feature;
--                                   withdrawing 'ai_review' fails the running
--                                   generation and can delete every report.
--   public.reserve_ai_review        ONE transaction: valid consent + scope
--                                   version, report quota (free 4 / Pro 30 per
--                                   Taipei month), attempt limits (3 per hour;
--                                   12 / 90 per month, failures count), single
--                                   in-flight, site-wide daily cap, then the
--                                   pending ledger row. Nothing may be sent to
--                                   the model before this returns.
--   public.finish_ai_review         Close the pending row: success stores the
--                                   report + token usage; failure only marks
--                                   the row (no report quota used, the attempt
--                                   still counts).
--   public.ai_feature_status        Read-only: consent state for a feature,
--                                   plus this month's quota for 'ai_review'.
--   public.reserve_meeting_import_v3  F12: consent check + the UNCHANGED
--                                   reserve_meeting_import_v2 in one
--                                   transaction. Unused until the
--                                   meeting-import Edge Function switches to
--                                   it (rollout order: design doc section 9).
--   huddle_ops.ai_consent_state / ai_review_quota / ai_review_stale_after
--                                   Internal helpers, not granted to anyone.
--
-- Why SECURITY DEFINER (the meeting-import RPCs are SECURITY INVOKER, see
-- 20260925081959:25-28): Pro must be decided here with huddle_ops.has_pro(),
-- whose EXECUTE was revoked from every API role (20260927120000:44) and was
-- never granted to service_role. Running as the function owner reaches it
-- without touching that grant, and lets the three tables stay closed even to
-- service_role (the service key can only go through these functions).
--
-- "RPC 三件套" as applied to service-role RPCs: (1) revoke public/anon/
-- authenticated; (2) the first statements reject a NULL p_user and suspended
-- or anonymous accounts (auth.uid() is NULL for the service role, so the
-- usual auth.uid() assertion does not apply); (3) search_path = '' with
-- schema-qualified names only.
--
-- Rollback: drop the five public functions, the three huddle_ops helpers, the
-- ai_consents trigger + its function, then ai_review_reports, ai_review_usage
-- and ai_consents (in that order).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Consent log (append-only, multi-feature) ─────────────────────────────
-- id is an identity column on purpose: "current state" is the row with the
-- highest id, which is monotonic under the per-account advisory lock. now()
-- is the transaction start time and can be out of order across sessions.
create table public.ai_consents (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  feature          text not null check (feature in ('ai_review', 'meeting_import')),
  action           text not null check (action in ('granted', 'withdrawn')),
  copy_version     text not null check (copy_version ~ '^[A-Za-z0-9._-]{1,40}$'),  -- wording shown on the consent screen
  locale           text not null check (locale in ('zh-TW', 'en')),                -- language it was shown in
  scope_version    integer not null check (scope_version between 1 and 100000),    -- data scope + recipient + region
  scope_options    jsonb not null default '{}'::jsonb,                             -- per-feature switches inside the scope
  recipient        text not null check (char_length(recipient) between 1 and 80),          -- e.g. 'OpenAI'
  recipient_region text not null check (char_length(recipient_region) between 1 and 40),   -- e.g. 'US'
  platform         text not null check (platform in ('web', 'ios', 'android', 'desktop')),
  app_version      text check (app_version ~ '^[A-Za-z0-9._+-]{1,40}$'),
  created_at       timestamptz not null default now(),
  -- 'ai_review' rows always carry the 會議重點 switch (F11, default off);
  -- 'meeting_import' has no switches.
  constraint ai_consents_scope_options_shape check (
    case feature
      when 'ai_review' then scope_options in ('{"meeting_highlights": false}'::jsonb, '{"meeting_highlights": true}'::jsonb)
      else scope_options = '{}'::jsonb
    end
  )
);
create index ai_consents_user_feature_idx on public.ai_consents(user_id, feature, id desc);

-- Rows are immutable for every role, including the function owner. DELETE is
-- left to the auth.users cascade (account deletion); no role is granted it.
create function public.ai_consents_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'AI_CONSENTS_APPEND_ONLY' using errcode = '42501';
end $$;
revoke all on function public.ai_consents_append_only() from public, anon, authenticated;
create trigger ai_consents_append_only
  before update on public.ai_consents
  for each row execute function public.ai_consents_append_only();

alter table public.ai_consents enable row level security;
create policy ai_consents_read_own on public.ai_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy operations_account_active on public.ai_consents
  as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
-- No INSERT/UPDATE/DELETE for members; nothing at all for the service role
-- (writes go through record_ai_consent only).
revoke all on public.ai_consents from public, anon, authenticated, service_role;
grant select on public.ai_consents to authenticated;

-- ── 2. Quota ledger (no content, no member access) ──────────────────────────
-- id is the request id chosen by the client (uuid); the report row points
-- back at it, so a client that lost the HTTP response can look its report up.
create table public.ai_review_usage (
  id                uuid primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  month             date not null default date_trunc('month', now() at time zone 'Asia/Taipei')::date,
  status            text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  failure_code      text check (failure_code ~ '^[A-Z_]{1,40}$'),   -- fixed code set by the server, never free text
  prompt_tokens     integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz,
  check ((status = 'pending') = (finished_at is null)),
  check (failure_code is null or status = 'failed')
);
create index ai_review_usage_user_month_idx on public.ai_review_usage(user_id, month, status);
create index ai_review_usage_user_created_idx on public.ai_review_usage(user_id, created_at);
create index ai_review_usage_created_idx on public.ai_review_usage(created_at);   -- site-wide daily cap
-- Structural guarantee of "one in-flight generation per account", on top of
-- the advisory lock in reserve_ai_review.
create unique index ai_review_usage_one_pending on public.ai_review_usage(user_id) where status = 'pending';

alter table public.ai_review_usage enable row level security;
-- No member policy and no member grant. The restrictive policy only keeps
-- the suspension invariant true (same reasoning as 20260929180000:51-60).
create policy operations_account_active on public.ai_review_usage
  as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
revoke all on public.ai_review_usage from public, anon, authenticated, service_role;

-- ── 3. Reports (member may read and delete own; never the sent material) ────
create table public.ai_review_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  usage_id          uuid not null unique references public.ai_review_usage(id) on delete cascade,
  consent_id        bigint not null references public.ai_consents(id) on delete cascade,
  scope_version     integer not null,
  period_key        text not null check (period_key in ('this_week', 'last_week', 'this_month', 'last_month')),
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  locale            text not null check (locale in ('zh-TW', 'en')),
  -- The five fixed sections. Upper bounds are the English limits; the Edge
  -- Function applies the (smaller) per-language limits before saving.
  rhythm            text not null check (char_length(rhythm) between 1 and 900),
  done              text not null check (char_length(done) between 1 and 3000),
  time_spent        text not null check (char_length(time_spent) between 1 and 1500),
  pending           text not null check (char_length(pending) between 1 and 2100),
  observation       text not null check (char_length(observation) between 1 and 480),
  stats             jsonb not null check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) <= 2048),  -- numbers computed by code
  prompt_tokens     integer not null check (prompt_tokens >= 0),
  completion_tokens integer not null check (completion_tokens >= 0),
  created_at        timestamptz not null default now(),
  check (period_end > period_start),
  -- Backstop for "remove URLs before saving": the Edge Function strips them;
  -- a report that still carries a scheme, www. or a data: URI is not stored.
  -- Mirrors stripUrls: "www." / "data:" only count at a word start and directly
  -- followed by a non-space, so plain prose such as "your data: 3 items" or
  -- "metadata:" is not rejected (it would fail the report and burn an attempt).
  constraint ai_review_reports_no_urls check (
    concat_ws(' ', rhythm, done, time_spent, pending, observation) !~* '(://|\mwww\.\S|\mdata:\S)'
  )
);
create index ai_review_reports_user_created_idx on public.ai_review_reports(user_id, created_at desc);

alter table public.ai_review_reports enable row level security;
create policy ai_review_reports_read_own on public.ai_review_reports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy ai_review_reports_delete_own on public.ai_review_reports for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy operations_account_active on public.ai_review_reports
  as restrictive for all to authenticated
  using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()));
revoke all on public.ai_review_reports from public, anon, authenticated, service_role;
grant select, delete on public.ai_review_reports to authenticated;

-- ── 4. Internal helpers (huddle_ops; not client- or service-callable) ───────
-- A pending row older than this is treated as failed everywhere. Must stay
-- above the Edge Function wall-clock limit (150 s on the free plan) so a live
-- request can never be swept and then finish anyway.
create function huddle_ops.ai_review_stale_after() returns interval
language sql immutable set search_path = '' as $$ select interval '3 minutes' $$;

-- Current consent state of one feature. "granted" is true only when the
-- newest row is a grant AND it was given for exactly the scope version the
-- caller's code implements (a changed scope always needs a new consent).
-- Deliberately not STABLE: called right after writes in the same transaction.
create function huddle_ops.ai_consent_state(p_user uuid, p_feature text, p_scope_version integer)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'feature', p_feature,
    'required_scope_version', p_scope_version,
    'granted', coalesce(c.action = 'granted' and c.scope_version = p_scope_version, false),
    'needs_reconsent', coalesce(c.action = 'granted' and c.scope_version <> p_scope_version, false),
    'consent_id', case when c.action = 'granted' then c.id end,
    'scope_version', case when c.action = 'granted' then c.scope_version end,
    'copy_version', case when c.action = 'granted' then c.copy_version end,
    'scope_options', case when c.action = 'granted' and c.scope_version = p_scope_version
                          then c.scope_options else '{}'::jsonb end,
    'last_action', c.action,
    'decided_at', c.created_at)
  from (select 1) as one
  left join lateral (
    select a.* from public.ai_consents a
    where a.user_id = p_user and a.feature = p_feature
    order by a.id desc limit 1
  ) c on true
$$;

-- This month's AI review quota for one account. The single source of the
-- limits: reserve_ai_review enforces exactly what this returns in "blocked",
-- ai_feature_status shows it. Pro is decided here, never passed in.
create function huddle_ops.ai_review_quota(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_report_limit_free    constant integer := 4;
  c_report_limit_pro     constant integer := 30;
  c_attempt_limit_free   constant integer := 12;
  c_attempt_limit_pro    constant integer := 90;
  c_hourly_attempt_limit constant integer := 3;
  c_global_daily_limit   constant integer := 200;   -- site-wide reservations per Taipei day
  v_local       timestamp := now() at time zone 'Asia/Taipei';
  v_month       date := date_trunc('month', v_local)::date;
  v_day_start   timestamptz := date_trunc('day', v_local) at time zone 'Asia/Taipei';
  v_reset       date := (date_trunc('month', v_local) + interval '1 month')::date;
  v_pro         boolean := huddle_ops.has_pro(p_user);
  v_report_limit  integer := case when v_pro then c_report_limit_pro else c_report_limit_free end;
  v_attempt_limit integer := case when v_pro then c_attempt_limit_pro else c_attempt_limit_free end;
  v_reports integer; v_attempts integer; v_hourly integer; v_hour_first timestamptz;
  v_global integer; v_pending boolean; v_blocked text;
begin
  select count(*) filter (where u.status = 'succeeded'), count(*)
    into v_reports, v_attempts
    from public.ai_review_usage u where u.user_id = p_user and u.month = v_month;
  select count(*), min(u.created_at) into v_hourly, v_hour_first
    from public.ai_review_usage u where u.user_id = p_user and u.created_at > now() - interval '1 hour';
  select exists(select 1 from public.ai_review_usage u
                where u.user_id = p_user and u.status = 'pending'
                  and u.created_at >= now() - huddle_ops.ai_review_stale_after()) into v_pending;
  select count(*) into v_global from public.ai_review_usage u where u.created_at >= v_day_start;
  v_blocked := case
    when v_pending then 'IN_PROGRESS'
    when v_reports >= v_report_limit then 'MONTHLY_LIMIT'
    when v_hourly >= c_hourly_attempt_limit then 'RATE_LIMIT'
    when v_attempts >= v_attempt_limit then 'ATTEMPT_LIMIT'
    when v_global >= c_global_daily_limit then 'GLOBAL_DAILY_LIMIT'
  end;
  return jsonb_build_object(
    'month', v_month,
    'is_pro', v_pro,
    'report_limit', v_report_limit,
    'reports_used', v_reports,
    'reports_remaining', greatest(v_report_limit - v_reports - (case when v_pending then 1 else 0 end), 0),
    'attempt_limit', v_attempt_limit,
    'attempts_used', v_attempts,
    'hourly_attempt_limit', c_hourly_attempt_limit,
    'hourly_attempts_used', v_hourly,
    'hourly_retry_at', case when v_hourly >= c_hourly_attempt_limit then v_hour_first + interval '1 hour' end,
    'in_progress', v_pending,
    'resets_on', v_reset,
    'resets_at', v_reset::timestamp at time zone 'Asia/Taipei',
    'blocked', v_blocked);
end $$;

revoke all on function huddle_ops.ai_review_stale_after(),
  huddle_ops.ai_consent_state(uuid, text, integer),
  huddle_ops.ai_review_quota(uuid) from public, anon, authenticated;

-- ── 5. record_ai_consent ────────────────────────────────────────────────────
-- Appends the decision for one feature. Idempotent: repeating the current
-- state adds no row. A grant with a new scope version, copy version or
-- switch value is a new row (the newest one wins). Withdrawing 'ai_review'
-- also fails the running generation so its report is never saved, and with
-- p_delete_reports removes every report of the account in the same
-- transaction. Withdrawing never changes the quota ledger.
-- Takes the same per-account advisory lock as the feature's reservation
-- function, so "withdraw" and "reserve" are serialized.
create function public.record_ai_consent(
  p_user uuid, p_feature text, p_action text, p_copy_version text, p_locale text,
  p_scope_version integer, p_scope_options jsonb, p_recipient text, p_recipient_region text,
  p_platform text, p_app_version text, p_delete_reports boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_last public.ai_consents; v_options jsonb; v_recorded boolean := false; v_deleted integer := 0;
begin
  if p_user is null or not huddle_ops.access_allowed(p_user) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if exists(select 1 from auth.users u where u.id = p_user and coalesce(u.is_anonymous, false)) then
    raise exception 'ANONYMOUS_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_feature is null or p_feature not in ('ai_review', 'meeting_import')
     or p_action is null or p_action not in ('granted', 'withdrawn') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- The only switch today: 會議重點 for 'ai_review'; always off once withdrawn.
  v_options := case when p_feature = 'ai_review'
    then jsonb_build_object('meeting_highlights',
           p_action = 'granted' and coalesce(p_scope_options -> 'meeting_highlights' = 'true'::jsonb, false))
    else '{}'::jsonb end;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text,
    case p_feature when 'meeting_import' then 726 else 731 end));
  select * into v_last from public.ai_consents c
    where c.user_id = p_user and c.feature = p_feature order by c.id desc limit 1;

  if p_action = 'granted' then
    if v_last.id is null or v_last.action <> 'granted' or v_last.scope_version <> p_scope_version
       or v_last.scope_options <> v_options or v_last.copy_version <> p_copy_version then
      v_recorded := true;
    end if;
  elsif v_last.action = 'granted' then
    v_recorded := true;
  end if;
  if v_recorded then
    insert into public.ai_consents(user_id, feature, action, copy_version, locale, scope_version,
      scope_options, recipient, recipient_region, platform, app_version)
    values(p_user, p_feature, p_action, p_copy_version, p_locale, p_scope_version,
      v_options, p_recipient, p_recipient_region, p_platform, p_app_version);
  end if;

  if p_action = 'withdrawn' and p_feature = 'ai_review' then
    update public.ai_review_usage u
       set status = 'failed', failure_code = 'CONSENT_WITHDRAWN', finished_at = now()
     where u.user_id = p_user and u.status = 'pending';
    if coalesce(p_delete_reports, false) then
      delete from public.ai_review_reports r where r.user_id = p_user;
      get diagnostics v_deleted = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'recorded', v_recorded,
    'deleted_reports', v_deleted,
    'consent', huddle_ops.ai_consent_state(p_user, p_feature, p_scope_version));
end $$;

-- ── 6. reserve_ai_review ────────────────────────────────────────────────────
-- The gate in front of the model call. Everything below happens in ONE
-- transaction under the per-account lock: sweep timed-out rows, check the
-- consent and its scope version, check the quota, insert the pending row.
-- Raises (message is the code): ACCOUNT_SUSPENDED, ANONYMOUS_NOT_ALLOWED,
-- INVALID_INPUT, DUPLICATE_REQUEST, CONSENT_REQUIRED, IN_PROGRESS,
-- MONTHLY_LIMIT, RATE_LIMIT, ATTEMPT_LIMIT, GLOBAL_DAILY_LIMIT.
-- Lock order is always account (731) then site-wide; nothing takes them in
-- the other order.
create function public.reserve_ai_review(p_user uuid, p_request_id uuid, p_scope_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_consent jsonb; v_quota jsonb;
begin
  if p_user is null or not huddle_ops.access_allowed(p_user) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if exists(select 1 from auth.users u where u.id = p_user and coalesce(u.is_anonymous, false)) then
    raise exception 'ANONYMOUS_NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_request_id is null or p_scope_version is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 731));
  -- A request that never finished (crashed function, lost connection) becomes
  -- a failed attempt: no report quota used, the attempt still counts.
  update public.ai_review_usage u
     set status = 'failed', failure_code = 'STALE', finished_at = now()
   where u.user_id = p_user and u.status = 'pending'
     and u.created_at < now() - huddle_ops.ai_review_stale_after();
  -- Request ids are single-use (also hides whether another account used it).
  if exists(select 1 from public.ai_review_usage u where u.id = p_request_id) then
    raise exception 'DUPLICATE_REQUEST';
  end if;

  v_consent := huddle_ops.ai_consent_state(p_user, 'ai_review', p_scope_version);
  if not (v_consent ->> 'granted')::boolean then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_review_global', 731));
  v_quota := huddle_ops.ai_review_quota(p_user);
  if v_quota ->> 'blocked' is not null then
    raise exception '%', v_quota ->> 'blocked';
  end if;

  insert into public.ai_review_usage(id, user_id, month)
  values(p_request_id, p_user, (v_quota ->> 'month')::date);
  return jsonb_build_object(
    'usage_id', p_request_id,
    'consent_id', (v_consent ->> 'consent_id')::bigint,
    'scope_version', p_scope_version,
    'scope_options', v_consent -> 'scope_options',
    'is_pro', (v_quota ->> 'is_pro')::boolean);
end $$;

-- ── 7. finish_ai_review ─────────────────────────────────────────────────────
-- Closes the pending row of p_request_id.
--   p_report NULL      -> 'failed' with p_failure_code (default 'UNKNOWN').
--   p_report not NULL  -> 'succeeded' and the report row is inserted in the
--                         same transaction. Keys: consent_id, period_key,
--                         period_start, period_end, locale, rhythm, done,
--                         time_spent, pending, observation, stats (flat object
--                         of numbers only).
-- Token counts are stored in both cases when known.
-- Raises REQUEST_EXPIRED when the row is no longer pending (swept as stale,
-- or the consent was withdrawn meanwhile): the caller must not show or keep
-- that result. Raises INVALID_REPORT for a malformed p_report; a constraint
-- violation on the report row aborts the whole call, the row stays pending
-- and the caller closes it with a failure code.
create function public.finish_ai_review(
  p_user uuid, p_request_id uuid, p_report jsonb, p_failure_code text,
  p_prompt_tokens integer, p_completion_tokens integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usage public.ai_review_usage; v_consent public.ai_consents; v_report public.ai_review_reports;
begin
  if p_user is null or not huddle_ops.access_allowed(p_user) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 731));
  update public.ai_review_usage u
     set status = case when p_report is null then 'failed' else 'succeeded' end,
         failure_code = case when p_report is null then coalesce(p_failure_code, 'UNKNOWN') end,
         prompt_tokens = p_prompt_tokens,
         completion_tokens = p_completion_tokens,
         finished_at = now()
   where u.id = p_request_id and u.user_id = p_user and u.status = 'pending'
   returning * into v_usage;
  if not found then raise exception 'REQUEST_EXPIRED'; end if;
  if p_report is null then
    return jsonb_build_object('status', 'failed');
  end if;

  select * into v_consent from public.ai_consents c
   where c.id = (p_report ->> 'consent_id')::bigint and c.user_id = p_user
     and c.feature = 'ai_review' and c.action = 'granted';
  if not found
     or jsonb_typeof(p_report -> 'stats') is distinct from 'object'
     or exists(select 1 from jsonb_each(p_report -> 'stats') e where jsonb_typeof(e.value) <> 'number') then
    raise exception 'INVALID_REPORT' using errcode = '22023';
  end if;

  insert into public.ai_review_reports(user_id, usage_id, consent_id, scope_version, period_key,
    period_start, period_end, locale, rhythm, done, time_spent, pending, observation, stats,
    prompt_tokens, completion_tokens)
  values(p_user, v_usage.id, v_consent.id, v_consent.scope_version, p_report ->> 'period_key',
    (p_report ->> 'period_start')::timestamptz, (p_report ->> 'period_end')::timestamptz,
    p_report ->> 'locale', p_report ->> 'rhythm', p_report ->> 'done', p_report ->> 'time_spent',
    p_report ->> 'pending', p_report ->> 'observation', p_report -> 'stats',
    coalesce(p_prompt_tokens, 0), coalesce(p_completion_tokens, 0))
  returning * into v_report;
  return jsonb_build_object('status', 'succeeded', 'report', to_jsonb(v_report) - 'user_id');
end $$;

-- ── 8. ai_feature_status ────────────────────────────────────────────────────
-- Read-only. consent: state of p_feature for p_scope_version. quota: this
-- Taipei month's numbers for 'ai_review' (remaining reports, whether the Pro
-- limits apply, reset date, attempts, in-flight, "blocked" code); NULL for
-- 'meeting_import', whose quota stays in its own pipeline.
create function public.ai_feature_status(p_user uuid, p_feature text, p_scope_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or not huddle_ops.access_allowed(p_user) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if p_feature is null or p_feature not in ('ai_review', 'meeting_import') or p_scope_version is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'feature', p_feature,
    'consent', huddle_ops.ai_consent_state(p_user, p_feature, p_scope_version),
    'quota', case when p_feature = 'ai_review' then huddle_ops.ai_review_quota(p_user) end);
end $$;

-- ── 9. reserve_meeting_import_v3 (F12) ──────────────────────────────────────
-- Consent for 'meeting_import' and the existing reservation in one
-- transaction, without changing reserve_meeting_import / _v2 (same wrapping
-- pattern as 20260925083539:32-44). It takes the same advisory lock as v2
-- (re-entrant inside one transaction) and as record_ai_consent for
-- 'meeting_import', so a withdrawal and a reservation cannot interleave.
-- A request id that already exists is passed straight through: v1 answers
-- those from the stored row and never reaches the model, so history stays
-- readable after a withdrawal. Raises CONSENT_REQUIRED, plus everything v2
-- raises (MONTHLY_LIMIT, RATE_LIMIT, REQUEST_CONFLICT, ACCOUNT_SUSPENDED).
create function public.reserve_meeting_import_v3(
  p_user uuid, p_id uuid, p_title text, p_date date, p_transcript text, p_context jsonb,
  p_scope_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or not huddle_ops.access_allowed(p_user) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 726));
  if not exists(select 1 from public.meeting_imports m where m.id = p_id)
     and not coalesce((huddle_ops.ai_consent_state(p_user, 'meeting_import', p_scope_version) ->> 'granted')::boolean, false) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  return public.reserve_meeting_import_v2(p_user, p_id, p_title, p_date, p_transcript, p_context);
end $$;

-- ── 10. Execute privileges: Edge Functions (service role) only ──────────────
revoke all on function public.record_ai_consent(uuid, text, text, text, text, integer, jsonb, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.reserve_ai_review(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_review(uuid, uuid, jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public.ai_feature_status(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.reserve_meeting_import_v3(uuid, uuid, text, date, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.record_ai_consent(uuid, text, text, text, text, integer, jsonb, text, text, text, text, boolean) to service_role;
grant execute on function public.reserve_ai_review(uuid, uuid, integer) to service_role;
grant execute on function public.finish_ai_review(uuid, uuid, jsonb, text, integer, integer) to service_role;
grant execute on function public.ai_feature_status(uuid, text, integer) to service_role;
grant execute on function public.reserve_meeting_import_v3(uuid, uuid, text, date, text, jsonb, integer) to service_role;
