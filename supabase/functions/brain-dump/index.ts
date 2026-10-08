// brain-dump (丟給企鵝): one messy paragraph → a list of to-dos.
//
// Same shape as meeting-import: JWT → account check → validate → reserve
// quota (database, atomic) → OpenAI gpt-4.1-mini with a strict json_schema →
// validate in code (dates resolved here, never by the model) → reply.
// Nothing the member typed is stored: the database only keeps a per-day
// call counter and an estimated cost (public.brain_dump_usage).
//
// Consent: like meeting-import as deployed today (its server-side consent
// switch MEETING_IMPORT_CONSENT_ENFORCED is off and the ai_consents tables
// are still in supabase/migrations-draft), the app discloses the OpenAI
// hand-off right under the input. When the shared consent tables ship, add
// a `brain_dump` key to _shared/ai-consent.ts and check it before reserving.
//
// Actions
//   { action: "status", today }              → { used, limit, remaining, enabled }
//   { action: "split", text, today, lang }   → { items: [{ title, dueDate, note }], used, limit, remaining }
// Errors: UNAUTHORIZED 401, ACCOUNT_SUSPENDED 403, INVALID_INPUT 400,
// INPUT_TOO_LARGE 413, DAILY_LIMIT 429 (+limit), RATE_LIMIT 429, AI_PAUSED 503,
// AI_NOT_CONFIGURED 503, DATABASE_ERROR 503, GENERATION_FAILED 502 (refunded).
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { BRAIN_DUMP_PROMPT } from "./prompt.ts";
import { outputSchema, splitRequest, statusRequest, todayWeekday, validateItems } from "./contract.ts";
import { FREE_DAILY_LIMIT, MODEL, plausibleToday, quotaView, reservationError, usageRecord } from "./quota.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!,
    anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "UNAUTHORIZED" }, 401);
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user || user.is_anonymous) return reply({ error: "UNAUTHORIZED" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  // Service-role calls bypass RLS: refuse suspended accounts up front (fails closed).
  const { data: allowed, error: accessError } = await admin.rpc("account_access_allowed", { p_user: user.id });
  if (accessError) return reply({ error: "DATABASE_ERROR" }, 503);
  if (allowed !== true) return reply({ error: "ACCOUNT_SUSPENDED" }, 403);

  let reservedDay: string | null = null;
  try {
    // Bound the real stream, not just Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "INVALID_INPUT" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32000) {
        await reader.cancel();
        return reply({ error: "INPUT_TOO_LARGE" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const enabled = !!Deno.env.get("OPENAI_API_KEY");

    if (body?.action === "status") {
      const input = statusRequest.parse(body);
      if (!plausibleToday(input.today)) return reply({ error: "INVALID_INPUT" }, 400);
      const { data, error } = await admin.rpc("brain_dump_status", { p_user: user.id, p_day: input.today });
      if (error) return reply({ error: "DATABASE_ERROR" }, 503);
      return reply({ ...quotaView(data), enabled: enabled && data?.enabled !== false });
    }

    const input = splitRequest.parse(body);
    if (!plausibleToday(input.today)) return reply({ error: "INVALID_INPUT" }, 400);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return reply({ error: "AI_NOT_CONFIGURED" }, 503);

    const { data: reservation, error } = await admin.rpc("reserve_brain_dump", {
      p_user: user.id,
      p_day: input.today,
    });
    if (error) {
      const { code, status } = reservationError(error.message);
      return reply(code === "DAILY_LIMIT" ? { error: code, limit: FREE_DAILY_LIMIT } : { error: code }, status);
    }
    reservedDay = input.today;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_completion_tokens: 3000,
        store: false,
        response_format: {
          type: "json_schema",
          json_schema: { name: "brain_dump", strict: true, schema: outputSchema },
        },
        messages: [
          { role: "system", content: BRAIN_DUMP_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              text: input.text,
              today: input.today,
              todayWeekday: todayWeekday(input.today),
              lang: input.lang,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error("PROVIDER_ERROR");
    const completion = await response.json();
    const usage = usageRecord(completion.usage);
    if (completion.choices?.[0]?.finish_reason !== "stop") throw new Error("INCOMPLETE_RESULT");
    const items = validateItems(JSON.parse(completion.choices[0].message.content), input.text, input.today);
    // Cost bookkeeping only; a failure here must not lose the member's result.
    await admin.rpc("finish_brain_dump", {
      p_user: user.id,
      p_day: input.today,
      p_cost: typeof usage.cost_usd === "number" ? usage.cost_usd : 0,
    });
    reservedDay = null;
    return reply({ items, ...quotaView(reservation) });
  } catch (error) {
    const claimed = reservedDay !== null;
    // A generation that produced nothing is given back — the member gets the
    // local fallback instead and keeps the try.
    if (reservedDay) await admin.rpc("refund_brain_dump", { p_user: user.id, p_day: reservedDay });
    // Never log the member's text, model output or upstream bodies.
    const invalid = !claimed && (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError"));
    return reply({ error: invalid ? "INVALID_INPUT" : "GENERATION_FAILED" }, invalid ? 400 : 502);
  }
});
