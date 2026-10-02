// ai-review request / response contract (design 4, 6.5, 7). Pure: no I/O,
// no Deno APIs, no npm imports, so node --test can load it directly.
// Validation is hand-written instead of Zod for that reason; the accepted
// shapes are exactly the ones in design 4.1–4.3.
import { AI_CONSENT, type AiFeature } from "../_shared/ai-consent.ts";
import { isPeriodKey, type PeriodKey } from "./period.ts";

// ── Constants (single place; design 1 #7 and 7) ─────────────────────────────
export const AI_REVIEW_MODEL = "gpt-4.1-mini";
export const TEMPERATURE = 0.2;
export const MAX_COMPLETION_TOKENS = 4000;
export const OPENAI_TIMEOUT_MS = 70_000;
export const DEADLINE_MS = 85_000; // from request start; above this the result is discarded
export const BODY_LIMIT_BYTES = 4_000;
export const MATERIAL_BYTE_LIMIT = 60_000;

// ── Requests ────────────────────────────────────────────────────────────────
export type Locale = "zh-TW" | "en";
export type Platform = "web" | "ios" | "android" | "desktop";
export type StatusRequest = { action: "status"; feature: AiFeature };
export type ConsentRequest = {
  action: "consent";
  feature: AiFeature;
  decision: "grant" | "withdraw";
  copyVersion: string;
  scopeVersion: number;
  locale: Locale;
  platform: Platform;
  appVersion: string | null;
  meetingHighlights: boolean;
  deleteReports: boolean;
};
export type GenerateRequest = { action: "generate"; requestId: string; period: PeriodKey; locale: Locale };
export type AiReviewRequest = StatusRequest | ConsentRequest | GenerateRequest;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COPY_VERSION = /^[A-Za-z0-9._-]{1,40}$/; // = ai_consents.copy_version check
const APP_VERSION = /^[A-Za-z0-9._+-]{1,40}$/; // = ai_consents.app_version check
const LOCALES: readonly string[] = ["zh-TW", "en"];
const PLATFORMS: readonly string[] = ["web", "ios", "android", "desktop"];

