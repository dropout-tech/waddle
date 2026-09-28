/* eslint-disable no-console -- executable video player regression */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3190'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
// Returning visitor: skip the first-visit intro gate on /about (it has its own check).
await context.addInitScript(() => { try { localStorage.setItem('huddle-intro-seen', '1') } catch {} })
const page = await context.newPage()
let passes = 0
const check = (label, value) => { assert.ok(value, label); console.log('PASS', label); passes++ }
// The promo film player (the page also has the silent #promo-loop band video).
const FILM = 'video[poster$="huddle-promo-poster.jpg"]'
const hasCJK = text => /[㐀-鿿豈-﫿]/.test(text)
try {
  for (const path of ['/film', '/about', '/en/film', '/en/about']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const en = path.startsWith('/en')
    const labels = en
      ? { play: 'Play video', pause: 'Pause video', replay: 'Play from start' }
      : { play: '開始播放', pause: '暫停影片', replay: '從頭播放' }
    const video = page.locator(FILM)
    await video.waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('video[poster$="huddle-promo-poster.jpg"]')?.readyState >= 1)
    check(`${path}: starts paused, not autoplaying, with sound on (not muted)`, await video.evaluate(v => v.paused && !v.muted && !v.autoplay))
    check(`${path}: native controls and inline playback are enabled`, await video.evaluate(v => v.controls && v.playsInline && v.preload === 'metadata'))
    check(`${path}: no caption tracks (promo film has no dialogue)`, await video.evaluate(v => v.textTracks.length === 0) && await video.locator('track').count() === 0)
    check(`${path}: accessible label describes the promo film`, /promo film|宣傳片/.test(await video.getAttribute('aria-label') ?? ''))
    check(`${path}: duration is the ~44s promo, not the old 18s clip`, Math.abs((await video.evaluate(v => v.duration)) - 44.1) < 0.5)
    const section = page.locator('section').filter({ has: video })
    check(`${path}: no mute toggle and no download link (sound lives in the native controls)`, await section.getByRole('button', { name: /聲音|sound/i }).count() === 0 && await section.locator('a[download], a[href$=".mp4"]').count() === 0)
    const play = section.getByRole('button', { name: labels.play, exact: true })
    await play.focus()
    check(`${path}: play button receives keyboard focus`, await play.evaluate(el => document.activeElement === el))
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const v = document.querySelector('video[poster$="huddle-promo-poster.jpg"]'); return v && !v.paused && v.currentTime > 0.15 })
    check(`${path}: keyboard starts playback with sound`, await section.getByRole('button', { name: labels.pause, exact: true }).isVisible() && await video.evaluate(v => !v.muted))
    await section.getByRole('button', { name: labels.pause, exact: true }).click()
    check(`${path}: pause stops playback`, await video.evaluate(v => v.paused))
    await video.evaluate(v => { v.currentTime = 8 })
    const replay = section.getByRole('button', { name: labels.replay, exact: true })
    await replay.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => { const v = document.querySelector('video[poster$="huddle-promo-poster.jpg"]'); return v && !v.paused && v.currentTime < 2 })
    check(`${path}: keyboard replay returns to the start`, await video.evaluate(v => v.currentTime < 2))
    await section.getByRole('button', { name: labels.pause, exact: true }).click()
    const sectionText = await section.innerText()
    check(`${path}: text no longer describes the old 18-second film`, !sectionText.includes('18'))
    if (en) {
      check(`${path}: heading and description are English`, await section.getByRole('heading', { level: 2 }).innerText() === 'When time keeps chasing you,\nwhat do you do?' && sectionText.includes('An animated story') && sectionText.includes('best with sound on'))
      check(`${path}: no Chinese UI text in the English film section`, !hasCJK(sectionText))
      if (path === '/en/film') check('English film links back to Chinese preview', await page.getByRole('link', { name: '繁體中文', exact: true }).getAttribute('href') === '/film')
    } else {
      check(`${path}: heading and notice are Chinese`, await section.getByRole('heading', { level: 2 }).innerText() === '時間追著你跑的時候，\n你會怎麼辦？' && sectionText.includes('動畫故事') && sectionText.includes('建議開聲音觀看'))
    }
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await section.scrollIntoViewIfNeeded()
      check(`${path}: no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  // Responsive source selection: the browser picks the <source> that
  // matches on load, so this needs a fresh navigation per viewport rather
  // than resizing an already-loaded page.
  for (const [width, expected] of [[390, 'huddle-promo-720'], [1440, 'huddle-promo-1080']]) {
    const narrowContext = await browser.newContext({ viewport: { width, height: 900 } })
    const narrowPage = await narrowContext.newPage()
    await narrowPage.goto(base + '/film', { waitUntil: 'domcontentloaded', timeout: 60000 })
    const v = narrowPage.locator(FILM)
    await v.waitFor({ state: 'attached' })
    await narrowPage.waitForFunction(() => document.querySelector('video[poster$="huddle-promo-poster.jpg"]')?.readyState >= 1)
    check(`${width}px: video loads the ${expected} source`, (await v.evaluate(el => el.currentSrc)).includes(expected))
    await narrowContext.close()
  }

  console.log(`Feature film verification: ${passes} checks passed (${base}).`)
} finally { await context.close(); await browser.close() }
