import { MEETING_PROMPT } from "./prompt.ts";
import { z } from "npm:zod@3.24.1";
import { createClient } from "npm:@supabase/supabase-js@2.105.1";
import {
  generation,
  taskSelection,
  outputSchema,
  validateResult,
  taipeiMonth,
  meetingWeekday,
  meetingWeekDates,
} from "./contract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!,
    anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "UNAUTHORIZED" }, 401);
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);
  if (authError || !user || user.is_anonymous)
    return reply({ error: "UNAUTHORIZED" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let claimedId: string | null = null;
  try {
    // Bound the actual stream, not just the client-supplied Content-Length.
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) return reply({ error: "INVALID_INPUT" }, 400);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 200000) {
        await reader.cancel();
        return reply({ error: "INPUT_TOO_LARGE" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const scoped = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    if (body.action === "directory") {
      const { data, error } = await scoped.rpc("get_share_peers");
      if (error) throw new Error("DIRECTORY_FAILED");
      return reply({ peers: data ?? [] });
    }
    if (body.action === "inbox") {
      const fields='id,sender_id,sender_name,title,due_date,source,meeting_title,meeting_date,status,task_id,created_at';
      const [pending,history]=await Promise.all([
        admin.from('meeting_task_assignments').select(fields).eq('recipient_id',user.id).eq('status','pending').order('created_at').limit(100),
        admin.from('meeting_task_assignments').select(fields).eq('recipient_id',user.id).neq('status','pending').order('responded_at',{ascending:false}).limit(20),
      ]);
      if(pending.error || history.error)throw new Error('DATABASE_ERROR');
      return reply({assignments:[...pending.data,...history.data]});
    }

    if (body.action === "respond") {
      const input = z
        .object({
          id: z.string().uuid(),
          accept: z.boolean(),
          categoryId: z.union([z.string().uuid(), z.literal("")]),
        })
        .parse(body);
      const { data, error } = await admin.rpc("respond_meeting_assignment", {
        p_user: user.id,
        p_id: input.id,
        p_accept: input.accept,
        p_category: input.categoryId || null,
      });
      if (error) return reply({ error: "ASSIGNMENT_RESPONSE_FAILED" }, 400);
      return reply({ assignment: data });
    }
    if (body.action === "list") {
      const [records, quota] = await Promise.all([
        admin
          .from("meeting_imports")
          .select(
            "id,title,meeting_date,status,result,imported_tasks,created_at,context,checklist,assignments:meeting_task_assignments(id,source_index,recipient_id,status)",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        admin
          .from("meeting_imports")
          .select("status,created_at")
          .eq("user_id", user.id)
          .eq("month", taipeiMonth())
          .in("status", ["pending", "succeeded"]),
      ]);
      if (records.error || quota.error) throw new Error("DATABASE_ERROR");
      const used = quota.data.filter((r) => r.status === "succeeded").length;
      const pending = quota.data.filter(
        (r) =>
          r.status === "pending" &&
          Date.parse(r.created_at) > Date.now() - 300000,
      ).length;
      return reply({
        meetings: records.data,
        used,
        pending,
        limit: 20,
        month: taipeiMonth(),
        enabled: !!Deno.env.get("OPENAI_API_KEY"),
      });
    }
    if (body.action === "import") {
      const input = taskSelection.parse(body);
      const { data, error } = await admin.rpc("route_meeting_tasks", {
        p_user: user.id,
        p_id: input.id,
        p_category: input.categoryId || null,
        p_tasks: input.tasks,
      });
      if (error) return reply({ error: "IMPORT_FAILED" }, 400);
      return reply(data);
    }
    const input = generation.parse(body);
    const directory = await scoped.rpc("get_share_peers");
    if (directory.error) throw new Error("DIRECTORY_FAILED");
    const allowed = new Set([
      user.id,
      ...(directory.data ?? []).map((p: { peer_id: string }) => p.peer_id),
    ]);
    const bound = input.context.participants.filter((p) => p.userId);
    if (
      bound.some((p) => !allowed.has(p.userId)) ||
      new Set(bound.map((p) => p.userId)).size !== bound.length
    )
      return reply({ error: "INVALID_PARTICIPANTS" }, 400);
    if (input.context.autoSelf) {
      const { data: category } = await admin
        .from("categories")
        .select("id,workspace_id")
        .eq("id", input.context.categoryId)
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .maybeSingle();
      if (!category) return reply({ error: "INVALID_INPUT" }, 400);
      const { data: workspace } = await admin
        .from("workspaces")
        .select("id")
        .eq("id", category.workspace_id)
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .maybeSingle();
      if (!workspace) return reply({ error: "INVALID_INPUT" }, 400);
    }
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return reply({ error: "AI_NOT_CONFIGURED" }, 503);
    const { data: reservation, error } = await admin.rpc(
      "reserve_meeting_import_v2",
      {
        p_user: user.id,
        p_id: input.id,
        p_title: input.title,
        p_date: input.meetingDate,
        p_transcript: input.transcript,
        p_context: input.context,
      },
    );
    if (error) {
      const code = ["MONTHLY_LIMIT", "RATE_LIMIT", "REQUEST_CONFLICT"].find(
        (c) => error.message.includes(c),
      );
      return reply(
        { error: code || "DATABASE_ERROR" },
        code === "MONTHLY_LIMIT" || code === "RATE_LIMIT" ? 429 : 409,
      );
    }
    if (!reservation.claimed)
      return reply(
        { meeting: reservation.meeting },
        reservation.meeting.status === "pending" ? 202 : 200,
      );
    claimedId = input.id;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        max_completion_tokens: 6000,
        store: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "meeting_notes",
            strict: true,
            schema: outputSchema,
          },
        },
        messages: [
          {
            role: "system",
            content: MEETING_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              title: input.title,
              meetingDate: input.meetingDate,
              meetingWeekday: meetingWeekday(input.meetingDate),
              ...meetingWeekDates(input.meetingDate),
              transcript: input.transcript,
              meetingTime: input.context.meetingTime,
              participants: input.context.participants.map(
                ({ userId: _account, ...person }) => person,
              ),
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error("PROVIDER_ERROR");
    const completion = await response.json();
    if (completion.choices?.[0]?.finish_reason !== "stop")
      throw new Error("INCOMPLETE_RESULT");
    const result = validateResult(
      JSON.parse(completion.choices[0].message.content),
      input.transcript,
      input.context.participants,
      input.meetingDate,
    );
    const { data: meeting, error: saveError } = await admin.rpc(
      "finish_meeting_import_v2",
      {
        p_user: user.id,
        p_id: input.id,
        p_result: result,
        p_usage: completion.usage ?? {},
      },
    );
    if (saveError) throw new Error("SAVE_FAILED");
    claimedId = null;
    return reply({ meeting });
  } catch (error) {
    if (claimedId)
      await admin.rpc("finish_meeting_import", {
        p_user: user.id,
        p_id: claimedId,
        p_result: null,
        p_usage: null,
      });
    // Never log transcripts, model output, tokens, or upstream error bodies.
    const invalid =
      error instanceof SyntaxError ||
      (error instanceof Error && error.name === "ZodError" && !claimedId);
    return reply(
      { error: invalid ? "INVALID_INPUT" : "GENERATION_FAILED" },
      invalid ? 400 : 502,
    );
  }
});
