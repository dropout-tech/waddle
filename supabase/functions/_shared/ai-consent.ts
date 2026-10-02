// Single source of the AI consent versions, imported by ai-review (status /
// consent / generate) and meeting-import (server-side consent check).
// Design: docs/features/ai-review-design.md 2.1 (versioning rules) and 6.1.
//
// scopeVersion: bump when the data sent, the field whitelist, the recipient,
//   the region or a scope switch changes. Old consents then stop counting and
//   the user is asked again (the database compares the stored scope_version).
// copyVersions: consent-screen wordings the server accepts. Old and new can
//   overlap so a front-end deploy lag never blocks a consent.
// recipient / region: stored with every consent row; never taken from clients.
//
// No Deno-only imports: also loaded by node --test.
export const AI_CONSENT = {
  ai_review: {
    scopeVersion: 1,
    copyVersions: ["2026-10-01.1"],
    recipient: "OpenAI",
    region: "US",
  },
  meeting_import: {
    scopeVersion: 1,
    copyVersions: ["2026-10-01.1"],
    recipient: "OpenAI",
    region: "US",
  },
} as const;

export type AiFeature = keyof typeof AI_CONSENT;
export const AI_FEATURES = Object.keys(AI_CONSENT) as AiFeature[];
