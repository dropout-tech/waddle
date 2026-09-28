/* eslint-disable no-console -- executable video player regression */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base = process.env.E2E_BASE_URL || 'http://localhost:3190'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const page = await context.newPage()
let passes = 0
const check = (label, value) => { assert.ok(value, label); console.log('PASS', label); passes++ }
const hasCJK = text => /[㐀-鿿豈-﫿]/.test(text)
try {
  for (const path of ['/film', '/about', '/en/film', '/en/about']) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const en = path.startsWith('/en')
    const labels = en
      ? { play: 'Play video', pause: 'Pause video', unmute: 'Turn sound on', mute: 'Turn sound off', replay: 'Play from start', download: 'Download video' }
      : { play: '開始播放', pause: '暫停影片', unmute: '開啟聲音', mute: '關閉聲音', replay: '從頭播放', download: '下載影片' }
    const video = page.locator('video')
    await video.waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1)
    check(`${path}: starts paused and muted with reduced motion`, await video.evaluate(v => v.paused && v.muted && !v.autoplay))
    check(`${path}: native controls and inline playback are enabled`, await video.evaluate(v => v.controls && v.playsInline && v.preload === 'metadata'))
    check(`${path}: no caption tracks (promo film has no dialogue)`, await video.evaluate(v => v.textTracks.length === 0) && await video.locator('track').count() === 0)
    check(`${path}: accessible label describes the promo film`, /promo film|宣傳片/.test(await video.getAttribute('aria-label') ?? ''))
    check(`${path}: duration is the ~44s promo, not the old 18s clip`, Math.abs((await video.evaluate(v => v.duration)) - 44.1) < 0.5)
    const section = page.locator('section').filter({ has: video })
    check(`${path}: download links to the 1080p promo MP4`, await section.getByRole('link', { name: labels.download }).getAttribute('href') === '/marketing/promo-film/huddle-promo-1080.mp4')
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
    const sectionText = await section.innerText()
    check(`${path}: text no longer describes the old 18-second film`, !sectionText.includes('18'))
    if (en) {
      check(`${path}: heading and description are English`, await section.getByRole('heading', { level: 2 }).innerText() === 'Give your scattered ideas\na place in your day.' && sectionText.includes('illustrated story'))
      check(`${path}: no Chinese UI text in the English film section`, !hasCJK(sectionText))
      if (path === '/en/film') check('English film links back to Chinese preview', await page.getByRole('link', { name: '繁體中文', exact: true }).getAttribute('href') === '/film')
    } else {
      check(`${path}: heading and notice are Chinese`, sectionText.includes('插畫故事'))
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
    const v = narrowPage.locator('video')
    await v.waitFor({ state: 'attached' })
    await narrowPage.waitForFunction(() => document.querySelector('video')?.readyState >= 1)
    check(`${width}px: video loads the ${expected} source`, (await v.evaluate(el => el.currentSrc)).includes(expected))
    await narrowContext.close()
  }

  console.log(`Feature film verification: ${passes} checks passed (${base}).`)
} finally { await context.close(); await browser.close() }
