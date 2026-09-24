\ir billing-database.sql
\ir ../../supabase/migrations/20260920182638_billing_reconciliation_queue.sql
set role service_role;
do $$declare jobs jsonb; old_lease uuid; begin
 jobs:=public.claim_billing_reconciliation();
 if jsonb_array_length(jobs)<>1 then raise exception 'seed missing'; end if;
 if public.claim_billing_reconciliation()<>'[]'::jsonb then raise exception 'lease overlap'; end if;
 old_lease:=(jobs->0->>'lease_id')::uuid;
 perform public.finish_billing_reconciliation((jobs->0->>'user_id')::uuid,gen_random_uuid(),true);
 if not exists(select 1 from public.billing_reconciliation_queue where lease_id=old_lease) then raise exception 'stale lease overwrote'; end if;
 perform public.finish_billing_reconciliation((jobs->0->>'user_id')::uuid,old_lease,false);
 if not exists(select 1 from public.billing_reconciliation_queue where failures=1 and next_attempt_at>now() and lease_id is null) then raise exception 'failure retry'; end if;
 update public.billing_reconciliation_queue set next_attempt_at=now()-interval '1 minute';
 jobs:=public.claim_billing_reconciliation();
 perform public.finish_billing_reconciliation((jobs->0->>'user_id')::uuid,(jobs->0->>'lease_id')::uuid,true);
 if not exists(select 1 from public.billing_reconciliation_queue where failures=0 and last_success_at is not null and next_attempt_at>now()+interval '5 hours') then raise exception 'success schedule'; end if;
 perform public.apply_billing_snapshot('queue-new','[{"user_id":"a33d985b-4bcb-456f-9658-9cc1085185ab","expires_at":null,"observed_at_ms":500}]');
 if (select count(*) from public.billing_reconciliation_queue)<>2 then raise exception 'trigger missing'; end if;
end$$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.claim_billing_reconciliation()','EXECUTE') or has_table_privilege('authenticated','public.billing_reconciliation_queue','SELECT') then raise exception 'client access'; end if;
end$$;
