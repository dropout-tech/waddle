// Privacy scrubbing for Sentry events (lib/monitoring/sentry-scrub.ts).
// Pure functions; node loads the .ts directly (type stripping).
import test from 'node:test'
import assert from 'node:assert/strict'
import { scrubText, sanitizeUrl, scrubEvent, scrubBreadcrumb, MAX_TEXT_LENGTH } from '../../lib/monitoring/sentry-scrub.ts'

test('sanitizeUrl keeps origin + path and drops query/hash', () => {
  assert.equal(sanitizeUrl('https://huddle.lazy72.com/login?code=SECRET#frag'), 'https://huddle.lazy72.com/login')
  assert.equal(sanitizeUrl('/robots.txt?token=abc'), '/robots.txt')
  assert.equal(sanitizeUrl('capacitor://localhost/notebook?x=1'), 'capacitor://localhost/notebook')
  assert.equal(sanitizeUrl(''), undefined)
  assert.equal(sanitizeUrl(null), undefined)
})

test('sanitizeUrl never leaks the payload of non-web schemes', () => {
  const payload = 'A'.repeat(5000)
  for (const raw of [
    `data:image/png;base64,${payload}`,
    'blob:https://huddle.lazy72.com/123e4567-e89b-12d3-a456-426614174000',
    'file:///Users/someone/Documents/secret-plan.txt',
    'javascript:alert(document.cookie)',
    'about:blank',
    'chrome-extension://abcdef/page.html',
  ]) {
    const out = sanitizeUrl(raw)
    assert.match(out, /^[a-z-]+:\[redacted\]$/, raw.slice(0, 30))
    assert.ok(!out.includes('AAAA') && !out.includes('base64') && !out.includes('secret'))
  }
  assert.equal(sanitizeUrl(`data:image/png;base64,${payload}`), 'data:[redacted]')
})

test('sanitizeUrl masks UUIDs and long tokens in paths (absolute and relative)', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000'
  assert.equal(
    sanitizeUrl(`https://x.supabase.co/storage/v1/object/note-images/${uuid}/${uuid}.png?token=abc`),
    'https://x.supabase.co/storage/v1/object/note-images/:id/:id.png',
  )
  assert.equal(sanitizeUrl(`/storage/v1/object/x/${uuid}/abc.png`), '/storage/v1/object/x/:id/abc.png')
  const token = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
  assert.equal(sanitizeUrl(`https://huddle.lazy72.com/share/${token}`), 'https://huddle.lazy72.com/share/:token')
  assert.equal(sanitizeUrl('https://huddle.lazy72.com/notebook/notes'), 'https://huddle.lazy72.com/notebook/notes')
})

test('scrubText redacts emails, JWTs and long tokens', () => {
  assert.equal(scrubText('failed for a.b+c@example.com now'), 'failed for [email] now')
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'
  assert.ok(!scrubText(`bad ${jwt}`).includes('eyJ'))
  assert.equal(scrubText('key ' + 'x'.repeat(40)), 'key [token]')
  assert.equal(scrubText(undefined), undefined)
})

test('scrubText: quoted fragments with whitespace or non-ASCII become [text]; plain identifiers stay', () => {
  assert.equal(scrubText('Not found: "Buy milk tomorrow"'), 'Not found: "[text]"')
  assert.equal(scrubText('Cannot find task "我的機密任務"'), 'Cannot find task "[text]"')
  assert.equal(scrubText('title 「今天開會」 failed'), 'title 「[text]」 failed')
  assert.equal(scrubText('x `日本語` y'), 'x `[text]` y')
  assert.equal(scrubText("name 'ひらがな' bad"), "name '[text]' bad")
  assert.equal(scrubText('emoji "🚀" bad'), 'emoji "[text]" bad')
  assert.equal(scrubText('한국어 "안녕하세요 세계" end'), '[text] "[text]" end')
  // useful identifiers survive
  assert.equal(scrubText('duplicate key value violates "tasks_pkey"'), 'duplicate key value violates "tasks_pkey"')
  assert.equal(scrubText("Cannot read properties of undefined (reading 'map')"), "Cannot read properties of undefined (reading 'map')")
  assert.equal(scrubText("can't read property 'foo' of undefined"), "can't read property 'foo' of undefined")
})

test('scrubText: unclosed quotes swallow the rest when non-ASCII follows', () => {
  const out = scrubText('Cannot find "今天要跟客戶')
  assert.equal(out, 'Cannot find "[text]')
  const pm = scrubText('Invalid content for node doc: <paragraph("今天要跟客戶開會討論報價…, text("明天")>')
  assert.ok(!/[^\x00-\x7F]/.test(pm), pm)
  assert.ok(pm.startsWith('Invalid content for node doc: <paragraph("[text]'), pm)
  // unclosed but ASCII-only after: untouched
  assert.equal(scrubText('say "hello'), 'say "hello')
})

test('scrubText: unquoted non-ASCII prose is masked, ASCII text kept', () => {
  assert.equal(scrubText('任務 失敗 at line 3'), '[text] [text] at line 3')
  assert.equal(scrubText('error 買 milk'), 'error [text] milk')
  assert.equal(scrubText('TypeError: x is not a function'), 'TypeError: x is not a function')
  assert.ok(!/[^\x00-\x7F]/.test(scrubText('Привет мир 你好 and مرحبا')))
})

test('scrubText truncates long text', () => {
  const out = scrubText('lorem ipsum '.repeat(60))
  assert.ok(out.length <= MAX_TEXT_LENGTH + '…[truncated]'.length)
  assert.ok(out.endsWith('[truncated]'))
})

test('scrubBreadcrumb sanitizes urls and drops console/ui crumbs', () => {
  assert.equal(scrubBreadcrumb({ category: 'console', message: 'secret' }), null)
  assert.equal(scrubBreadcrumb({ category: 'ui.click', message: 'secret' }), null)
  const c = scrubBreadcrumb({
    category: 'fetch',
    message: 'm',
    data: { url: 'data:image/png;base64,AAAAAAAA', method: 'GET', body: 'secret' },
  })
  assert.deepEqual(c.data, { url: 'data:[redacted]', method: 'GET' })
  assert.equal(c.message, undefined)
})

test('scrubEvent: stack frames, request, user, extra', () => {
  const ev = scrubEvent({
    message: 'oops "two words"',
    user: { id: 'u1', email: 'a@b.co' },
    extra: { secret: 1 },
    request: { url: 'https://huddle.lazy72.com/login?code=SECRETCODE123', headers: { 'User-Agent': 'UA', Cookie: 'c=1' } },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Not found: "Buy milk tomorrow"',
          stacktrace: {
            frames: [
              { filename: 'https://huddle.lazy72.com/login?code=SECRETCODE123', abs_path: 'https://huddle.lazy72.com/login?code=SECRETCODE123#h', function: 'f', context_line: 'secret()' },
            ],
          },
        },
      ],
    },
    threads: { values: [{ stacktrace: { frames: [{ filename: 'https://h.example/a?code=SECRETCODE123' }] } }] },
  })
  const json = JSON.stringify(ev)
  assert.ok(!json.includes('SECRETCODE123'), json)
  assert.ok(!json.includes('Buy milk'))
  assert.ok(!json.includes('secret()'))
  assert.equal(ev.user, undefined)
  assert.equal(ev.extra, undefined)
  assert.deepEqual(ev.request, { url: 'https://huddle.lazy72.com/login', headers: { 'User-Agent': 'UA' } })
  assert.equal(ev.exception.values[0].stacktrace.frames[0].filename, 'https://huddle.lazy72.com/login')
})
