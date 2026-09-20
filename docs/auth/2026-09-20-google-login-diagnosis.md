# Google login diagnosis and recovery changes

Status: local implementation and controlled tests. The user's exact failing
screen/platform has not yet been confirmed. Do not describe this as a verified
fix for the user's live Google account.

## Findings

- The only application `onAuthStateChange` callback is in AuthProvider and is
  synchronous state updates. It does not await another Supabase operation. No
  application-level async subscriber deadlock was found.
- The original web callback enabled SDK URL detection and also manually called
  `exchangeCodeForSession`, with a fallback to any stored session. PKCE codes are
  single-use. That duplicated ownership and hid failed exchanges; it was not
  evidence that every login fails or that it explains the reported incident.
- The original callback had no timeout or recovery UI. A stalled token request
  could therefore leave the callback spinner indefinitely. A controlled real
  browser/SDK test reproduces the stalled-request condition.
- Read-only inspection of this Mac's Spotlight and LaunchServices found the
  original repo's mac/ and mac-arm64/ Huddle bundles at version 0.1.0, without
  CFBundleURLTypes. No huddle-desktop scheme binding was found. This is evidence
  about this Mac's indexed/registered artifacts, not proof which copy the user
  launched. Version 0.1.0 cannot implement the new desktop callback protocol.

## Changes

`/auth/callback` now disables SDK auto-detection and owns a deduplicated one-use
PKCE exchange. Failed exchange no longer silently authenticates using a prior
session. Cancellation/invalid codes display recovery guidance. After 20 seconds,
a stalled callback exposes a regular `/login` anchor. Its full document reload
releases the old in-memory client, pending callbacks and document-owned locks;
a Next Link would preserve the stalled auth singleton.

Other routes retain SDK URL detection. Desktop state/PKCE/protocol restrictions
are unchanged. Mobile Capacitor continues using detectSessionInUrl=false and its
native appUrlOpen handler. This change does not replace that mobile handler.

## Singleton / SPA review

The installed GoTrueClient captures window.location during constructor-triggered
`initialize()`. `initializePromise` is reused, and there are no popstate/hashchange
listeners that re-run URL detection. A client first created on `/login` with
URL detection enabled does not auto-consume a code during later SPA navigation
to `/auth/callback`; the explicit callback exchange owns that case. Normal browser
OAuth and desktop main-process callback navigation load a fresh document, where
the callback-specific detectSessionInUrl=false applies at construction.

## Verification and limits

Run `E2E_BASE_URL=http://localhost:3190 node scripts/e2e/web-oauth-callback-verify.mjs`.
The test uses actual Chromium and the installed Supabase SDK, with all Supabase
HTTP traffic mocked. It covers successful single exchange, failure, 20-second
stall recovery, a new document after recovery with an enabled Google button,
provider cancellation and an external desktop callback that never exchanges code.

No Google consent was performed, no real session or user data was changed, and no
OS protocol handler was registered. Live investigation still needs the user's
failing screen/URL and, for desktop, the actual running app version. Independent
Google/provider, network and OS protocol failures remain outside these tests.

References:
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Installed @supabase/auth-js GoTrueClient.ts: initialize, _initialize,
  exchangeCodeForSession and _getSessionFromURL.
