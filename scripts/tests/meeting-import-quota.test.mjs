import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL, usageRecord, reservationError, failureResponse } from '../../supabase/functions/meeting-import/quota.mjs'

test('usage keeps OpenAI token counts and adds an estimated cost', () => {
  // 30,000 input (10,000 cached) + 6,000 output on gpt-4.1-mini:
  // 20,000×0.4 + 10,000×0.1 + 6,000×1.6 = 8,000 + 1,000 + 9,600 → 18,600 / 1e6
  const raw = { prompt_tokens: 30000, completion_tokens: 6000, total_tokens: 36000, prompt_tokens_details: { cached_tokens: 10000 } }
  const u = usageRecord(raw)
  assert.equal(u.cost_usd, 0.0186)
  assert.equal(u.model, MODEL)
  assert.equal(u.prompt_tokens, 30000)
  assert.equal(u.completion_tokens, 6000)
})

test('missing or hostile usage never throws and never yields a negative cost', () => {
  assert.deepEqual(usageRecord(undefined), { model: MODEL, cost_usd: null })
  assert.deepEqual(usageRecord([1, 2]), { model: MODEL, cost_usd: null })
  assert.equal(usageRecord({ prompt_tokens: -5, completion_tokens: 'x' }).cost_usd, 0)
  // cached larger than prompt is clamped
  assert.equal(usageRecord({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 1e9 } }).cost_usd, 0.00001)
})

test('reservation errors map to stable codes and statuses', () => {
  assert.deepEqual(reservationError('MONTHLY_LIMIT'), { code: 'MONTHLY_LIMIT', status: 429 })
  assert.deepEqual(reservationError('RATE_LIMIT'), { code: 'RATE_LIMIT', status: 429 })
  assert.deepEqual(reservationError('ATTEMPT_LIMIT'), { code: 'ATTEMPT_LIMIT', status: 429 })
  assert.deepEqual(reservationError('AI_PAUSED'), { code: 'AI_PAUSED', status: 503 })
  assert.deepEqual(reservationError('REQUEST_CONFLICT'), { code: 'REQUEST_CONFLICT', status: 409 })
  assert.deepEqual(reservationError('ACCOUNT_SUSPENDED'), { code: 'DATABASE_ERROR', status: 409 })
  assert.deepEqual(reservationError(undefined), { code: 'DATABASE_ERROR', status: 409 })
})

test('malformed client input is INVALID_INPUT only before the model is called', () => {
  const zod = Object.assign(new Error('bad'), { name: 'ZodError' })
  assert.deepEqual(failureResponse(new SyntaxError('x'), false), { error: 'INVALID_INPUT', status: 400 })
  assert.deepEqual(failureResponse(zod, false), { error: 'INVALID_INPUT', status: 400 })
  // After a claim, a parse/validation error is the model output's fault.
  assert.deepEqual(failureResponse(new SyntaxError('x'), true), { error: 'GENERATION_FAILED', status: 502 })
  assert.deepEqual(failureResponse(zod, true), { error: 'GENERATION_FAILED', status: 502 })
  assert.deepEqual(failureResponse(new Error('INVALID_SOURCE'), true), { error: 'GENERATION_FAILED', status: 502 })
  assert.deepEqual(failureResponse(new Error('DIRECTORY_FAILED'), false), { error: 'GENERATION_FAILED', status: 502 })
})
