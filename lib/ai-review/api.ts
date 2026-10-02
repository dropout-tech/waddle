import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getLang } from '@/lib/i18n'
import { getPlatform, isDesktop } from '@/lib/platform'
import { AI_CONSENT, type AiConsentFeature } from '@/lib/ai-consent'

/**
 * Client for the `ai-review` Edge Function and the `ai_review_reports` table.
 * Contract: docs/features/ai-review-design.md §2.3, §3, §4. Field names and
 * error codes here come from that document — do not invent new ones.
 *
 * Invisible-until-ready rule: every failure of `fetchAiStatus` (network, 404,
 * 503, timeout, malformed body) resolves to `null` and never logs. Callers
 * render nothing for `null`.
 */

export type PeriodKey = 'this_week' | 'last_week' | 'this_month' | 'last_month'
export const PERIOD_KEYS: readonly PeriodKey[] = ['this_week', 'last_week', 'this_month', 'last_month']

export interface AiQuota {
  month: string
  is_pro: boolean
  report_limit: number
  reports_used: number
  reports_remaining: number
  attempt_limit: number
  attempts_used: number
  hourly_attempt_limit: number
  hourly_attempts_used: number
  hourly_retry_at: string | null
  in_progress: boolean
  /** Next reset day (Asia/Taipei, 1st of next month), e.g. "2026-11-01". */
  resets_on: string
  resets_at: string
  /** The error code the server would answer with right now, or null if allowed. */
  blocked: string | null
}

export interface AiConsentState {
  feature: string
  granted: boolean
  needs_reconsent: boolean
  scope_version: number | null
  copy_version: string | null
  scope_options: { meeting_highlights?: boolean }
  last_action: string | null
  required_scope_version: number | null
}

export interface AiRequired {
  scope_version: number
  copy_versions: string[]
}

export interface AiStatus {
  feature: AiConsentFeature
  enabled: boolean
  required: AiRequired
  consent: AiConsentState
  quota: AiQuota | null
}

/** Numbers the server computed; the UI shows these, never numbers from AI text. */
export type ReportStats = Record<string, number>

export interface AiReport {
  id: string
  usage_id: string
  period_key: PeriodKey
  period_start: string
  period_end: string
  locale: string
  rhythm: string
  done: string
  time_spent: string
  pending: string
  observation: string
  stats: ReportStats
  created_at: string
}

export class AiReviewError extends Error {
  code: string
  status: number
  quota: AiQuota | null
  required: AiRequired | null
  constructor(
    code: string,
    extra: { status?: number; quota?: AiQuota | null; required?: AiRequired | null } = {},
  ) {
    super(code)
    this.name = 'AiReviewError'
    this.code = code
    this.status = extra.status ?? 0
    this.quota = extra.quota ?? null
    this.required = extra.required ?? null
  }
}

// ---------- timeouts ----------

const STATUS_TIMEOUT_MS = 10_000
const CONSENT_TIMEOUT_MS = 20_000
/** Front-end watchdog for `generate` (server gives up at 85 s; design §4.5 says 95 s). */
const GENERATE_TIMEOUT_MS = 95_000

declare global {
  interface Window {
    /** Dev/test-only: shorten the generate watchdog. Ignored in production builds. */
    __HUDDLE_AI_REVIEW_TEST_TIMEOUT_MS__?: number
  }
}

function generateTimeout(): number {
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const v = window.__HUDDLE_AI_REVIEW_TEST_TIMEOUT_MS__
    if (typeof v === 'number' && v > 0) return v
  }
  return GENERATE_TIMEOUT_MS
}

// ---------- validation helpers (the server is trusted for shape only after checking) ----------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

