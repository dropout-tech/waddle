# e2e smoke test

Run: `pnpm e2e`

Spawns `next dev` on port 3100, logs in with `E2E_EMAIL`/`E2E_PASSWORD`
(defaults to the shared mobile test account), and walks month/week/day view,
`/notebook`, the focus scratchpad, the settings modal, and the report view.
Each step asserts: no horizontal body overflow, no `pageerror`, no
unexpected `console.error`. Screenshots land in `$E2E_SCREENSHOT_DIR` or
`$TMPDIR/huddle-e2e-shots` (never in the repo). The dev server is killed on
exit, success or failure.
