-- Suspended accounts must be blocked on every RLS table. sticky_note_folders
-- (20260929120000) was created after the last sweep (20260927110000) and never
-- got the restrictive operations_account_active policy, so a suspended account
-- could still read/write its folder names. Re-run the same idempotent sweep;
-- on production (checked 2026-10-02) sticky_note_folders is the only table it
-- touches. New RLS tables should add the policy in their own migration, as
-- 20260929180000_google_calendar_read does.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active') loop
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t.relname);
  end loop;
end $$;