export function parseQuota(raw: unknown): AiQuota | null {
  if (!isObj(raw)) return null
  if (
    !isNum(raw.report_limit) ||
    !isNum(raw.reports_used) ||
    !isNum(raw.reports_remaining) ||
    !isStr(raw.resets_on)
  ) {
    return null
  }
  return {
    month: isStr(raw.month) ? raw.month : '',
    is_pro: raw.is_pro === true,
    report_limit: raw.report_limit,
    reports_used: raw.reports_used,
    reports_remaining: Math.max(0, raw.reports_remaining),
    attempt_limit: isNum(raw.attempt_limit) ? raw.attempt_limit : 0,
    attempts_used: isNum(raw.attempts_used) ? raw.attempts_used : 0,
    hourly_attempt_limit: isNum(raw.hourly_attempt_limit) ? raw.hourly_attempt_limit : 0,
    hourly_attempts_used: isNum(raw.hourly_attempts_used) ? raw.hourly_attempts_used : 0,
    hourly_retry_at: isStr(raw.hourly_retry_at) ? raw.hourly_retry_at : null,
    in_progress: raw.in_progress === true,
    resets_on: raw.resets_on,
    resets_at: isStr(raw.resets_at) ? raw.resets_at : '',
    blocked: isStr(raw.blocked) ? raw.blocked : null,
  }
}

function parseConsent(raw: unknown): AiConsentState | null {
  if (!isObj(raw) || typeof raw.granted !== 'boolean') return null
  const opts = isObj(raw.scope_options) ? raw.scope_options : {}
  return {
    feature: isStr(raw.feature) ? raw.feature : '',
    granted: raw.granted,
    needs_reconsent: raw.needs_reconsent === true,
    scope_version: isNum(raw.scope_version) ? raw.scope_version : null,
    copy_version: isStr(raw.copy_version) ? raw.copy_version : null,
    scope_options: { meeting_highlights: opts.meeting_highlights === true },
    last_action: isStr(raw.last_action) ? raw.last_action : null,
    required_scope_version: isNum(raw.required_scope_version) ? raw.required_scope_version : null,
  }
}

function parseRequired(raw: unknown): AiRequired | null {
  if (!isObj(raw) || !isNum(raw.scope_version) || !Array.isArray(raw.copy_versions)) return null
  return {
    scope_version: raw.scope_version,
    copy_versions: raw.copy_versions.filter(isStr),
  }
}

export function parseReport(raw: unknown): AiReport | null {
  if (!isObj(raw)) return null
  const { id, usage_id, period_key, period_start, period_end } = raw
  if (!isStr(id) || !isStr(usage_id) || !isStr(period_start) || !isStr(period_end)) return null
  if (!isStr(period_key) || !PERIOD_KEYS.includes(period_key as PeriodKey)) return null
  for (const key of ['rhythm', 'done', 'time_spent', 'pending', 'observation'] as const) {
    if (!isStr(raw[key])) return null
  }
  const stats: ReportStats = {}
  if (isObj(raw.stats)) {
    for (const [k, v] of Object.entries(raw.stats)) if (isNum(v)) stats[k] = v
  }
  return {
    id,
    usage_id,
    period_key: period_key as PeriodKey,
    period_start,
    period_end,
    locale: isStr(raw.locale) ? raw.locale : '',
    rhythm: raw.rhythm as string,
    done: raw.done as string,
    time_spent: raw.time_spent as string,
    pending: raw.pending as string,
    observation: raw.observation as string,
    stats,
    created_at: isStr(raw.created_at) ? raw.created_at : '',
  }
}

// ---------- transport ----------

