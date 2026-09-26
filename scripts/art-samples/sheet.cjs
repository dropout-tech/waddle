// Dev-only: contact sheet of illustrations. node scripts/art-samples/sheet.cjs out.jpg file1 file2 ...
const path = require('node:path')
const fs = require('node:fs')
const pnpm = path.join(__dirname, '../../node_modules/.pnpm')
const dir = fs.readdirSync(pnpm).filter((d) => d.startsWith('sharp@')).sort().pop()
const sharp = require(path.join(pnpm, dir, 'node_modules/sharp'))
const [out, ...files] = process.argv.slice(2)
;(async () => {
  const T = 300
  const cols = 4
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(T, T, { fit: 'contain', background: '#fff' }).toBuffer()))
  await sharp({ create: { width: T * cols, height: T * Math.ceil(files.length / cols), channels: 3, background: '#fff' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * T, top: Math.floor(i / cols) * T })))
    .jpeg()
    .toFile(out)
})()
