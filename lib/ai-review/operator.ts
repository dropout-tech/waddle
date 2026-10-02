/**
 * Who operates Huddle — shown on the AI consent screen (spec 6.2 items 1 and 6).
 *
 * TODO(owner): fill both values with the owner's real name and a contact Email
 * (decision #11, 2026-10-02: "本名＋Email"). They are intentionally EMPTY STRINGS
 * until the owner provides them.
 *
 * Launch gate: while either value is empty (after trimming) the whole AI review
 * entry stays hidden, no matter what the server says. Do not "temporarily" put a
 * placeholder here — a placeholder would make the feature visible.
 */
export const OPERATOR_NAME = ''
export const OPERATOR_EMAIL = ''

export interface OperatorInfo {
  name: string
  email: string
}

declare global {
  interface Window {
    /** Dev/test-only override (see getOperator). Never read in production builds. */
    __HUDDLE_AI_REVIEW_TEST_OPERATOR__?: Partial<OperatorInfo>
  }
}

/**
 * Returns the operator info, or null when it is not fully configured.
 *
 * The test override exists only so the Playwright script can exercise the
 * "configured" path without committing real personal data. It sits behind
 * `process.env.NODE_ENV !== 'production'`, which Next.js inlines at build time,
 * so the override branch is dead-code-eliminated from production bundles
 * (checked in scripts/e2e/ai-review-ui.mjs by grepping the build output).
 */
export function getOperator(): OperatorInfo | null {
  let name = OPERATOR_NAME
  let email = OPERATOR_EMAIL
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const override = window.__HUDDLE_AI_REVIEW_TEST_OPERATOR__
    if (override) {
      name = override.name ?? name
      email = override.email ?? email
    }
  }
  name = name.trim()
  email = email.trim()
  if (!name || !email) return null
  return { name, email }
}
