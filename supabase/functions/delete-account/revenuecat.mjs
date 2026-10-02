// Kept runtime-independent so it can be tested with Node (scripts/tests/delete-account-revenuecat.test.mjs).
//
// RevenueCat restore behavior is "Keep with original App User ID" (owner, 2026-10-02): a
// subscription stays bound to the Huddle account that bought it. Without this step, someone who
// deletes their account and signs up again could never restore a subscription they still pay
// Apple for. Deleting the RevenueCat customer releases it; the Apple subscription itself keeps
// renewing until the member cancels it in their Apple ID settings (the delete dialog says so).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Delete the RevenueCat customer whose App User ID is the Huddle user id.
 * Resolves 'skipped' when billing is not configured (no secret key yet), 'deleted' or
 * 'not_found' (never bought, already deleted). Throws on anything else so the caller can
 * stop before the account is deleted and let the member retry.
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
