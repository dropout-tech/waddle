import { chromium } from 'playwright'
import { copyFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = '/Users/lazylazy/Desktop/琢奧科技/v0-task-management-ui'
const appIconPath = path.join(ROOT, 'assets/icon-only.png')
const appIconData = `data:image/png;base64,${readFileSync(appIconPath).toString('base64')}`

mkdirSync(path.join(ROOT, 'assets'), { recursive: true })
mkdirSync(path.join(ROOT, 'ios/App/App/public'), { recursive: true })
copyFileSync(
  path.join(ROOT, 'public/huddle-mascot.png'),
  path.join(ROOT, 'ios/App/App/public/huddle-mascot.png'),
)
copyFileSync(appIconPath, path.join(ROOT, 'public/app-icon.png'))
copyFileSync(appIconPath, path.join(ROOT, 'ios/App/App/public/app-icon.png'))

const browser = await chromium.launch({ channel: 'chrome' })

async function renderAsset({
  size,
  background,
  imageSize,
  output,
  sourceData = appIconData,
  tileSize = 0,
}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const image = `<img src="${sourceData}" alt="" style="display:block;width:${imageSize}px;height:${imageSize}px;object-fit:contain" />`
  const content = tileSize
    ? `<div style="display:grid;place-items:center;width:${tileSize}px;height:${tileSize}px;border-radius:22%;overflow:hidden">${image}</div>`
    : image
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
        <div style="display:grid;place-items:center;width:56px;height:56px;border-radius:13px;overflow:hidden">
          <img src="${appIconData}" alt="" style="display:block;width:56px;height:56px;object-fit:cover" />
        </div>
        <span style="color:#1f1a14;font:700 31px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-0.5px">Huddle</span>
      </div>
    </body>
  `)
  await page.locator('img').evaluate((img) => img.decode())
  await page.screenshot({ path: path.join(ROOT, 'public/placeholder-logo.png'), omitBackground: true })
  await page.close()
}

// Browser, PWA, and native web-shell icons all derive from the same approved
// 1024px App Icon master. Platform masks add their own corner treatment.
await renderAsset({ size: 512, background: '#fdf8ec', imageSize: 512, output: 'public/app-icon-512.png' })
await renderAsset({ size: 192, background: '#fdf8ec', imageSize: 192, output: 'public/app-icon-192.png' })
await renderAsset({ size: 180, background: '#fdf8ec', imageSize: 180, output: 'public/apple-icon.png' })
await renderAsset({ size: 32, background: '#fdf8ec', imageSize: 32, output: 'public/icon-light-32x32.png' })
await renderAsset({ size: 32, background: '#fdf8ec', imageSize: 32, output: 'public/icon-dark-32x32.png' })
await renderAsset({ size: 180, background: '#fdf8ec', imageSize: 180, output: 'ios/App/App/public/apple-icon.png' })
await renderAsset({ size: 32, background: '#fdf8ec', imageSize: 32, output: 'ios/App/App/public/icon-light-32x32.png' })
await renderAsset({ size: 32, background: '#fdf8ec', imageSize: 32, output: 'ios/App/App/public/icon-dark-32x32.png' })
await renderBrandLogo()

// Native launch screens use the approved App Icon on the committed light and
// dark shell colors. The artwork remains identical in both modes.
await renderAsset({ size: 2732, background: '#fdf8ec', imageSize: 650, tileSize: 650, output: 'assets/splash.png' })
await renderAsset({ size: 2732, background: '#2a2a2a', imageSize: 650, tileSize: 650, output: 'assets/splash-dark.png' })

await browser.close()
console.log('rendered Huddle App Icon, web/native logo, and light/dark splash assets')
