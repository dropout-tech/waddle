// Dev-only: average colour of a region. node sample-color.cjs img left top width height
const path = require('node:path')
const fs = require('node:fs')
const pnpm = path.join(__dirname, '../../node_modules/.pnpm')
const dir = fs.readdirSync(pnpm).filter((d) => d.startsWith('sharp@')).sort().pop()
const sharp = require(path.join(pnpm, dir, 'node_modules/sharp'))
const [src, left, top, width, height] = process.argv.slice(2)
sharp(src)
  .extract({ left: +left, top: +top, width: +width, height: +height })
  .stats()
  .then((s) => {
    const hex = s.channels.slice(0, 3).map((c) => Math.round(c.mean).toString(16).padStart(2, '0')).join('')
    console.log(src.split('/').pop(), `#${hex}`)
  })
