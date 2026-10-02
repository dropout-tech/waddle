// ai-review request handling (design 4). Holds NO keys and creates NO
// clients: index.ts injects narrow capabilities —
//   rpc()      service-role calls, restricted by index.ts to the five
//              functions this feature may call (access, status, consent,
//              reserve, finish);
//   userDb()   the user-scoped client handed to material.ts;
//   callModel  POST to OpenAI with the feature's own key, closed over in
//              index.ts.
// That keeps the orchestration testable under node --test with fakes.
// Nothing here logs content: only fixed codes go to deps.log.
import { AI_CONSENT } from "../_shared/ai-consent.ts";
import {
  AI_REVIEW_MODEL,
  BODY_LIMIT_BYTES,
  databaseErrorCode,
  DEADLINE_MS,
  ERROR_STATUS,
  type ErrorCode,
  type FailureCode,
  type GenerateRequest,
  InvalidInput,
  InvalidOutput,
  MAX_COMPLETION_TOKENS,
  OPENAI_TIMEOUT_MS,
  OUTPUT_SCHEMA,
  parseRequest,
  sanitizeReport,
  scanMaterial,
  TEMPERATURE,
  WITH_QUOTA,
  type ConsentRequest,
  type StatusRequest,
} from "./contract.ts";
import { buildMaterial, type UserScopedDb } from "./material.ts";
import { computePeriod } from "./period.ts";
import { systemPrompt } from "./prompt.ts";

export type RpcResult = { data: unknown; error: { message?: string } | null };
export interface Deps {
  /** AI_REVIEW_ENABLED === "true" AND the feature key is configured. */
  enabled: boolean;
  /** Verifies the JWT. null = invalid / expired. Throws on infrastructure errors. */
  getUser: (token: string) => Promise<{ id: string; is_anonymous?: boolean } | null>;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  userDb: (token: string) => UserScopedDb;
  callModel: (payload: unknown, signal: AbortSignal) => Promise<Response>;
  now: () => number;
  log: (code: string) => void;
  timeouts?: { openaiMs: number; deadlineMs: number };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
const fail = (code: ErrorCode, extra: Record<string, unknown> = {}) => reply({ error: code, ...extra }, ERROR_STATUS[code]);

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

class TooLarge extends Error {}
async function readBody(req: Request): Promise<unknown> {
  // Bound the actual stream, not the client-supplied Content-Length.
  const reader = req.body?.getReader();
  if (!reader) throw new InvalidInput();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > BODY_LIMIT_BYTES) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InvalidInput();
  }
}

