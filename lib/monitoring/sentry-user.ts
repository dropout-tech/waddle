/**
 * Which identity is attached to Sentry error reports.
 *
 * Owner decision (2026-10-02): attach the Supabase user uuid ONLY, so the team
 * can tell how many people an error affects and look up a reporter's errors
 * when they write in. Never email, name or any other profile field — the
 * uuid means nothing outside our own database.
 */
export function buildSentryUser(userId: string | null | undefined): { id: string } | null {
  return userId ? { id: userId } : null
}
