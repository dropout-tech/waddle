/* eslint-disable no-console -- media production CLI */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { resolve, extname, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from 'playwright'

const publicRoot = resolve('public')
const out = resolve('public/marketing/feature-film')
const fps = 30
const width = 1920, height = 1080
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wav': 'audio/wav' }
const server = createServer(async (req, res) => {
  try {
    const path = resolve(publicRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (!path.startsWith(publicRoot + '/')) { res.writeHead(403).end(); return }
    const data = await readFile(path)
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(data)
  } catch { res.writeHead(404).end() }
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
let encoder
try {
  await mkdir(out, { recursive: true })
  await stat(resolve(out, 'huddle-score.wav'))
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/marketing/feature-film/index.html', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.HuddleFilm)
  await page.evaluate(async () => { await window.HuddleFilm.ready; window.HuddleFilm.pause(); await document.fonts.ready })
  const duration = await page.evaluate(() => window.HuddleFilm.duration)
  const frameCount = Math.round(duration * fps)
  console.log(`Rendering ${duration}s, ${frameCount} frames, ${width}x${height}, ${fps}fps`)
  encoder = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-i', resolve(out, 'huddle-score.wav'), '-map', '0:v:0', '-map', '1:a:0', '-vf', 'pad=1920:1480:0:0:black', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(duration), '-movflags', '+faststart', resolve(out, 'huddle-feature-film.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] })
  let encoderError
  encoder.on('error', error => { encoderError = error })
  const completion = once(encoder, 'close')
  for (let frame = 0; frame < frameCount; frame++) {
    const data = await page.evaluate(async t => {
      await window.HuddleFilm.setTime(t)
      return document.querySelector('canvas').toDataURL('image/jpeg', .96).split(',')[1]
    }, frame / fps)
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) await once(encoder.stdin, 'drain')
    if (frame % 120 === 0) console.log(`Rendered ${frame}/${frameCount}`)
    if (encoderError) throw encoderError
  }
  encoder.stdin.end()
  const [code] = await completion
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
  for (const time of [0, 2.25, 4.875, 6.75, 9, 11.25, 13.5, 15.75, 17.625]) {
    const data = await page.evaluate(async t => { await window.HuddleFilm.setTime(t); return document.querySelector('canvas').toDataURL('image/png').split(',')[1] }, time)
    const target = resolve('/tmp/huddle-film-review', `frame-${time}.png`)
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, Buffer.from(data, 'base64'))
  }
  const poster = await page.evaluate(async () => { await window.HuddleFilm.setTime(6.75); return document.querySelector('canvas').toDataURL('image/jpeg', .94).split(',')[1] })
  const posterEncoder = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', 'pad=1920:1480:0:0:black', '-frames:v', '1', resolve(out, 'poster.jpg')], { stdio: ['pipe', 'inherit', 'inherit'] })
  const posterDone = once(posterEncoder, 'close')
  posterEncoder.stdin.end(Buffer.from(poster, 'base64'))
  if ((await posterDone)[0] !== 0) throw new Error('Poster encoding failed')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('Finished MP4 and poster with no browser errors.')
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGTERM')
  await browser.close(); server.close()
}
