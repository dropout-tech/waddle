import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = '/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui'
const svg = readFileSync(path.join(ROOT, 'public/icon.svg'), 'utf8')
// Full-bleed variant for the app icon: square background (iOS masks corners itself)
const fullBleed = svg.replace('rx="22"', 'rx="0"')

mkdirSync(path.join(ROOT, 'assets'), { recursive: true })

const browser = await chromium.launch()

// 1) icon-only.png — 1024×1024 full-bleed
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
  await page.setContent(`<body style="margin:0">${fullBleed.replace('<svg ', '<svg width="1024" height="1024" ')}</body>`)
  await page.screenshot({ path: path.join(ROOT, 'assets/icon-only.png') })
  await page.close()
}

// 2) splash.png — 2732×2732 cream background, rounded logo centered
{
  const page = await browser.newPage({ viewport: { width: 2732, height: 2732 } })
  await page.setContent(`<body style="margin:0;background:#fdf8ec;display:grid;place-items:center;width:2732px;height:2732px">${svg.replace('<svg ', '<svg width="480" height="480" ')}</body>`)
  await page.screenshot({ path: path.join(ROOT, 'assets/splash.png') })
  await page.close()
}

await browser.close()
console.log('rendered assets/icon-only.png + assets/splash.png')
