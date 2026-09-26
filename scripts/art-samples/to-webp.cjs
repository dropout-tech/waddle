// Dev-only: convert illustration JPGs to web-sized WebP (next.config has
// images.unoptimized, so we ship pre-sized files).
// node scripts/art-samples/to-webp.cjs <src> <dest.webp> [maxWidth=1600] [quality=78]
const path = require('node:path')
const fs = require('node:fs')
const pnpm = path.join(__dirname, '../../node_modules/.pnpm')
const dir = fs.readdirSync(pnpm).filter((d) => d.startsWith('sharp@')).sort().pop()
const sharp = require(path.join(pnpm, dir, 'node_modules/sharp'))
const [src, dest, w = '1600', q = '78'] = process.argv.slice(2)
fs.mkdirSync(path.dirname(dest), { recursive: true })
sharp(src)
  .resize({ width: Number(w), withoutEnlargement: true })
  .webp({ quality: Number(q), effort: 6 })
  .toFile(dest)
  .then((i) => console.log(path.basename(dest), i.width + 'x' + i.height, Math.round(i.size / 1024) + 'KB'))
