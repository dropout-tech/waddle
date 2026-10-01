// Safety check for the onboarding "apply template / start blank" step, which
// deletes every workspace (and, by cascade, every task) before rebuilding.
// That wipe is only safe on a brand-new account. Anything uncertain — tasks
// exist, or the lookup failed — must resolve to "do not touch the data".

export type ServerTaskCount = { count: number | null; error: unknown }

export async function canResetWorkspaces(opts: {
  /** Tasks already loaded in local state. */
  localTaskCount: number
  /** Head-count of the account's tasks on the server (RLS scopes it to the user). */
  fetchServerTaskCount: () => PromiseLike<ServerTaskCount>
}): Promise<boolean> {
  if (opts.localTaskCount > 0) return false
  try {
    const { count, error } = await opts.fetchServerTaskCount()
    if (error) return false
    return count === 0
  } catch {
    return false
  }
}
