// Stitch current / paper / sketch screenshots into side-by-side compare sheets.
// node scripts/art-samples/compose.mjs            -> every compare-<shot>-<w>.png
// node scripts/art-samples/compose.mjs sheet a.png b.png ... out.png  -> contact sheet
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.env.OUT_DIR
if (!OUT) throw new Error('OUT_DIR required')

const toData = (p) => `data:image/${p.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${fs.readFileSync(p).toString('base64')}`

async function render(page, cells, outFile, colWidth) {
  const html = `<!doctype html><html><body style="margin:0;background:#dcd8cc;font:600 22px system-ui">
  <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
  ${cells
    .map(
      ([label, p]) => `<figure style="margin:0;width:${colWidth}px">
      <figcaption style="padding:0 0 10px;color:#292b24">${label}</figcaption>
      ${p && fs.existsSync(p) ? `<img src="${toData(p)}" style="width:100%;display:block;border:1px solid #9a968a">` : '<div style="height:200px;border:2px dashed #9a968a">missing</div>'}
    </figure>`,
    )
    .join('')}
  </div></body></html>`
  await page.setContent(html)
  await page.waitForTimeout(150)
  const el = await page.$('div')
  await el.screenshot({ path: outFile })
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 2400, height: 1000 } })
try {
  if (process.argv[2] === 'sheet') {
    const files = process.argv.slice(3, -1)
    const out = process.argv[process.argv.length - 1]
    await render(page, files.map((f) => [path.basename(f), f]), out, 360)
  } else {
    const shots = ['home', 'features', 'login', 'login-dark', 'app', 'app-dark', 'empty']
    for (const s of shots) {
      for (const w of [1440, 390]) {
        const cells = ['current', 'paper', 'sketch'].map((m) => [
          `${m}  ·  ${s}  ·  ${w}px`,
          path.join(OUT, `${m}-${s}-${w}.png`),
        ])
        const col = w === 1440 ? 760 : 390
        await render(page, cells, path.join(OUT, `compare-${s}-${w}.png`), col)
      }
    }
  }
} finally {
  await browser.close()
}
console.log('composed')
