// AI review Edge Function — thin Deno shell (same pattern as web-billing):
// read env, build clients, inject narrow capabilities, serve. All logic lives
// in handler.ts / material.ts / contract.ts (tested with node --test).
//
// This is the ONLY file of the feature that touches the service key and the
// OpenAI key. Secrets (design 4):
//   OPENAI_API_KEY_AI_REVIEW  this feature's own key (never the shared one)
//   AI_REVIEW_ENABLED         "true" to turn generation on; unset = off
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// NOT DEPLOYED: requires the draft migrations in supabase/migrations-draft/.
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import { handle } from "./handler.ts";

// Service-role RPCs this feature may call. Everything else is refused here,
// so the service key cannot be used for table access from the handler.
const ADMIN_RPCS = new Set([
  "account_access_allowed",
  "ai_feature_status",
  "record_ai_consent",
  "reserve_ai_review",
  "finish_ai_review",
]);

Deno.serve((req) => {
  // Read per request: flipping the secret needs no code change.
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiKey = Deno.env.get("OPENAI_API_KEY_AI_REVIEW") ?? "";
  const enabled = Deno.env.get("AI_REVIEW_ENABLED") === "true" && openaiKey !== "";

  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  return handle(req, {
    enabled,
    getUser: async (token) => {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data?.user) return null;
      return { id: data.user.id, is_anonymous: data.user.is_anonymous };
    },
    rpc: async (fn, args) => {
      if (!ADMIN_RPCS.has(fn)) return { data: null, error: { message: "RPC_NOT_ALLOWED" } };
      const { data, error } = await admin.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    // User-scoped client (anon key + caller JWT): RLS applies. The only
    // client material.ts ever receives.
    userDb: (token) =>
      createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }),
    callModel: (payload, signal) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(payload),
      }),
    now: () => Date.now(),
    // Fixed codes only; never content, tokens or upstream bodies.
    log: (code) => console.warn(code),
  });
});
