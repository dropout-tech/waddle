// Kept runtime-independent so it can be tested with Node (scripts/tests/delete-account-revenuecat.test.mjs).
//
// Deleting a Huddle account also deletes the member's RevenueCat customer (owner, 2026-10-02):
// personal data held by a processor goes with the account (個資法 §11 / 施行細則 §8). The Apple
// subscription itself keeps renewing until the member cancels it in their Apple ID settings (the
// delete dialog says so and links there). A RevenueCat outage never blocks the account deletion
// (legal review 2026-10-02): the id is queued and retried until RevenueCat confirms.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Delete the RevenueCat customer whose App User ID is the Huddle user id.
 * Resolves 'skipped' when billing is not configured (no secret key yet), 'deleted' or
 * 'not_found' (never bought, already deleted). Throws on anything else.
 */
export async function deleteRevenueCatCustomer({ apiKey, userId, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (!apiKey) return 'skipped'
  if (!UUID.test(userId ?? '')) throw new Error('Refusing to delete a RevenueCat customer without a user id')
  const response = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.ok) return 'deleted'
  if (response.status === 404) return 'not_found'
  throw new Error(`RevenueCat customer delete failed (${response.status})`)
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Account deletion path: a few quick tries, then hand the id to the retry queue instead of failing.
 * Resolves 'deleted' | 'not_found' | 'skipped' | 'queued'. Only throws if queueing itself fails,
 * so the caller can still refuse to delete rather than lose track of the RevenueCat customer.
 */
export async function releaseRevenueCatCustomer({ apiKey, userId, enqueue, fetchImpl = fetch, delaysMs = [500, 1500], sleep = pause }) {
  let lastError
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (attempt > 0) await sleep(delaysMs[attempt - 1])
    try {
      return await deleteRevenueCatCustomer({ apiKey, userId, fetchImpl })
    } catch (error) {
      lastError = error
      if (!UUID.test(userId ?? '')) throw error
    }
  }
  await enqueue(userId, lastError instanceof Error ? lastError.message : String(lastError))
  return 'queued'
}

/**
 * Retry queued deletions (oldest first). `list(limit)` returns [{ app_user_id, attempts }];
 * `done(id)` removes a confirmed row; `failed(id, attempts, message)` records the attempt.
 * Never throws for a single failing row; returns a summary.
 */
export async function drainDeletionQueue({ apiKey, list, done, failed, fetchImpl = fetch, limit = 20 }) {
  const summary = { deleted: 0, failed: 0 }
  if (!apiKey) return summary
  for (const row of await list(limit)) {
    try {
      await deleteRevenueCatCustomer({ apiKey, userId: row.app_user_id, fetchImpl })
      await done(row.app_user_id)
      summary.deleted++
    } catch (error) {
      summary.failed++
      await failed(row.app_user_id, (row.attempts ?? 0) + 1, error instanceof Error ? error.message : String(error))
    }
  }
  return summary
}