async function invokeAi(body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const { data, error } = await createClient().functions.invoke('ai-review', {
      body,
      signal: controller.signal,
    })
    if (error) {
      const context = (error as { context?: unknown }).context
      let payload: Record<string, unknown> = {}
      let status = 0
      if (context && typeof (context as Response).json === 'function') {
        status = (context as Response).status ?? 0
        try {
          const parsed: unknown = await (context as Response).json()
          if (isObj(parsed)) payload = parsed
        } catch {
          /* body not JSON (e.g. a platform 404/502 page) */
        }
      }
      if (isStr(payload.error)) {
        throw new AiReviewError(payload.error, {
          status,
          quota: parseQuota(payload.quota),
          required: parseRequired(payload.required),
        })
      }
      throw new AiReviewError(timedOut ? 'TIMEOUT' : status ? 'HTTP_ERROR' : 'NETWORK', { status })
    }
    return data
  } catch (e) {
    if (e instanceof AiReviewError) throw e
    throw new AiReviewError(timedOut ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}

// ---------- status ----------

/**
 * `null` for ANY problem: the caller treats it as "feature not available" and
 * renders nothing. Deliberately silent (no console output, no Sentry).
 */
export async function fetchAiStatus(feature: AiConsentFeature = 'ai_review'): Promise<AiStatus | null> {
  try {
    const raw = await invokeAi({ action: 'status', feature }, STATUS_TIMEOUT_MS)
    if (!isObj(raw) || typeof raw.enabled !== 'boolean') return null
    if (raw.feature !== undefined && raw.feature !== feature) return null
    const consent = parseConsent(raw.consent)
    const required = parseRequired(raw.required)
    if (!consent || !required) return null
    const quota = parseQuota(raw.quota)
    if (feature === 'ai_review' && !quota) return null
    return { feature, enabled: raw.enabled, required, consent, quota }
  } catch {
    return null
  }
}

/** True when this build's consent copy/scope matches what the server requires. */
export function consentVersionsMatch(status: AiStatus): boolean {
  const mine = AI_CONSENT[status.feature]
  return (
    status.required.scope_version === mine.scopeVersion &&
    status.required.copy_versions.includes(mine.copyVersion)
  )
}

// ---------- consent ----------

function clientPlatform(): 'web' | 'ios' | 'android' | 'desktop' {
  if (isDesktop()) return 'desktop'
  const p = getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}

export interface RecordConsentResult {
  recorded: boolean
  deletedReports: number
  consent: AiConsentState | null
}

/**
 * Consent is written by the server only; this just asks it to. "Decline" never
 * calls this (nothing to record, nothing is sent).
 */
export async function recordAiConsent(input: {
  feature: AiConsentFeature
  decision: 'grant' | 'withdraw'
  meetingHighlights?: boolean
  deleteReports?: boolean
}): Promise<RecordConsentResult> {
  const mine = AI_CONSENT[input.feature]
  const body: Record<string, unknown> = {
    action: 'consent',
    feature: input.feature,
    decision: input.decision,
    copyVersion: mine.copyVersion,
    scopeVersion: mine.scopeVersion,
    locale: getLang(),
    platform: clientPlatform(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
  }
  if (input.feature === 'ai_review') {
    body.meetingHighlights = input.meetingHighlights === true
    body.deleteReports = input.decision === 'withdraw' && input.deleteReports === true
  }
  const raw = await invokeAi(body, CONSENT_TIMEOUT_MS)
  if (!isObj(raw) || typeof raw.recorded !== 'boolean') throw new AiReviewError('BAD_RESPONSE')
  return {
    recorded: raw.recorded,
    deletedReports: isNum(raw.deleted_reports) ? raw.deleted_reports : 0,
    consent: parseConsent(raw.consent),
  }
}

// ---------- generate ----------

export async function generateAiReport(input: {
  requestId: string
  period: PeriodKey
}): Promise<{ report: AiReport; quota: AiQuota | null }> {
  const raw = await invokeAi(
    { action: 'generate', requestId: input.requestId, period: input.period, locale: getLang() },
    generateTimeout(),
  )
  if (!isObj(raw)) throw new AiReviewError('BAD_RESPONSE')
  const report = parseReport(raw.report)
  if (!report) throw new AiReviewError('BAD_RESPONSE')
  return { report, quota: parseQuota(raw.quota) }
}

// ---------- reports table (PostgREST, protected by RLS) ----------

const REPORT_COLUMNS =
  'id,usage_id,period_key,period_start,period_end,locale,rhythm,done,time_spent,pending,observation,stats,created_at'

// `ai_review_reports` is not in the generated Database types yet.
function reportsTable() {
  const client = createClient() as unknown as SupabaseClient
  return client.from('ai_review_reports')
}

export async function listAiReports(): Promise<AiReport[]> {
  const { data, error } = await reportsTable()
    .select(REPORT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new AiReviewError('LIST_FAILED')
  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.map(parseReport).filter((r): r is AiReport => r !== null)
}

/** After a timeout or lost connection: did the server finish this request anyway? */
export async function findAiReportByUsage(requestId: string): Promise<AiReport | null> {
  try {
    const { data, error } = await reportsTable()
      .select(REPORT_COLUMNS)
      .eq('usage_id', requestId)
      .maybeSingle()
    if (error) return null
    return parseReport(data)
  } catch {
    return null
  }
}

export async function deleteAiReport(id: string): Promise<void> {
  const { error } = await reportsTable().delete().eq('id', id)
  if (error) throw new AiReviewError('DELETE_FAILED')
}