class Fail extends Error {
  code: FailureCode;
  constructor(code: FailureCode) {
    super(code);
    this.code = code;
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const started = deps.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED");

  // 1. JWT, anonymous, suspension, body size, shape.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail("UNAUTHORIZED");
  let user: { id: string; is_anonymous?: boolean } | null;
  try {
    user = await deps.getUser(token);
  } catch {
    return fail("DATABASE_ERROR");
  }
  if (!user?.id) return fail("UNAUTHORIZED");
  if (user.is_anonymous) return fail("ANONYMOUS_NOT_ALLOWED");
  const access = await deps.rpc("account_access_allowed", { p_user: user.id });
  if (access.error) return fail("DATABASE_ERROR");
  if (access.data !== true) return fail("ACCOUNT_SUSPENDED");

  let request;
  try {
    request = parseRequest(await readBody(req));
  } catch (e) {
    return e instanceof TooLarge ? fail("INPUT_TOO_LARGE") : fail("INVALID_INPUT");
  }

  if (request.action === "status") return status(request, user.id, deps);
  if (request.action === "consent") return consent(request, user.id, deps);
  return generate(request, user.id, token, deps, started);
}

async function featureStatus(deps: Deps, userId: string, feature: keyof typeof AI_CONSENT) {
  return await deps.rpc("ai_feature_status", {
    p_user: userId,
    p_feature: feature,
    p_scope_version: AI_CONSENT[feature].scopeVersion,
  });
}
/** Latest quota for error responses; omitted when it cannot be read. */
async function latestQuota(deps: Deps, userId: string): Promise<Json> {
  const r = await featureStatus(deps, userId, "ai_review").catch(() => null);
  return r && !r.error && isRecord(r.data) && isRecord(r.data.quota) ? { quota: r.data.quota } : {};
}

// 4.1
async function status(request: StatusRequest, userId: string, deps: Deps) {
  const r = await featureStatus(deps, userId, request.feature);
  if (r.error || !isRecord(r.data)) return fail(databaseErrorCode(r.error?.message));
  const v = AI_CONSENT[request.feature];
  return reply({
    feature: request.feature,
    enabled: request.feature === "ai_review" ? deps.enabled : true,
    required: { scope_version: v.scopeVersion, copy_versions: [...v.copyVersions] },
    consent: r.data.consent ?? null,
    quota: r.data.quota ?? null,
  });
}

// 4.2
async function consent(request: ConsentRequest, userId: string, deps: Deps) {
  const v = AI_CONSENT[request.feature];
  if (request.scopeVersion !== v.scopeVersion || !(v.copyVersions as readonly string[]).includes(request.copyVersion)) {
    return fail("CONSENT_VERSION_MISMATCH", {
      required: { scope_version: v.scopeVersion, copy_versions: [...v.copyVersions] },
    });
  }
  const r = await deps.rpc("record_ai_consent", {
    p_user: userId,
    p_feature: request.feature,
    p_action: request.decision === "grant" ? "granted" : "withdrawn",
    p_copy_version: request.copyVersion,
    p_locale: request.locale,
    p_scope_version: v.scopeVersion,
    p_scope_options: { meeting_highlights: request.meetingHighlights },
    p_recipient: v.recipient, // server constants, never client values
    p_recipient_region: v.region,
    p_platform: request.platform,
    p_app_version: request.appVersion,
    p_delete_reports: request.decision === "withdraw" && request.deleteReports,
  });
  if (r.error || !isRecord(r.data)) return fail(databaseErrorCode(r.error?.message));
  return reply({ recorded: r.data.recorded, deleted_reports: r.data.deleted_reports, consent: r.data.consent });
}

// 4.3 — the step numbers below are the contract order.
async function generate(request: GenerateRequest, userId: string, token: string, deps: Deps, started: number) {
  const openaiMs = deps.timeouts?.openaiMs ?? OPENAI_TIMEOUT_MS;
  const deadlineMs = deps.timeouts?.deadlineMs ?? DEADLINE_MS;
  const scopeVersion = AI_CONSENT.ai_review.scopeVersion;

  // 2. Switch and key.
  if (!deps.enabled) return fail("AI_NOT_CONFIGURED");

  // 3. Read-only pre-check before touching any user data.
  const pre = await featureStatus(deps, userId, "ai_review");
  if (pre.error || !isRecord(pre.data)) return fail(databaseErrorCode(pre.error?.message));
  const preConsent = isRecord(pre.data.consent) ? pre.data.consent : {};
  const preQuota = isRecord(pre.data.quota) ? pre.data.quota : null;
  if (preConsent.granted !== true) return fail("CONSENT_REQUIRED", { consent: pre.data.consent ?? null });
  if (preQuota && typeof preQuota.blocked === "string") {
    const code = databaseErrorCode(preQuota.blocked);
    if (code === "SERVICE_PAUSED") deps.log("AI_REVIEW_GLOBAL_DAILY_LIMIT");
    return fail(code, WITH_QUOTA.has(code) ? { quota: preQuota } : {});
  }
  const options = isRecord(preConsent.scope_options) ? preConsent.scope_options : {};

  // 4. Period (server-side dates).
  const window = computePeriod(request.period, new Date(deps.now()));

  // 5. Material with the user-scoped client only.
  let material;
  try {
    material = await buildMaterial({
      db: deps.userDb(token),
      userId,
      window,
      includeMeetingHighlights: options.meeting_highlights === true, // stored consent, not the request
      locale: request.locale,
      now: new Date(deps.now()),
    });
  } catch {
    return fail("DATABASE_ERROR");
  }

  // 6. Nothing in the period: no ledger row, no attempt.
  if (!material.hasData) return fail("NO_DATA");

  // 7. Final scan of the exact user message. No ledger row, no attempt.
  if (scanMaterial(material.text)) {
    deps.log("AI_REVIEW_MATERIAL_BLOCKED");
    return fail("MATERIAL_BLOCKED");
  }

  // 8. The real gate: consent + quota + pending row in one transaction.
  const reserved = await deps.rpc("reserve_ai_review", {
    p_user: userId,
    p_request_id: request.requestId,
    p_scope_version: scopeVersion,
  });
  if (reserved.error || !isRecord(reserved.data)) {
    const code = databaseErrorCode(reserved.error?.message);
    if (code === "SERVICE_PAUSED") deps.log("AI_REVIEW_GLOBAL_DAILY_LIMIT");
    if (code === "CONSENT_REQUIRED") {
      const fresh = await featureStatus(deps, userId, "ai_review").catch(() => null);
      return fail(code, { consent: fresh && !fresh.error && isRecord(fresh.data) ? fresh.data.consent ?? null : null });
    }
    return fail(code, WITH_QUOTA.has(code) ? await latestQuota(deps, userId) : {});
  }
  const consentId = reserved.data.consent_id;

  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  const finishFailed = async (code: FailureCode) => {
    await deps.rpc("finish_ai_review", {
      p_user: userId,
      p_request_id: request.requestId,
      p_report: null,
      p_failure_code: code,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
    }).catch(() => null); // a row left pending is swept as STALE by the next reservation
  };

  // The switch changed between steps 3 and 8 (e.g. 會議重點 toggled): the
  // material was built for another consent row.
  if (consentId !== preConsent.consent_id) {
    await finishFailed("CONSENT_CHANGED");
    return fail("CONSENT_CHANGED");
  }

  try {
    // 9. Model call.
    let response: Response;
    try {
      response = await deps.callModel(
        {
          model: AI_REVIEW_MODEL,
          temperature: TEMPERATURE,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          store: false,
          response_format: {
            type: "json_schema",
            json_schema: { name: "ai_review", strict: true, schema: OUTPUT_SCHEMA },
          },
          messages: [
            { role: "system", content: systemPrompt(request.locale) },
            { role: "user", content: material.text },
          ],
        },
        AbortSignal.timeout(openaiMs),
      );
    } catch (e) {
      const name = (e as { name?: string })?.name;
      throw new Fail(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "PROVIDER_ERROR");
    }
    if (!response.ok) throw new Fail("PROVIDER_ERROR");
    let completion: Json;
    try {
      completion = await response.json();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      throw new Fail(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "INVALID_OUTPUT");
    }
    const usage = isRecord(completion.usage) ? completion.usage : {};
    if (Number.isInteger(usage.prompt_tokens) && (usage.prompt_tokens as number) >= 0) promptTokens = usage.prompt_tokens as number;
    if (Number.isInteger(usage.completion_tokens) && (usage.completion_tokens as number) >= 0) {
      completionTokens = usage.completion_tokens as number;
    }
    const choice = Array.isArray(completion.choices) && isRecord(completion.choices[0]) ? completion.choices[0] : {};
    if (choice.finish_reason !== "stop") throw new Fail("INCOMPLETE_RESULT");

    // 10. Shape, URL removal, per-language limits.
    let sections;
    try {
      sections = sanitizeReport(isRecord(choice.message) ? choice.message.content : undefined, request.locale);
    } catch (e) {
      if (e instanceof InvalidOutput) throw new Fail("INVALID_OUTPUT");
      throw e;
    }

    // 11. Whole request must answer within the 90 s promise.
    if (deps.now() - started > deadlineMs) throw new Fail("TIMEOUT");

    // 12. Save.
    const saved = await deps.rpc("finish_ai_review", {
      p_user: userId,
      p_request_id: request.requestId,
      p_report: {
        consent_id: consentId,
        period_key: window.key,
        period_start: window.start.toISOString(),
        period_end: window.end.toISOString(),
        locale: request.locale,
        ...sections,
        stats: material.stats,
      },
      p_failure_code: null,
      p_prompt_tokens: promptTokens,
      p_completion_tokens: completionTokens,
    });
    if (saved.error) {
      // Withdrawn while generating: the row is already failed, the result is
      // discarded (design 3.3 REQUEST_EXPIRED).
      if (saved.error.message === "REQUEST_EXPIRED") return fail("CONSENT_CHANGED");
      throw new Fail("SAVE_FAILED");
    }
    const report = isRecord(saved.data) ? saved.data.report : null;
    if (!isRecord(report)) throw new Fail("SAVE_FAILED");
    const fresh = await featureStatus(deps, userId, "ai_review").catch(() => null);
    const quota = fresh && !fresh.error && isRecord(fresh.data) ? fresh.data.quota ?? null : null;
    return reply({ report, quota });
  } catch (e) {
    // 13. Any failure after the reservation closes the row (attempt counted,
    // no report quota used).
    const code: FailureCode = e instanceof Fail ? e.code : "PROVIDER_ERROR";
    await finishFailed(code);
    return fail(code === "TIMEOUT" ? "GENERATION_TIMEOUT" : "GENERATION_FAILED");
  }
}
