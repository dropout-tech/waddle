// Pure accounting helpers for meeting-import, shared by index.ts (Deno) and
// scripts/tests/meeting-import-quota.test.mjs (node --test). No I/O here.

export const MODEL = 'gpt-4.1-mini'
// USD per 1M tokens for gpt-4.1-mini, from
// https://developers.openai.com/api/docs/models/gpt-4.1-mini (checked 2026-10-02).
// Update together with MODEL; the stored cost is an estimate for the owner.
export const PRICE_PER_MILLION = { input: 0.4, cachedInput: 0.1, output: 1.6 }

const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

// OpenAI `usage` → what meeting_imports.usage stores, with an estimated cost.
// Unknown/missing usage still records the model so the row is attributable.
export function usageRecord(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return { model: MODEL, cost_usd: null }
  const prompt = count(usage.prompt_tokens)
  const cached = Math.min(count(usage.prompt_tokens_details?.cached_tokens), prompt)
  const output = count(usage.completion_tokens)
  const cost =
    ((prompt - cached) * PRICE_PER_MILLION.input +
      cached * PRICE_PER_MILLION.cachedInput +
      output * PRICE_PER_MILLION.output) / 1e6
  return { ...usage, model: MODEL, cost_usd: Math.round(cost * 1e6) / 1e6 }
}

// reserve_meeting_import_v2 error message → response code and HTTP status.
// Anything unrecognised keeps the historical DATABASE_ERROR / 409.
const RESERVATION_ERRORS = [
  ['MONTHLY_LIMIT', 429],
  ['RATE_LIMIT', 429],
  ['ATTEMPT_LIMIT', 429],
  ['AI_PAUSED', 503],
  ['REQUEST_CONFLICT', 409],
]
export function reservationError(message) {
  const text = String(message ?? '')
  const hit = RESERVATION_ERRORS.find(([code]) => text.includes(code))
  return hit ? { code: hit[0], status: hit[1] } : { code: 'DATABASE_ERROR', status: 409 }
}

// Error thrown inside the handler → response. Malformed client input is only
// possible before a reservation is claimed; once the model has been called a
// parse/validation error is about the model output, never INVALID_INPUT.
export function failureResponse(error, claimed) {
  const invalid =
    !claimed &&
    (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError'))
  return invalid ? { error: 'INVALID_INPUT', status: 400 } : { error: 'GENERATION_FAILED', status: 502 }
}
