-- Suspended accounts must be blocked on every RLS table, including tables added
-- after 20260926120000 (e.g. sticky_notes from 20260926160000). Re-run the same
-- idempotent sweep: any RLS-enabled public table without the restrictive
-- operations_account_active policy gets it.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='operations_account_active') loop
    execute format('create policy operations_account_active on public.%I as restrictive for all to authenticated using ((select huddle_ops.access_allowed())) with check ((select huddle_ops.access_allowed()))',t.relname);
  end loop;
end $$;
