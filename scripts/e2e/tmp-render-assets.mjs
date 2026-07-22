import { chromium } from 'playwright'
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = '/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui'
const mascotData = `data:image/png;base64,${readFileSync(path.join(ROOT, 'public/huddle-mascot.png')).toString('base64')}`

mkdirSync(path.join(ROOT, 'assets'), { recursive: true })
copyFileSync(
  path.join(ROOT, 'public/huddle-mascot.png'),
  path.join(ROOT, 'ios/App/App/public/huddle-mascot.png'),
)

const browser = await chromium.launch({ channel: 'chrome' })

async function renderAsset({ size, background, mascotSize, output, tileSize = 0 }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const mascot = `<img src="${mascotData}" alt="" style="display:block;width:${mascotSize}px;height:${mascotSize}px;object-fit:contain" />`
  const content = tileSize
    ? `<div style="display:grid;place-items:center;width:${tileSize}px;height:${tileSize}px;border-radius:22%;background:#f4d977">${mascot}</div>`
    : mascot
  await page.setContent(`
    <body style="margin:0;background:${background};display:grid;place-items:center;width:${size}px;height:${size}px;overflow:hidden">
      ${content}
    </body>
  `)
  await page.locator('img').evaluate((img) => img.decode())
  await page.screenshot({ path: path.join(ROOT, output) })
  await page.close()
}

async function renderBrandLogo() {
  const page = await browser.newPage({ viewport: { width: 256, height: 144 } })
  await page.setContent(`
    <body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;width:256px;height:144px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:grid;place-items:center;width:56px;height:56px;border-radius:13px;background:#f4d977">
          <img src="${mascotData}" alt="" style="display:block;width:50px;height:50px;object-fit:contain" />
        </div>
        <span style="color:#1f1a14;font:700 31px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-0.5px">Huddle</span>
      </div>
    </body>
  `)
  await page.locator('img').evaluate((img) => img.decode())
  await page.screenshot({ path: path.join(ROOT, 'public/placeholder-logo.png'), omitBackground: true })
  await page.close()
}

// iOS masks icon corners itself, so keep the brand-yellow source full bleed.
await renderAsset({ size: 1024, background: '#f4d977', mascotSize: 930, output: 'assets/icon-only.png' })
await renderAsset({ size: 180, background: '#f4d977', mascotSize: 164, output: 'public/apple-icon.png' })
await renderAsset({ size: 32, background: '#f4d977', mascotSize: 29, output: 'public/icon-light-32x32.png' })
await renderAsset({ size: 32, background: '#f4d977', mascotSize: 29, output: 'public/icon-dark-32x32.png' })
await renderAsset({ size: 180, background: '#f4d977', mascotSize: 164, output: 'ios/App/App/public/apple-icon.png' })
await renderAsset({ size: 32, background: '#f4d977', mascotSize: 29, output: 'ios/App/App/public/icon-light-32x32.png' })
await renderAsset({ size: 32, background: '#f4d977', mascotSize: 29, output: 'ios/App/App/public/icon-dark-32x32.png' })
await renderBrandLogo()

// Native launch screens use the same approved mascot on the committed light
// and dark shell colors. The source artwork remains identical in both.
await renderAsset({ size: 2732, background: '#fdf8ec', mascotSize: 560, tileSize: 650, output: 'assets/splash.png' })
await renderAsset({ size: 2732, background: '#2a2a2a', mascotSize: 560, tileSize: 650, output: 'assets/splash-dark.png' })

await browser.close()
console.log('rendered Huddle web/native icon, logo, and light/dark splash assets')
