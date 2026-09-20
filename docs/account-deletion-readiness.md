# Account deletion readiness

2026-09-21, local changes only. `delete-account` validates caller JWT with server `getUser`, ignores client identity, recursively lists only `notebook-images/<verified user UUID>/`, snapshots pages before removing to avoid offset skips, and deletes the auth user last. Image paths are used by notebook, whiteboard and task-detail uploads. Other buckets and other users' prefixes are never removed. Storage errors, unsafe names and detected concurrent uploads stop auth deletion; retry continues remaining cleanup. Partial image deletion is irreversible even if later auth deletion fails. Extremely large namespaces fail safely at explicit capacity limits instead of claiming complete deletion.

Google Calendar refresh token revocation is best effort before deleting the auth user; local encrypted credentials cascade with the user. The external Google calendar itself is preserved. A failed remote revoke does not imply success; response has `google_revoked:false`. No provider errors/tokens are logged or returned.

Apple-linked accounts currently return `409 apple_reauthorization_required` before any destruction. Existing system does not retain the Apple refresh token or perform fresh native Apple authorization/token revocation. This is an explicit launch blocker for Apple deletion; do not claim App Store deletion compliance until reauthorization/revocation UI is implemented and tested. Existing deletion button safely displays an error and leaves the account signed in, but should be extended with a specific localized reauthorization action.

A service-only deletion marker now denies notebook-image INSERT/UPDATE through restrictive RLS before cleanup. The guard checks the verified auth UID and existing auth user, so an old JWT cannot insert after auth deletion cascades the marker. Row locks coordinate uploads already authorized when deletion begins. This guards storage writes, not all application tables. Already issued JWT lifetime and cached public-image URLs also need to be considered in the release verification. Subscription cancellation is separate from deleting Huddle data; do not promise automatic store cancellation.

Verified with `node --test scripts/tests/delete-account.test.mjs`: real handler under mocked SDK, missing/invalid JWT, exact user prefix, capped pagination/nested folders, traversal rejection, storage errors, Apple precondition, Google ordering, auth errors and auth deletion last. No remote accounts or files touched.


## Deployment order and retry

Apply `20260920184344_account_deletion_write_guard.sql` **before** deploying the updated delete function. `begin_account_deletion` is service-only; a missing RPC fails closed before cleanup. The marker persists if cleanup fails, preventing further image changes while allowing authenticated deletion retries. Apple reauthorization is checked before marking. Marker cannot be removed by the client; support recovery requires explicit review if the user abandons deletion.

`bash scripts/tests/deletion-database.sh` verifies actual restrictive PostgreSQL policies: normal own upload allowed, marking blocks insert/update, stale JWT cannot insert after auth deletion, and client cannot mark an account. The marker RPC locks the auth row FOR UPDATE; policy checks lock it FOR KEY SHARE so in-flight authorized Storage transactions finish before cleanup starts. Ten mocked handler scenarios verify the marker is required before destructive steps.
