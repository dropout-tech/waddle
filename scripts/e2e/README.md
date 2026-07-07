# e2e smoke test

Run: `pnpm e2e`

Spawns `next dev` on port 3100, logs in with a test account, and walks
month/week/day view, `/notebook`, the focus scratchpad, the settings modal,
and the report view. Each step asserts: no horizontal body overflow, no
`pageerror`, no unexpected `console.error`. Screenshots land in
`$E2E_SCREENSHOT_DIR` or `$TMPDIR/huddle-e2e-shots` (never in the repo).
The dev server is killed on exit, success or failure.

## Credentials

No password is hardcoded in this script. Provide a test account one of two ways:

1. Env vars `E2E_EMAIL` / `E2E_PASSWORD`, or
2. A `.env.e2e.local` file in the repo root (gitignored via `.env*.local`):
   ```
   E2E_EMAIL=your-test-account@example.com
   E2E_PASSWORD=your-test-password
   ```

Missing both → the script exits 1 with instructions instead of running.
