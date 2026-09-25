import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const token = req.headers.get('Authorization')
    if (!token) return json({ error: 'authentication_required' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!,
      anon = Deno.env.get('SUPABASE_ANON_KEY')!,
      service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const client = createClient(url, anon, {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false },
    })
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser()
    if (authError || !user)
      return json({ error: 'authentication_required' }, 401)
    const body = await req.json().catch(() => null)
    if (
      !body ||
      typeof body.meeting_id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.meeting_id)
    )
      return json({ error: 'invalid_meeting_id' }, 400)
    const admin = createClient(url, service, {
      auth: { persistSession: false },
    })
    const { data: meeting, error: meetingError } = await admin
      .from('meeting_invitations')
      .select(
        'id,organizer_id,title,description,location,starts_at,ends_at,time_zone,status',
      )
      .eq('id', body.meeting_id)
      .eq('organizer_id', user.id)
      .maybeSingle()
    if (meetingError) return json({ error: 'meeting_lookup_failed' }, 500)
    if (!meeting) return json({ error: 'invitation_unavailable' }, 403)
    const key = Deno.env.get('RESEND_API_KEY'),
      from = Deno.env.get('MEETING_EMAIL_FROM'),
      site = Deno.env.get('APP_SITE_URL')
    if (!key || !from || !site)
      return json({ error: 'email_not_configured' }, 503)
    const siteUrl = new URL(site)
    if (siteUrl.protocol !== 'https:')
      return json({ error: 'email_not_configured' }, 503)
    const event = meeting.status === 'cancelled' ? 'cancellation' : 'invitation'
    const { data: rows, error: outboxError } = await admin
      .from('meeting_email_outbox')
      .select('id,recipient_id,status,first_attempt_at')
      .eq('meeting_id', meeting.id)
      .eq('event_type', event)
    if (outboxError || !rows)
      return json({ error: 'outbox_lookup_failed' }, 500)
    let sent = rows.filter((r) => r.status === 'sent').length,
      failed = 0
    for (const row of rows.filter((r) => r.status !== 'sent')) {
      // Resend retains idempotency keys for 24 hours. A past uncertain delivery
      // needs operator reconciliation; never silently create a duplicate email.
      if (
        row.first_attempt_at &&
        Date.now() - Date.parse(row.first_attempt_at) > 23 * 3600_000
      ) {
        await admin
          .from('meeting_email_outbox')
          .update({
            status: 'failed',
            last_error: 'delivery_reconciliation_required',
          })
          .eq('id', row.id)
          .neq('status', 'sent')
        failed++
        continue
      }
      const { data: recipient, error: recipientError } =
        await admin.auth.admin.getUserById(row.recipient_id)
      if (recipientError || !recipient.user?.email) {
        await admin
          .from('meeting_email_outbox')
          .update({
            status: 'failed',
            last_error: 'recipient_email_unavailable',
          })
          .eq('id', row.id)
          .neq('status', 'sent')
        failed++
        continue
      }
      const { error: claimError } = await admin
        .from('meeting_email_outbox')
        .update({ first_attempt_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('first_attempt_at', null)
      if (claimError) {
        failed++
        continue
      }
      const link = new URL('/meetings/invitations', siteUrl)
      link.searchParams.set('invite', meeting.id)
      const cancelled = event === 'cancellation'
      const heading = cancelled
        ? '邀請已取消 / Invitation cancelled'
        : '你收到 Huddle 邀請 / You’re invited on Huddle'
      const format = (locale: string, value: string) =>
        new Intl.DateTimeFormat(locale, {
          timeZone: meeting.time_zone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      const when = `${format('zh-TW', meeting.starts_at)} – ${format('zh-TW', meeting.ends_at)} / ${format('en', meeting.starts_at)} – ${format('en', meeting.ends_at)} (${meeting.time_zone})`
      const text = `${heading}\n\n${meeting.title}\n${when}\n${meeting.location}\n${meeting.description}\n\n${link.href}\n\n登入 Huddle 回覆：接受、暫定或婉拒。\nSign in to Huddle to accept, respond maybe, or decline.`
      const html = `<h1>${escapeHtml(heading)}</h1><h2>${escapeHtml(meeting.title)}</h2><p>${escapeHtml(when)}</p><p>${escapeHtml(meeting.location)}</p><p style="white-space:pre-wrap">${escapeHtml(meeting.description)}</p><p><a href="${escapeHtml(link.href)}">查看邀請 / View invitation</a></p><p>登入 Huddle 回覆：接受、暫定或婉拒。<br>Sign in to Huddle to accept, respond maybe, or decline.</p>`
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `huddle-meeting/${row.id}`,
          },
          body: JSON.stringify({
            from,
            to: [recipient.user.email],
            subject: `${cancelled ? '[Cancelled / 已取消]' : '[Huddle Invitation / 邀請]'} ${meeting.title.replace(/[\r\n]/g, ' ')}`,
            html,
            text,
          }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error('provider_failed')
        const { error: savedError } = await admin
          .from('meeting_email_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', row.id)
        if (savedError) throw new Error('delivery_record_failed')
        sent++
      } catch {
        await admin
          .from('meeting_email_outbox')
          .update({
            status: 'failed',
            last_error: 'delivery_failed_retry_same_key',
          })
          .eq('id', row.id)
          .neq('status', 'sent')
        failed++
      }
    }
    return json({
      sent,
      failed,
      pending: Math.max(0, rows.length - sent - failed),
    })
  } catch {
    return json({ error: 'request_failed' }, 500)
  }
})
