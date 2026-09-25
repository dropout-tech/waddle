// Retained as a no-op for older clients. Meeting notifications are in-app only.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
Deno.serve(
  (req) =>
    new Response(
      req.method === 'OPTIONS'
        ? 'ok'
        : JSON.stringify({ error: 'email_disabled', channel: 'in_app' }),
      {
        status: req.method === 'OPTIONS' ? 200 : 410,
        headers: { ...cors, 'Content-Type': 'application/json' },
      },
    ),
)
