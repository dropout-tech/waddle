// Pure decisions for the Pro-limits UI (docs/billing/2026-10-01-pro-limits-design.md §3).
//
// Everything here is free of imports so scripts/verify-pro-limits-ui.mjs can
// load it directly under Node. The one rule that matters: the server owns the
// limits. While `limits_enforced` is off (or the `my_plan_usage` RPC is not
// deployed yet) every helper answers "not enforced" and the UI looks exactly
// like it did before this feature existed.

export interface PlanLimits {
  /** null = unlimited. */
  active_tasks: number | null
  notes: number | null
  image_bytes: number | null
  meeting_imports: number | null
}

export interface PlanUsage {
  enforced: boolean
  pro: boolean
  limits: PlanLimits
  used: {
    active_tasks: number
    notes: number
    image_bytes: number
    meeting_imports_this_month: number
  }
  grandfathered: { google_calendar: boolean }
}

const nullableCount = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0

/** Normalises the `my_plan_usage` payload; anything malformed -> null ("not enabled"). */
export function parsePlanUsage(raw: unknown): PlanUsage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.enforced !== 'boolean') return null
  const limits = (r.limits && typeof r.limits === 'object' ? r.limits : {}) as Record<string, unknown>
  const used = (r.used && typeof r.used === 'object' ? r.used : {}) as Record<string, unknown>
  const grand = (r.grandfathered && typeof r.grandfathered === 'object' ? r.grandfathered : {}) as Record<string, unknown>
  return {
    enforced: r.enforced,
    pro: r.pro === true,
    limits: {
      active_tasks: nullableCount(limits.active_tasks),
      notes: nullableCount(limits.notes),
      image_bytes: nullableCount(limits.image_bytes),
      meeting_imports: nullableCount(limits.meeting_imports),
    },
    used: {
      active_tasks: count(used.active_tasks),
      notes: count(used.notes),
      image_bytes: count(used.image_bytes),
      meeting_imports_this_month: count(used.meeting_imports_this_month),
    },
    grandfathered: { google_calendar: grand.google_calendar === true },
  }
}

/** True only when the server says limits are on. null / false -> UI stays as today. */
export function isEnforced(usage: PlanUsage | null | undefined): usage is PlanUsage {
  return !!usage && usage.enforced === true
}

/** Image uploads are blocked client-side only when limits are on and the quota is already used up. */
export function imageQuotaReached(usage: PlanUsage | null | undefined): boolean {
  if (!isEnforced(usage)) return false
  const limit = usage.limits.image_bytes
  return limit !== null && usage.used.image_bytes >= limit
}

/** Google Calendar connect is replaced by an upgrade prompt only for free, non-grandfathered users. */
export function googleCalendarLocked(usage: PlanUsage | null | undefined): boolean {
  return isEnforced(usage) && !usage.pro && !usage.grandfathered.google_calendar
}

/** The monthly AI meeting quota always comes from the server; 20 only if an old server omits it. */
export function meetingLimitFrom(serverLimit: unknown, fallback = 20): number {
  return typeof serverLimit === 'number' && Number.isFinite(serverLimit) && serverLimit > 0
    ? serverLimit
    : fallback
}

export type MeterKey = 'tasks' | 'notes' | 'images' | 'meetings'
export interface UsageMeter {
  key: MeterKey
  used: number
  /** null = unlimited (no bar, never warns). */
  limit: number | null
  ratio: number
  level: 'ok' | 'warn' | 'full'
}

const meter = (key: MeterKey, used: number, limit: number | null): UsageMeter => {
  const ratio = limit && limit > 0 ? Math.min(1, used / limit) : 0
  const level = limit === null || limit <= 0 ? 'ok' : used >= limit ? 'full' : ratio >= 0.8 ? 'warn' : 'ok'
  return { key, used, limit, ratio, level }
}

/** The four meters for the membership page; empty (render nothing) while limits are off. */
export function usageMeters(usage: PlanUsage | null | undefined): UsageMeter[] {
  if (!isEnforced(usage)) return []
  return [
    meter('tasks', usage.used.active_tasks, usage.limits.active_tasks),
    meter('notes', usage.used.notes, usage.limits.notes),
    meter('images', usage.used.image_bytes, usage.limits.image_bytes),
    meter('meetings', usage.used.meeting_imports_this_month, usage.limits.meeting_imports),
  ]
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 10 * 1024 ** 2 ? 0 : 1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}
