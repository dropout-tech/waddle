import { createClient } from '@/lib/supabase/client'
import {
  imageQuotaReached,
  isEnforced,
  parsePlanUsage,
  type PlanUsage,
} from './plan-usage-core'
import {
  looksLikeStorageQuotaRefusal,
  planLimitCode,
  PlanLimitError,
} from './plan-errors'

export * from './plan-usage-core'

// One shared read of `public.my_plan_usage()` (design doc §2.11, §3.1).
//
// Fail open, front end only: if the RPC is not deployed yet, the network drops,
// or the payload is malformed, callers get `null` — "limits not enabled" — and
// nothing is blocked or shown. The database triggers still enforce the real
// limits; this is only for friendly pre-checks and the usage meters.

const OK_TTL_MS = 30_000
// A failed read (RPC missing before the backend ships, offline) is remembered
// briefly so several consumers on one screen don't each hit a 404.
const FAIL_TTL_MS = 60_000

let cache: { promise: Promise<PlanUsage | null>; at: number; ttl: number } | null = null

/** Call after anything that changes usage (an upload) or on sign-in/out. */
export function resetPlanUsage() {
  cache = null
}

async function load(): Promise<PlanUsage | null> {
  try {
    // Not in the generated Database type until types are regenerated after the
    // backend migration lands, so the call is deliberately loose.
    const client = createClient() as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>
    }
    const { data, error } = await client.rpc('my_plan_usage')
    if (error) return null
    return parsePlanUsage(data)
  } catch {
    return null
  }
}

export function fetchPlanUsage(opts: { force?: boolean } = {}): Promise<PlanUsage | null> {
  if (!opts.force && cache && Date.now() - cache.at < cache.ttl) return cache.promise
  const entry = { promise: null as unknown as Promise<PlanUsage | null>, at: Date.now(), ttl: OK_TTL_MS }
  entry.promise = load().then((usage) => {
    if (!usage) entry.ttl = FAIL_TTL_MS
    return usage
  })
  cache = entry
  return entry.promise
}

/**
 * Pre-check before any image upload (§3.3). Throws a PlanLimitError only when
 * the server says limits are on AND the image quota is already used up;
 * otherwise (including any failure to find out) it lets the upload proceed.
 */
export async function assertImageQuota(): Promise<void> {
  const usage = await fetchPlanUsage()
  if (imageQuotaReached(usage)) throw new PlanLimitError('IMAGE_LIMIT')
}

/**
 * Wraps a storage upload failure: with limits on, a policy refusal becomes the
 * same IMAGE_LIMIT message as the pre-check; everything else is returned as-is.
 * Also drops the cached usage so the next read sees the new total.
 */
export async function explainUploadError(err: unknown): Promise<unknown> {
  resetPlanUsage()
  if (planLimitCode(err) === 'IMAGE_LIMIT') return new PlanLimitError('IMAGE_LIMIT')
  if (!looksLikeStorageQuotaRefusal(err)) return err
  const usage = await fetchPlanUsage()
  return isEnforced(usage) ? new PlanLimitError('IMAGE_LIMIT') : err
}
