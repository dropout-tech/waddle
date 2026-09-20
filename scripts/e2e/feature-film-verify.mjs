/* eslint-disable no-console -- executable video player regression */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3190'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
let passes = 0
const check = (label, value) => { assert.ok(value, label); console.log('PASS', label); passes++ }
try {
  for (const path of ['/film', '/about', '/en/film', '/en/about']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const en = path.startsWith('/en')
    const labels = en ? { play: 'Play video', pause: 'Pause video', unmute: 'Turn sound on', mute: 'Turn sound off', replay: 'Play from start', download: 'Download video' } : { play: '開始播放', pause: '暫停影片', unmute: '開啟聲音', mute: '關閉聲音', replay: '從頭播放', download: '下載影片' }
    const video = page.locator('video')
    await video.waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1)
    check(`${path}: starts paused and muted with reduced motion`, await video.evaluate(v => v.paused && v.muted && !v.autoplay))
    check(`${path}: native controls and inline playback are enabled`, await video.evaluate(v => v.controls && v.playsInline && v.preload === 'metadata'))
    const section = page.locator('section').filter({ has: video })
    const track = video.locator('track[default]')
    check(`${path}: correct default captions are available`, await track.getAttribute('src') === `/marketing/feature-film/captions${en ? '.en' : ''}.vtt` && await track.getAttribute('srclang') === (en ? 'en' : 'zh-TW') && await track.getAttribute('kind') === 'captions' && await track.getAttribute('default') !== null)
    check(`${path}: download links to the MP4`, await section.getByRole('link', { name: labels.download }).getAttribute('href') === `/marketing/feature-film/huddle-feature-film${en ? '-en' : ''}.mp4`)
    const play = section.getByRole('button', { name: labels.play, exact: true })
    await play.focus()
    check(`${path}: play button receives keyboard focus`, await play.evaluate(el => document.activeElement === el))
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime > 0.15 })
    check(`${path}: keyboard starts playback`, await section.getByRole('button', { name: labels.pause, exact: true }).isVisible())
    await section.getByRole('button', { name: labels.pause, exact: true }).click()
    check(`${path}: pause stops playback`, await video.evaluate(v => v.paused))
    await section.getByRole('button', { name: labels.unmute, exact: true }).click()
    check(`${path}: sound control unmutes the native player`, await video.evaluate(v => !v.muted))
    // Mutating the native media property dispatches the same volumechange
    // event used by the browser's built-in volume control.
    await video.evaluate(v => { v.muted = true })
    await section.getByRole('button', { name: labels.unmute, exact: true }).waitFor()
    check(`${path}: native mute changes update the sound button`, await section.getByRole('button', { name: labels.unmute, exact: true }).isVisible())
    await section.getByRole('button', { name: labels.unmute, exact: true }).click()
    await section.getByRole('button', { name: labels.mute, exact: true }).click()
    check(`${path}: sound control restores mute`, await video.evaluate(v => v.muted))
    await video.evaluate(v => { v.currentTime = 8 })
    const replay = section.getByRole('button', { name: labels.replay, exact: true })
    await replay.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.paused && v.currentTime < 2 })
    check(`${path}: keyboard replay returns to the start`, await video.evaluate(v => v.currentTime < 2))
    await section.getByRole('button', { name: labels.pause, exact: true }).click()
    await page.waitForFunction(() => [...document.querySelector('video').textTracks].some(track => track.mode === 'showing' && track.cues?.length > 0))
    check(`${path}: caption cues actually load`, await video.evaluate(v => [...v.textTracks].some(track => track.mode === 'showing' && track.cues?.length > 0)))
    if (en) {
      check(`${path}: heading and description are English`, await section.getByRole('heading', { level: 2 }).innerText() === 'Give your scattered ideas\na place in your day.' && (await section.innerText()).includes('Illustrated scenario, not a photo recognition feature.'))
      check(`${path}: Chinese captions remain available`, await video.locator('track[srclang="zh-TW"]').count() === 1)
      if (path === '/en/film') check('English film links back to Chinese preview', await page.getByRole('link', { name: '繁體中文', exact: true }).getAttribute('href') === '/film')
    }
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await section.scrollIntoViewIfNeeded()
      check(`${path}: no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      if (path === '/film') await page.screenshot({ path: `/tmp/huddle-film-page-${width}.png`, fullPage: true })
    }
  }
  console.log(`Feature film verification: ${passes} checks passed (${base}).`)
} finally { await context.close(); await browser.close() }
