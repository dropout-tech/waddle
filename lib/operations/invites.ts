// Pending codes are enrollment input, never authorization. The database alone
// checks new-account eligibility, quotas and idempotency. Expire after 7 days.
const KEY = 'huddle-enrollment-v1'
export interface Enrollment {
  referral: string
  coupon: string
  savedAt: number
  owner?: string
}
export function readEnrollment(): Enrollment | null {
  try {
    const item = JSON.parse(
      localStorage.getItem(KEY) || 'null'
    ) as Enrollment | null
    if (
      !item ||
      !Number.isFinite(item.savedAt) ||
      Date.now() - item.savedAt > 7 * 86400000
    ) {
      localStorage.removeItem(KEY)
      return null
    }
    return item
  } catch {
    return null
  }
}
export function saveEnrollment(
  referral: string,
  coupon: string,
  owner?: string
) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        referral: referral.trim().toUpperCase(),
        coupon: coupon.trim().toUpperCase(),
        savedAt: Date.now(),
        owner,
      })
    )
  } catch {
    /* Manual entry stays available. */
  }
}
export function clearEnrollment() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* unavailable storage */
  }
}
