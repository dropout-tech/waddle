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

Reconciliation complements the existing webhook after purchase/restore. A scheduled full reconciliation worker and monitoring still remain. Production recurring-only snapshot deliberately does not support sandbox or nonrecurring promotional offers; test those with an isolated staging policy before launch. All existing required RevenueCat server settings apply. `billing-reconcile` requires Supabase user authentication unlike external webhook.

Paid quota enforcement and legacy preservation are separate release gates; these functions do not implement shared-calendar or meeting plan limits.

## Verification

- `node --experimental-strip-types --test scripts/tests/billing-*.test.mjs`: 20 tests, includes identity spoofing, no fake grant, config/auth/database/provider failures, CORS, native period/price mapping and existing webhook behavior.
- `bash scripts/tests/billing-database.sh`: isolated PostgreSQL billing/RLS tests.
- `bash scripts/tests/referral-database.sh`: isolated PostgreSQL migration and actual-role tests for disabled/expired campaigns, normalized code, retry dedup, self/cycle rejection, account verification/newness, cap, own-only data and pending-only grants.
- TypeScript: `pnpm exec tsc --noEmit`.
- Official Supabase changelog and RLS docs checked; no relevant breaking change. New tables explicitly revoke client grants. Automated Supabase advisors require a supported database connection; manual role checks do not substitute for production/staging advisors.

Sources: https://supabase.com/changelog.md ; https://supabase.com/docs/guides/database/postgres/row-level-security
