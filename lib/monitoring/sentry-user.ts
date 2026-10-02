/**
 * Which identity (if any) is attached to Sentry error reports.
 *
 * Currently returns null: reports carry NO user identity, so the team can see
 * *that* an error happened and on which platform/page/version, but not *who*
 * hit it. Attaching an id would make support follow-ups easier but is a
 * privacy / business choice, so it is deliberately left off until decided.
 *
 * If the owner opts in, return `{ id: user.id }` (the Supabase user uuid
 * only — never email, name or any other profile field) and wire this function
 * to the auth state in components/monitoring/sentry-init.tsx.
 */
export function buildSentryUser(_user: { id: string } | null | undefined): { id: string } | null {
  // DECISION: 由老闆決定是否附上匿名 user id
  return null
}
