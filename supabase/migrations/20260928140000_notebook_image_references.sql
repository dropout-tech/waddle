-- Orphaned image cleanup support for the `notebook-images` bucket.
--
-- The cleanup-images Edge Function lists a caller's objects ({user_id}/...)
-- and asks this function which of them are still referenced anywhere. Only
-- the unreferenced, older-than-24h objects get deleted.
--
-- Why a full-row scan of every table instead of a column list: an image
-- uploaded by one user can live in a row owned by someone else (an assignee
-- adds an image to the assigner's task notes), and URLs can be copy-pasted
-- into any rich-text field (notes ↔ tasks ↔ whiteboard ↔ sticky notes). A
-- false "not referenced" deletes a user's image for good, so this errs on
-- the side of keeping: every ordinary table in public/huddle_ops is scanned,
-- including archived rows and backup tables, and new tables are covered
-- automatically. Any error aborts the whole call (the caller then deletes
-- nothing).
--
-- Keys are '{owner_uuid}/{object_uuid}' — the object name WITHOUT its
-- extension — so a URL-encoded or odd extension can never cause a miss.
--
-- Cost: one sequential scan per table per call. The Edge Function only calls
-- this when the caller has >24h-old objects, at most ~once a day per user.
-- If tables grow large, add a pg_trgm index or switch to a reference table.

create or replace function public.notebook_image_references(p_owner uuid, p_keys text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefix text;
  pending text[];
  found text[] := '{}';
  hits text[];
  rel record;
begin
  if p_owner is null or p_keys is null then
    raise exception 'owner and keys are required';
  end if;
  prefix := p_owner::text || '/';

  -- Only keys inside the owner's own folder are ever considered.
  select coalesce(array_agg(distinct k), '{}') into pending
    from unnest(p_keys) as k
   where left(k, length(prefix)) = prefix and length(k) > length(prefix);

  for rel in
    select n.nspname, c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname in ('public', 'huddle_ops')
     order by n.nspname, c.relname
  loop
    exit when cardinality(pending) = 0;
    -- One scan per table: keep only rows mentioning the owner's folder, then
    -- match each pending key against that (small) set.
    execute format(
      'with docs as materialized (
         select s.b from (select to_jsonb(t)::text as b from %I.%I as t) as s
          where strpos(s.b, $2) > 0
       )
       select coalesce(array_agg(k), ''{}'') from unnest($1::text[]) as k
        where exists (select 1 from docs where strpos(docs.b, k) > 0)',
      rel.nspname, rel.relname)
      into hits
      using pending, prefix;
    if cardinality(hits) > 0 then
      found := found || hits;
      pending := array(select k from unnest(pending) as k where k <> all(hits));
    end if;
  end loop;

  return found;
end;
$$;

revoke all on function public.notebook_image_references(uuid, text[]) from public, anon, authenticated;
grant execute on function public.notebook_image_references(uuid, text[]) to service_role;

comment on function public.notebook_image_references(uuid, text[]) is
  'Service-role only. Returns the subset of {owner}/{object_uuid} keys that appear anywhere in public/huddle_ops table rows (any owner). Used by the cleanup-images Edge Function.';
