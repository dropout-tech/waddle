// Dev-only: side-by-side compare of two full-page screenshots.
// node scripts/art-samples/compare.cjs left.png right.png out.png colWidth "left label" "right label"
const path = require('node:path')
const fs = require('node:fs')
const pnpm = path.join(__dirname, '../../node_modules/.pnpm')
const dir = fs.readdirSync(pnpm).filter((d) => d.startsWith('sharp@')).sort().pop()
const sharp = require(path.join(pnpm, dir, 'node_modules/sharp'))
const [a, b, out, w = '720', la = 'before', lb = 'after'] = process.argv.slice(2)
const W = Number(w)
const PAD = 24
const HEAD = 64
;(async () => {
  const imgs = await Promise.all([a, b].map((f) => sharp(f).resize({ width: W }).png().toBuffer({ resolveWithObject: true })))
  const H = Math.max(...imgs.map((i) => i.info.height)) + HEAD + PAD
  const label = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HEAD}"><text x="0" y="42" font-family="PingFang TC, Helvetica" font-size="30" font-weight="700" fill="#292b24">${t}</text></svg>`)
  await sharp({ create: { width: W * 2 + PAD * 3, height: H, channels: 3, background: '#dcd8cc' } })
    .composite([
      { input: label(la), left: PAD, top: 0 },
      { input: label(lb), left: PAD * 2 + W, top: 0 },
      { input: imgs[0].data, left: PAD, top: HEAD },
      { input: imgs[1].data, left: PAD * 2 + W, top: HEAD },
    ])
    .png()
    .toFile(out)
  console.log(out, W * 2 + PAD * 3, 'x', H)
})()
