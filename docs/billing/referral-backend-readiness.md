# Billing reconciliation and referral foundation

2026-09-21. Local implementation; production settings unchanged.

## Contracts

- `POST /functions/v1/billing-reconcile`, authenticated Supabase JWT. Request body ignored. Fetches RevenueCat for the verified user, applies the existing production recurring entitlement snapshot atomically. Returns `{synced:true}` only after database success; UI must then refetch the entitlement. Never grants Pro based on SDK or client dates. CORS supports native/web clients.
- `get_my_referral()` requires a verified non-anonymous account and returns `{code,campaign_enabled,rewards:[{id,months,status,created_at}],has_redeemed}`. Only the caller's reward records are exposed; no other user's email or identifier is returned.
- `redeem_referral({p_code})` returns `{status:'pending_store_redemption',referral_id}`. Invalid attempts do not consume eligibility. Exact same relationship is idempotent. Campaign lock serializes caps, cycles and concurrent attempts.
- Errors: `campaign_unavailable`, `verified_account_required`, `invalid_referral_code`, `already_redeemed`, `new_account_required`, `referral_cycle`, `referral_limit_reached`.
- Native package descriptors now include store title and monthly/annual/other period, alongside the actual localized store price. Unknown periods must not be marketed as a supported monthly/yearly subscription.

## Safety and launch state

`launch` campaign is disabled. Double-sided three-calendar-month rewards are reserved only; no entitlement expiry is modified. New invitee must have verified email identity, non-anonymous account, registration after campaign start and within 14 days. A beneficiary cannot refer themselves or form a referral cycle. Maximum four successful invitees per referrer. Direct client table access and all client reward writes denied; private definer RPC checks `auth.uid()`, fixed empty search path.

Remaining before enabling: official store offer allocation/redemption and transaction correlation, rewards audit/reversal events, deletion/re-registration abuse policy and retention, rate limiting, user terms and campaign dates. No store code issuance or active reward is implemented. Keep disabled until these are complete; do not represent pending months as active Pro.

Reconciliation complements the existing webhook after purchase/restore. A scheduled reconciliation worker is implemented below; deployment, scheduler activation and monitoring still remain. Production recurring-only snapshot deliberately does not support sandbox or nonrecurring promotional offers; test those with an isolated staging policy before launch. All existing required RevenueCat server settings apply. `billing-reconcile` requires Supabase user authentication unlike external webhook.

Paid quota enforcement and legacy preservation are separate release gates; these functions do not implement shared-calendar or meeting plan limits.

## Verification

- `node --experimental-strip-types --test scripts/tests/billing-*.test.mjs`: 20 tests, includes identity spoofing, no fake grant, config/auth/database/provider failures, CORS, native period/price mapping and existing webhook behavior.
- `bash scripts/tests/billing-database.sh`: isolated PostgreSQL billing/RLS tests.
- `bash scripts/tests/referral-database.sh`: isolated PostgreSQL migration and actual-role tests for disabled/expired campaigns, normalized code, retry dedup, self/cycle rejection, account verification/newness, cap, own-only data and pending-only grants.
- TypeScript: `pnpm exec tsc --noEmit`.
- Official Supabase changelog and RLS docs checked; no relevant breaking change. New tables explicitly revoke client grants. Automated Supabase advisors require a supported database connection; manual role checks do not substitute for production/staging advisors.

Sources: https://supabase.com/changelog.md ; https://supabase.com/docs/guides/database/postgres/row-level-security

## Scheduled reconciliation (implemented locally)

`billing-reconcile-scheduled` is a cron-secret-only POST endpoint. Set `BILLING_CRON_AUTHORIZATION` to a random complete Authorization header of at least 32 characters, stored only in server/Vault settings. Deploy with gateway JWT verification disabled because this endpoint verifies its own cron secret; no browser CORS or public account enumeration. Reuses RevenueCat production-only authoritative snapshots. Returns aggregate processed/succeeded/failed counts only, 503 for failures so monitoring can alert.

Apply migration `20260920182638_billing_reconciliation_queue.sql`. Existing entitlement users are seeded; a trigger queues first authoritative snapshots. Each run claims at most 10 due records with `FOR UPDATE SKIP LOCKED`, a unique lease and three-minute expiry. Work is parallel and each network call has a ten-second deadline. Success schedules six hours later; failures use bounded exponential delay, up to one hour. A crashed worker is recovered by lease expiration. A stale worker cannot finish a newer lease. Snapshot event IDs use the lease UUID, retaining transactional deduplication.

Suggested scheduler cadence: one minute (configure in staging/production only after secrets and monitoring exist; no cron was activated). Capacity is 600 records/hour and must be increased with measured user volume. Monitor queue oldest due time, last successful reconciliation, and failures. First purchases lost by both webhook and client reconciliation are not discoverable from the local entitlement queue; provider webhook replay and purchase support remain necessary. The worker does not scan or enumerate all private auth accounts.

Additional checks: `node --experimental-strip-types --test scripts/tests/billing-scheduled.test.mjs` and `bash scripts/tests/billing-queue-database.sh` cover cron auth, aggregate responses, provider/DB failures, seeded and triggered jobs, lease exclusion, stale lease protection, retry timing, success scheduling and denied client access.
