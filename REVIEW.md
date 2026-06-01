---
reviewed: 2026-05-27T12:38:51Z
base: 80e3463 (working tree — uncommitted)
head: 80e34637d362697ef05e567d4b4e81f1213e000c
files_reviewed_list:
  - app/(auth)/layout.tsx
  - app/(auth)/login/page.tsx
  - app/(auth)/signup/page.tsx
  - app/auth/callback/page.tsx
  - app/globals.css
  - app/layout.tsx
  - app/manifest.ts
  - app/page.tsx
  - capacitor.config.ts
  - components/auth/auth-guard.tsx
  - components/auth/auth-provider.tsx
  - components/auth/deep-link-handler.tsx
  - components/auth/delete-account-button.tsx
  - components/auth/redirect-if-authed.tsx
  - components/calendar/calendar-export-modal.tsx
  - components/calendar/calendar-export-view.tsx
  - components/modals/report-modal.tsx
  - components/modals/settings-modal.tsx
  - components/modals/water-reminder-modal.tsx
  - components/native/native-shell.tsx
  - components/onboarding-tour.tsx
  - components/task-panel/panel-header.tsx
  - components/user-menu.tsx
  - hooks/use-meeting-reminders.ts
  - lib/auth/oauth.ts
  - lib/native-config.ts
  - lib/notifications/index.ts
  - lib/platform.ts
  - lib/share.ts
  - lib/supabase/capacitor-storage.ts
  - lib/supabase/client.ts
  - next.config.mjs
  - package.json
  - supabase/functions/delete-account/index.ts
  - tsconfig.json
findings:
  critical: 0
  warning: 2
  total: 2
status: issues_found
---

# Code Review

**Status:** issues_found — 2 findings (0 critical, 2 warning).

**Files reviewed:** 35 source files (changes uncommitted; reviewed `git diff HEAD`)
**Diff range:** working tree vs `80e3463`
**Intent:** Add iOS/Capacitor native support to the Next.js + Supabase app while keeping web — static-export build flag, removal of server middleware/auth route handlers, client-side auth guard, Capacitor-aware Supabase client (Preferences/PKCE), deep-link OAuth + Sign in with Apple, native local notifications, share fallbacks, rebrand to Huddle, account-deletion Edge Function.

> Scored against the confidence rubric with the load-bearing claims verified directly against the code. 23 lower-confidence candidates (listener-unmount races on an app-root provider, CORS `*` on a JWT-gated function, `getSession` rejection — supabase-js resolves with an `error` field rather than throwing, several pre-existing duplications, `main-layout.tsx` already carrying safe-area insets) fell below the 80 threshold and were dropped. Two judgment-call items are noted after the findings.

## Bugs & Security

### WR-01 — Open redirect via unvalidated `next` param in the OAuth callback

**File:** `app/auth/callback/page.tsx:36`
**Severity:** Warning
**Confidence:** 88
**Issue:** `next` is read straight from the query string and handed to `router.replace()` with no relative-path check. A logged-in user who opens `…/auth/callback?next=https://evil.com` is redirected off-site (no `code` needed — the session branch fires whenever a session already exists). The deleted server route was not exploitable here because it prefixed the origin (`` `${origin}${next}` ``); switching to a raw `router.replace(next)` introduces the open redirect.
**Fix:**
```ts
const raw = searchParams.get('next') || '/'
// only allow same-origin relative paths
const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
```

## Quality & Architecture

### WR-02 — Two native plugins added as dependencies but never used

**File:** `package.json` (`@capacitor/clipboard`, `@capacitor/haptics`)
**Severity:** Warning
**Confidence:** 80
**Issue:** Both packages were added to `dependencies` but have zero imports anywhere in `app/`, `components/`, `lib/`, `hooks/` — the native image path in `lib/share.ts` routes through `@capacitor/filesystem` + `@capacitor/share` (not clipboard), and haptics is wired nowhere. Beyond dead weight, the absent haptics integration means the planned "觸覺回饋" native feature isn't actually implemented.
**Fix:** Either drop both from `package.json`, or wire them — `@capacitor/haptics` on task-complete / drag interactions (its intended use), and remove `@capacitor/clipboard` since `lib/share.ts` already covers copying via the share sheet.

---

### Judgment calls below threshold (not blocking, worth a glance)

- **Account-deletion entry point** — the plan named both `settings-modal.tsx` *and* `user-menu.tsx`; it landed only in Settings (Danger Zone). That satisfies App Store 5.1.1 (deletion is reachable in-app), so it was scored as an intentional placement rather than a defect. Add it to the user menu too if you want it more prominent.
- **Loader markup duplication** — `components/auth/auth-guard.tsx:27-36` repeats the mascot+spinner block from `app/page.tsx:340-349`. A small shared `<MascotLoader/>` would de-dupe both; low priority.