export class InvalidInput extends Error {
  constructor() {
    super("INVALID_INPUT");
    this.name = "InvalidInput";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isFeature = (v: unknown): v is AiFeature => typeof v === "string" && Object.hasOwn(AI_CONSENT, v);
const optionalBool = (v: unknown): boolean => {
  if (v === undefined) return false;
  if (typeof v !== "boolean") throw new InvalidInput();
  return v;
};

/** Parses a decoded JSON body. Throws InvalidInput for anything else. Unknown
 *  keys are ignored (never read), as Zod objects do by default. */
export function parseRequest(body: unknown): AiReviewRequest {
  if (!isRecord(body)) throw new InvalidInput();
  if (body.action === "status") {
    if (!isFeature(body.feature)) throw new InvalidInput();
    return { action: "status", feature: body.feature };
  }
  if (body.action === "consent") {
    const b = body;
    if (!isFeature(b.feature)) throw new InvalidInput();
    if (b.decision !== "grant" && b.decision !== "withdraw") throw new InvalidInput();
    if (typeof b.copyVersion !== "string" || !COPY_VERSION.test(b.copyVersion)) throw new InvalidInput();
    if (typeof b.scopeVersion !== "number" || !Number.isInteger(b.scopeVersion)) throw new InvalidInput();
    if (typeof b.locale !== "string" || !LOCALES.includes(b.locale)) throw new InvalidInput();
    if (typeof b.platform !== "string" || !PLATFORMS.includes(b.platform)) throw new InvalidInput();
    if (b.appVersion !== undefined && b.appVersion !== null &&
      (typeof b.appVersion !== "string" || !APP_VERSION.test(b.appVersion))) throw new InvalidInput();
    return {
      action: "consent",
      feature: b.feature,
      decision: b.decision,
      copyVersion: b.copyVersion,
      scopeVersion: b.scopeVersion,
      locale: b.locale as Locale,
      platform: b.platform as Platform,
      appVersion: (b.appVersion as string | null | undefined) ?? null,
      // Only meaningful for ai_review (and deleteReports only for withdraw);
      // the database ignores them otherwise.
      meetingHighlights: optionalBool(b.meetingHighlights),
      deleteReports: optionalBool(b.deleteReports),
    };
  }
  if (body.action === "generate") {
    if (typeof body.requestId !== "string" || !UUID.test(body.requestId)) throw new InvalidInput();
    if (!isPeriodKey(body.period)) throw new InvalidInput();
    if (typeof body.locale !== "string" || !LOCALES.includes(body.locale)) throw new InvalidInput();
    return { action: "generate", requestId: body.requestId.toLowerCase(), period: body.period, locale: body.locale as Locale };
  }
  throw new InvalidInput();
}

// ── Error codes → HTTP (design 4.4) ─────────────────────────────────────────
export const ERROR_STATUS = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  ANONYMOUS_NOT_ALLOWED: 403,
  ACCOUNT_SUSPENDED: 403,
  CONSENT_REQUIRED: 403,
  METHOD_NOT_ALLOWED: 405,
  CONSENT_VERSION_MISMATCH: 409,
  IN_PROGRESS: 409,
  DUPLICATE_REQUEST: 409,
  CONSENT_CHANGED: 409,
  INPUT_TOO_LARGE: 413,
  NO_DATA: 422,
  MATERIAL_BLOCKED: 422,
  MONTHLY_LIMIT: 429,
  RATE_LIMIT: 429,
  ATTEMPT_LIMIT: 429,
  GENERATION_FAILED: 502,
  AI_NOT_CONFIGURED: 503,
  SERVICE_PAUSED: 503,
  DATABASE_ERROR: 503,
  GENERATION_TIMEOUT: 504,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

/** Errors raised by the database functions (message === code, design 3.0).
 *  Matching is by strict equality, never includes(). Anything else is a
 *  DATABASE_ERROR. GLOBAL_DAILY_LIMIT is reported to clients as SERVICE_PAUSED. */
const DB_CODES: Record<string, ErrorCode> = {
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ANONYMOUS_NOT_ALLOWED: "ANONYMOUS_NOT_ALLOWED",
  INVALID_INPUT: "INVALID_INPUT",
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  IN_PROGRESS: "IN_PROGRESS",
  MONTHLY_LIMIT: "MONTHLY_LIMIT",
  RATE_LIMIT: "RATE_LIMIT",
  ATTEMPT_LIMIT: "ATTEMPT_LIMIT",
  GLOBAL_DAILY_LIMIT: "SERVICE_PAUSED",
};
export function databaseErrorCode(message: unknown): ErrorCode {
  return typeof message === "string" && Object.hasOwn(DB_CODES, message) ? DB_CODES[message] : "DATABASE_ERROR";
}
/** Codes whose response carries the latest `quota` (design 4.4). */
export const WITH_QUOTA: ReadonlySet<ErrorCode> = new Set(["IN_PROGRESS", "MONTHLY_LIMIT", "RATE_LIMIT", "ATTEMPT_LIMIT"]);

/** finish_ai_review failure codes the Edge Function may send (design 3.3). */
export type FailureCode =
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "INCOMPLETE_RESULT"
  | "INVALID_OUTPUT"
  | "SAVE_FAILED"
  | "CONSENT_CHANGED";

// ── Model output (design 7) ─────────────────────────────────────────────────
export const SECTIONS = ["rhythm", "done", "time_spent", "pending", "observation"] as const;
export type Section = (typeof SECTIONS)[number];
export type ReportText = Record<Section, string>;

export const SECTION_LIMITS: Record<Locale, Record<Section, number>> = {
  "zh-TW": { rhythm: 300, done: 1000, time_spent: 500, pending: 700, observation: 160 },
  en: { rhythm: 900, done: 3000, time_spent: 1500, pending: 2100, observation: 480 },
};

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rhythm: { type: "string" },
    done: { type: "string" },
    time_spent: { type: "string" },
    pending: { type: "string" },
    observation: { type: "string" },
  },
  required: [...SECTIONS],
} as const;

