const assert = require('node:assert/strict')
const http = require('node:http')
const { _electron: electron } = require('playwright')

async function main() {
  assert.equal(process.platform, 'win32', 'Run this smoke test on Windows')
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Huddle Windows smoke</title><h1>Huddle Windows</h1><button onclick="window.open(location.origin + \'/floating-host.html\', \'_blank\')">Open floating window</button>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let app
  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    app = await electron.launch({ executablePath: process.argv[2], env: { ...process.env, HUDDLE_APP_URL: origin } })
    const page = await app.firstWindow()
    await page.waitForFunction(() => window.huddleDesktop?.isDesktop)
    assert.equal(await page.evaluate(() => window.huddleDesktop.platform), 'win32')
    assert.equal(await page.evaluate(() => typeof require), 'undefined')
    const status = await page.evaluate(() => window.huddleDesktop.notificationStatus())
    console.log('Native notification capability:', status)
    const oauth = await page.evaluate(() => window.huddleDesktop.beginOAuth())
    assert.ok(oauth)
    await page.evaluate(() => window.huddleDesktop.cancelOAuth())
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.minimize(); w.restore() })
    const childPromise = app.waitForEvent('window')
    await page.locator('button').click()
    const child = await childPromise
    await child.waitForFunction(() => window.huddleDesktop?.isDesktop)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => w.isAlwaysOnTop())), true)
    await child.close()
    await page.screenshot({ path: 'release/desktop/windows-smoke.png' })
    console.log('PASS: installed executable launches, renderer/preload IPC, OAuth begin/cancel, minimize/restore')
  } finally {
    if (app) await app.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
