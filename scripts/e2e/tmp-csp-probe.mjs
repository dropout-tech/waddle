import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage()
const csp = []; p.on('console', (m) => { if (/Content Security Policy|img-src/.test(m.text())) csp.push(m.text().slice(0, 140)) })
await p.goto(process.argv[2] || 'https://waddle.zeabur.app/login', { waitUntil: 'domcontentloaded' })
const r = await p.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res('loaded'); i.onerror = () => res('blocked/error'); i.src = 'https://lh3.googleusercontent.com/a/default-user=s96-c?x=' + Date.now() }))
await p.waitForTimeout(500); console.log('google image:', r); console.log('CSP errors:', csp.length, csp[0] || ''); await b.close()
