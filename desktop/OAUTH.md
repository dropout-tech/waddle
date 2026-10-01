# Desktop OAuth

The packaged app must register `huddle-desktop` using electron-builder `build.protocols`.
The desktop callback is:

`https://huddle.lazy72.com/auth/callback?desktop=1&desktop_state=*`

Production origin moved from `https://waddle.zeabur.app` to `https://huddle.lazy72.com`
(2026-10-01). Both domains stay live: installed older desktop builds hard-code the old
origin and only allow that origin, so the old domain must NOT be shut down or redirected.
New builds use the new origin (`PRODUCTION_URL` in `desktop/main.cjs`, same value as
`SITE_ORIGIN` in `lib/site.ts`). The Supabase Auth redirect allowlist must contain the
callback of BOTH origins (dashboard-only; not verifiable from code).

The check below was done on 2026-09-20 for the OLD origin only; the new origin still
needs the same check (see the release checklist at the end of this file).

Verified on 2026-09-20 against the production Supabase Auth endpoint using a
synthetic OAuth cancellation (no Google request, no login, no token exchange):
`/authorize` followed by `/callback?state=...&error=access_denied` returned HTTP 302
to the exact production callback with both `desktop=1` and `desktop_state`
retained. Current production configuration therefore needs no allowlist change.
If the production app origin changes, verify the new origin before release;
keep existing web and Capacitor redirects intact. The external browser
callback only offers an explicit Open Huddle link. It does not exchange codes.
The desktop process checks a 256-bit state, five-minute deadline, callback shape,
and removes its pending record before navigation. The renderer checks its own
pending state and exchanges the one-use code with its locally stored PKCE verifier.
No access/refresh tokens are put into links or the pending state file.

The verifier uses the existing Electron Chromium profile/cookie storage, so the
same installed app can resume after a restart. A callback with no pending login
is ignored. Starting a new login invalidates the prior one. The login page offers
cancel/retry and a five-minute timeout. macOS open-url, cold launch and Windows
second-instance handlers all share the same validation.

Run `node --test desktop/*.test.cjs` from repo root. Tests mock external opening
and session exchange, and cover state rejection, replay, expired/cancelled login,
restart, wrong host, token injection and duplicate React callback mounts.
They do not prove Google consent or OS protocol registration on a signed build.
For release smoke testing, initiate Google login from the newly installed app,
complete consent in the system browser, click Open Huddle, and verify signed-in
state survives quitting/reopening. Also try cancel/retry and cold callback launch.

References:
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/redirect-urls
- https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app
- https://www.electronjs.org/docs/latest/tutorial/security

Runtime verification: `E2E_BASE_URL=http://localhost:3186 node scripts/e2e/desktop-oauth-runtime-verify.mjs`
launches actual Electron with a temporary profile and stubbed OS protocol registration.
All Supabase traffic is intercepted. Eight checks cover real preload IPC/external
opening, PKCE exchange with the original verifier, signed-in rendering, replay
rejection, floating panels, child IPC rejection, and a second real process resuming
a cold callback using the persisted PKCE verifier. This still does not represent
Google consent or installation-time OS protocol registration verification.

Release checklist for the origin change (needs production access; not done from code):
1. Supabase Auth redirect allowlist contains `https://huddle.lazy72.com/auth/callback?desktop=1&desktop_state=*`
   and keeps the old `https://waddle.zeabur.app/...` entry. Re-run the synthetic
   `access_denied` check above against the new origin; expect HTTP 302 to the exact new
   callback with `desktop=1` and `desktop_state` retained.
2. Smoke test a build packaged with the new `PRODUCTION_URL`: Google login, Open Huddle,
   sign-in survives quit/reopen. An installed OLD build must still sign in via the old origin.
3. The two origins have separate cookie / localStorage storage: a session in the old
   desktop build is not shared with the new origin (users sign in once on the new build).