export class InvalidOutput extends Error {
  constructor() {
    super("INVALID_OUTPUT");
    this.name = "InvalidOutput";
  }
}

/** JSON text from the model → five sanitized sections, or InvalidOutput.
 *  Order: parse, five non-empty strings, stripUrls, clampText, non-empty. */
export function sanitizeReport(content: unknown, locale: Locale): ReportText {
  if (typeof content !== "string") throw new InvalidOutput();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InvalidOutput();
  }
  if (!isRecord(parsed)) throw new InvalidOutput();
  const out = {} as ReportText;
  for (const key of SECTIONS) {
    const v = parsed[key];
    if (typeof v !== "string" || v.trim() === "") throw new InvalidOutput();
    const cleaned = clampText(stripUrls(v), SECTION_LIMITS[locale][key]).trim();
    if (cleaned === "") throw new InvalidOutput();
    out[key] = cleaned;
  }
  return out;
}

/** Remove links, images, HTML and anything URL-like (design 7, applied in
 *  this order). The database refuses `://`, `www.` and `data:` as a backstop. */
export function stripUrls(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]{1,200}>/g, "")
    .replace(/\b[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bmailto:\S+/gi, "")
    .replace(/\bdata:\S+/gi, "")
    .replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|tw|app|dev|ai|co|me|info|xyz|cc|ly|gg)(\/\S*)?/gi, "")
    .replace(/[ \t　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** Above the limit: cut at the last sentence end (。！？.!?) inside the limit,
 *  otherwise hard-cut and append "…". Counted in code points, the same unit
 *  as PostgreSQL char_length. */
export function clampText(s: string, limit: number): string {
  const chars = Array.from(s);
  if (chars.length <= limit) return s;
  const head = chars.slice(0, limit).join("");
  const cut = Math.max(...["。", "！", "？", ".", "!", "?"].map((p) => head.lastIndexOf(p)));
  if (cut > 0) return head.slice(0, cut + 1);
  return chars.slice(0, limit - 1).join("") + "…";
}

// ── Material helpers (design 6.5) ───────────────────────────────────────────
/** Collapse every run of whitespace (incl. newlines) to one space, then cut
 *  to `limit` characters. */
export function squash(s: unknown, limit: number): string {
  if (typeof s !== "string") return "";
  const one = s.replace(/\s+/g, " ").trim();
  const chars = Array.from(one);
  return chars.length <= limit ? one : chars.slice(0, limit).join("");
}

export const FIELD_LIMITS = {
  taskTitle: 200,
  taskDescription: 400,
  taskNotes: 400,
  stickyNote: 800,
  boardTitle: 120,
  boardContent: 400,
  timeBlockLabel: 80,
  timeBlockNotes: 300,
  meetingTitle: 160,
  meetingSummary: 1200,
  meetingDecision: 200,
  meetingDecisions: 10,
} as const;

const SCAN_RULES: RegExp[] = [
  /(^|[^a-z0-9])data:\s*[a-z]+\/[a-z0-9.+-]+/i, // S1 data URI with MIME
  /(^|[^a-z0-9])data:[^\s]{0,40}base64/i, // S2 data URI without MIME
  /[A-Za-z0-9+\/=_-]{200,}/, // S3 long base64 run
  /iVBORw0KGgo|\/9j\/4AAQ|R0lGODlh|UklGR/, // S4 PNG / JPEG / GIF / WebP magic
];
/** True when the final user message still carries image encodings. The whole
 *  request is then aborted (MATERIAL_BLOCKED); nothing is sent or reserved. */
export function scanMaterial(text: string): boolean {
  return SCAN_RULES.some((r) => r.test(text));
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length;
