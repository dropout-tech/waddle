import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

for (const name of ['a', 'b', 'c']) {
  await page.goto('file://' + path.join(dir, `mockup-${name}.html`))
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(dir, `mockup-${name}.png`) })
  console.log(`shot: mockup-${name}.png`)
}
await browser.close()
