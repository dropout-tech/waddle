/**
 * AI consent versions — the front-end copy of the constants the server keeps in
 * supabase/functions/_shared/ai-consent.ts (see docs/features/ai-review-design.md
 * §4.5 and §6.1). The values here MUST equal the server's `status.required`;
 * when they differ the UI refuses to record a consent and asks for a refresh.
 *
 * - scopeVersion: bumped whenever the data categories sent, the recipient or the
 *   region change. A bump invalidates every earlier consent (re-consent).
 * - copyVersion: the wording of the consent screen. Wording-only changes bump
 *   this alone and do not need a new consent.
 *
 * Both features (AI review, AI meeting import) share one consent screen
 * component and are consented separately.
 */
export type AiConsentFeature = 'ai_review' | 'meeting_import'

export const AI_CONSENT: Record<
  AiConsentFeature,
  { scopeVersion: number; copyVersion: string }
> = {
  ai_review: { scopeVersion: 1, copyVersion: '2026-10-01.1' },
  meeting_import: { scopeVersion: 1, copyVersion: '2026-10-01.1' },
}
