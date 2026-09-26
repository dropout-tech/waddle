'use client'

/*
 * Penguin circus — the absurd layer of the public site.
 * Story (feature film): one busy penguin splits into five, zips through
 * devices, merges back into one Huddle, and ends up napping in a hammock.
 *
 * - <HeroSwarm>      five penguins run and bonk in the hero, then merge.
 * - <RoamingPenguin> the merged penguin lives on: it hops between
 *                    `[data-penguin-stop]` anchors as you scroll, skates on
 *                    the calendar, runs laps on the focus ring, naps in the
 *                    footer hammock; click it for a random absurd reaction.
 * - <FoldVignette>   chat bubbles fold into a task card that flies into the
 *                    phone (moreFeatures poster).
 * - <FocusRing>      timer ring that fills as you scroll past it.
 * - <Hammock>        footer nap spot.
 *
 * Only transform/opacity animate (no layout shift). All layers are
 * aria-hidden and never focusable; only the roaming penguin's body takes
 * pointer events. prefers-reduced-motion → static placements (CSS) and no JS
 * loops. Native/desktop shells never run any of it.
 *
 * Stop anchors: data-penguin-stop, data-penguin-at="fx fy [dx dy]" (fractions
 * of the element box + px offsets; the point is where the penguin's FEET go),
 * optional data-penguin-at-m (≤760px), data-penguin-pose, data-penguin-motion
 * (skate | orbit | pace), data-penguin-nap (hide the roamer on arrival and set
 * data-occupied on the stop).
 */

import { useEffect, useRef } from 'react'
import { isDesktop, isNative } from '@/lib/platform'
import styles from './penguin-circus.module.css'

export const POSES = ['stand', 'slide', 'fly', 'wave', 'skate', 'sleep', 'carry', 'open', 'chomp', 'full', 'yawn', 'phone', 'flag', 'shades', 'splat'] as const
type Pose = (typeof POSES)[number]
const src = (p: Pose) => `/art/penguin/${p}.webp`
const FACES_RIGHT = new Set<Pose>(['slide', 'fly', 'skate'])
// Each stop's base pose rotates through a few moods so no visit looks the same.
const VARIANTS: Partial<Record<Pose, Pose[]>> = {
  stand: ['stand', 'phone', 'shades', 'flag'],
  wave: ['wave', 'flag', 'shades'],
  carry: ['carry', 'phone', 'flag'],
}
export const headlineClass = styles.headline
export const fishZoneClass = styles.fishZone
export const posterStageClass = styles.posterStage
export const focusStageClass = styles.focusStage

const words = {
  zh: { pop: '啪！', honk: '嘎！', burp: '嗝～', full: '吃飽了…', thanks: '謝謝魚！', eep: '嚇！', oops: '哎呀', cool: '帥吧', done: '搞定！', cards: ['買魚', '回 87 封信', '跟自己開會', '午睡 20 分鐘', '假裝很忙', '把企鵝收好'], bubbles: ['週四開會？', '三點可以', '我帶簡報'], card: '週四 15:00 團隊會議' },
  en: { pop: 'POP!', honk: 'HONK!', burp: '*burp*', full: 'So full…', thanks: 'Thanks for the fish!', eep: 'EEP!', oops: 'Oops', cool: 'Cool.', done: 'Done!', cards: ['Buy fish', 'Reply to 87 emails', 'Meeting with myself', '20-min nap', 'Look busy', 'Put penguins away'], bubbles: ['Meet Thursday?', '3pm works', "I'll bring slides"], card: 'Thu 3:00 PM · Team sync' },
} as const
type Locale = keyof typeof words

const MERGED = 'huddle:merged'
const noMotion = () => typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || isNative() || isDesktop()
const mobile = () => window.innerWidth <= 760

/* ───────────────────────────── Hero swarm ───────────────────────────── */

const SWARM_POSES: Pose[] = ['slide', 'fly', 'skate', 'carry', 'wave']

export function HeroSwarm({ locale = 'zh' }: { locale?: Locale }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const layer = ref.current
    const hero = layer?.parentElement
    if (!layer || !hero) return
    const headline = hero.querySelector<HTMLElement>(`.${styles.headline}`)
    if (noMotion()) return
    // Visitors who land mid-page (anchor links, restored scroll) skip the show.
    if (window.scrollY > hero.offsetHeight * 0.5) { headline?.setAttribute('data-merged', ''); window.dispatchEvent(new CustomEvent(MERGED)); return }

    const birds = Array.from(layer.querySelectorAll<HTMLElement>(`.${styles.swarmBird}`))
    const W = hero.clientWidth, H = hero.clientHeight
    const small = mobile()
    const S = small ? 50 : 68
    layer.style.setProperty('--s', `${S}px`)
    // run area (feet positions): the scene side of the hero
    const box = small
      ? { x0: W * 0.08, x1: W * 0.92, y0: H * 0.62, y1: H * 0.97 }
      : { x0: W * 0.46, x1: W * 0.97, y0: H * 0.42, y1: H * 0.95 }
    const M = small ? { x: W * 0.62, y: H * 0.9 } : { x: W * 0.74, y: H * 0.86 }
    const speed = (small ? 260 : 440) * (0.85 + Math.random() * 0.3)
    const b = birds.map((el, i) => {
      const a = (i / birds.length) * Math.PI * 2 + Math.random() * 0.6
      return { el, img: el.querySelector('img')!, x: M.x, y: M.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.7, spin: 0, lastBonk: 0 }
    })
    const bonk = (x: number, y: number) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      s.setAttribute('viewBox', '0 0 34 34'); s.setAttribute('class', styles.bonk); s.setAttribute('aria-hidden', 'true')
      s.innerHTML = '<path d="M17 2l3.6 9.4L30 8l-5 8.6L32 22l-9.6.4L20 32l-3-9-7 6 1.4-9.6L2 17l9-3.4L8 5l8.4 4.6z" fill="#edc747" stroke="#292b24" stroke-width="2" stroke-linejoin="round"/>'
      layer.appendChild(s)
      s.animate([{ transform: `translate(${x}px,${y}px) scale(.2) rotate(0)`, opacity: 1 }, { transform: `translate(${x}px,${y - 26}px) scale(1.25) rotate(40deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${x}px,${y - 40}px) scale(.8) rotate(70deg)`, opacity: 0 }], { duration: 520, easing: 'ease-out' }).finished.then(() => s.remove(), () => s.remove())
    }
    const place = (o: (typeof b)[number], hop: number, rot: number, flip: number) => {
      o.el.style.transform = `translate3d(${o.x - S / 2}px,${o.y - S - hop}px,0)`
      o.img.style.transform = `scaleX(${flip}) rotate(${rot}deg)`
    }

    const T_SPLIT = 420, T_CONVERGE = 3500, T_MERGE = 4150
    let raf = 0, t0 = 0, last = 0, cancelled = false
    headline?.setAttribute('data-chaos', '')
    b.forEach((o, i) => { o.img.src = src(i === 0 ? 'stand' : SWARM_POSES[i]); place(o, 0, 0, 1) })
    b[0].el.setAttribute('data-live', '')

    const frame = (now: number) => {
      if (cancelled) return
      if (!t0) { t0 = now; last = now }
      // scrolled away mid-show → skip straight to the merge
      if (now - t0 < T_CONVERGE && hero.getBoundingClientRect().bottom < 80) t0 = now - T_MERGE
      const t = now - t0, dt = Math.min(0.04, (now - last) / 1000)
      last = now
      if (t < T_SPLIT) {
        const k = Math.min(1, t / 260)
        b[0].el.style.transform = `translate3d(${M.x - S / 2}px,${M.y - S}px,0) scale(${0.3 + 0.7 * k})`
      } else if (t < T_CONVERGE) {
        if (!b[1].el.hasAttribute('data-live')) b.forEach((o, i) => { o.el.setAttribute('data-live', ''); o.img.src = src(SWARM_POSES[i]) })
        for (const o of b) {
          o.x += o.vx * dt; o.y += o.vy * dt
          if (o.x < box.x0) { o.x = box.x0; o.vx = Math.abs(o.vx) } else if (o.x > box.x1) { o.x = box.x1; o.vx = -Math.abs(o.vx) }
          if (o.y < box.y0) { o.y = box.y0; o.vy = Math.abs(o.vy) } else if (o.y > box.y1) { o.y = box.y1; o.vy = -Math.abs(o.vy) }
        }
        for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
          const p = b[i], q = b[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy)
          if (d > 0 && d < S * 0.78) {
            const nx = dx / d, ny = dy / d, rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny
            if (rel > 0) { // approaching → elastic bounce (equal mass)
              p.vx -= rel * nx; p.vy -= rel * ny; q.vx += rel * nx; q.vy += rel * ny
              p.spin = 360; q.spin = -360
              if (now - p.lastBonk > 250) { p.lastBonk = now; bonk((p.x + q.x) / 2, (p.y + q.y) / 2 - S * 0.6) }
            }
          }
        }
        for (const o of b) {
          o.spin *= 0.9
          const hop = Math.abs(Math.sin((t + o.x) / 70)) * (small ? 6 : 10)
          place(o, hop, o.spin + o.vy * 0.02, o.vx < 0 ? -1 : 1)
        }
      } else if (t < T_MERGE) {
        const k = (t - T_CONVERGE) / (T_MERGE - T_CONVERGE), e = k * k
        for (const o of b) { o.x += (M.x - o.x) * e; o.y += (M.y - o.y) * e; place(o, 0, k * 540, 1) }
      } else {
        // POP: the five become one; hand over to the roaming penguin
        b.forEach(o => o.el.removeAttribute('data-live'))
        const r = hero.getBoundingClientRect()
        const ring = document.createElement('div'); ring.className = styles.poof; layer.appendChild(ring)
        ring.animate([{ transform: `translate(${M.x}px,${M.y - S / 2}px) scale(.2)`, opacity: 1 }, { transform: `translate(${M.x}px,${M.y - S / 2}px) scale(1.4)`, opacity: 0 }], { duration: 480, easing: 'ease-out' }).finished.then(() => ring.remove(), () => ring.remove())
        headline?.removeAttribute('data-chaos')
        headline?.setAttribute('data-merged', '')
        window.dispatchEvent(new CustomEvent(MERGED, { detail: { x: r.left + M.x, y: r.top + M.y } }))
        return
      }
      raf = requestAnimationFrame(frame)
    }
    const start = window.setTimeout(() => { raf = requestAnimationFrame(frame) }, 500)
    return () => { cancelled = true; clearTimeout(start); cancelAnimationFrame(raf); headline?.removeAttribute('data-chaos') }
  }, [])

  return (
    <div ref={ref} className={styles.swarm} aria-hidden="true">
      {SWARM_POSES.map(p => (
        // eslint-disable-next-line @next/next/no-img-element
        <div key={p} className={styles.swarmBird}><img src={src(p)} alt="" width={240} height={240} decoding="async" draggable={false} /></div>
      ))}
      {/* reduced motion: a static huddle; clicking it only shows a speech bubble */}
      <div className={styles.swarmStatic} data-say={words[locale].thanks} onClick={e => { const el = e.currentTarget; el.setAttribute('data-fed', ''); window.setTimeout(() => el.removeAttribute('data-fed'), 1600) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {(['slide', 'wave', 'stand', 'carry', 'skate'] as Pose[]).map((p, i) => <img key={i} src={src(p)} alt="" width={240} height={240} loading="lazy" />)}
      </div>
    </div>
  )
}

/* ─────────────────────────── Roaming penguin ─────────────────────────── */

type Stop = { el: HTMLElement; at: number[]; atM?: number[]; pose: Pose; motion?: string; nap: boolean }
const parse = (v?: string) => (v ? v.trim().split(/\s+/).map(Number) : undefined)

export function RoamingPenguin({ locale = 'zh' }: { locale?: Locale }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current, fx = fxRef.current
    if (!root || !fx || noMotion()) return
    const w = words[locale]
    const body = root.querySelector<HTMLElement>(`.${styles.roamBody}`)!
    const inner = root.querySelector<HTMLElement>(`.${styles.roamInner}`)!
    const imgs = new Map<Pose, HTMLImageElement>()
    root.querySelectorAll<HTMLImageElement>('img[data-pose]').forEach(i => imgs.set(i.dataset.pose as Pose, i))
    let pose: Pose = 'stand'
    const setPose = (p: Pose) => {
      if (p === pose) return
      imgs.get(pose)?.removeAttribute('data-on'); imgs.get(p)?.setAttribute('data-on', '')
      pose = p; root.dataset.pose = p
    }
    imgs.get('stand')?.setAttribute('data-on', ''); root.dataset.pose = 'stand'

    let S = mobile() ? 60 : 84
    const setSize = () => { S = mobile() ? 60 : 84; root.style.setProperty('--s', `${S}px`); fx.style.setProperty('--s', `${S}px`) }
    setSize()

    let stops: Stop[] = []
    const collect = () => {
      const only = mobile() ? 'desktop' : 'mobile'
      stops = Array.from(document.querySelectorAll<HTMLElement>('[data-penguin-stop]')).filter(el => el.dataset.penguinOnly !== only).map(el => ({
        el, at: parse(el.dataset.penguinAt) ?? [0.5, 0.5], atM: parse(el.dataset.penguinAtM),
        pose: (el.dataset.penguinPose as Pose) || 'stand', motion: el.dataset.penguinMotion, nap: el.dataset.penguinNap !== undefined,
      }))
    }
    collect()
    const anchor = (s: Stop, r: DOMRect) => {
      const a = (mobile() && s.atM) || s.at
      return { x: r.left + r.width * a[0] + (a[2] ?? 0), y: r.top + r.height * a[1] + (a[3] ?? 0) }
    }

    let x = window.innerWidth * 0.78, y = window.innerHeight * 0.8
    let awake = false
    let active: Stop | null = null, picked = 0
    let prevScroll = window.scrollY
    let travelPose: Pose = 'slide', travelUntil = 0
    let facing = 1, flipSmooth = 1
    let busyUntil = 0
    const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0 }
    const flee = { x: 0, y: 0 }
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches

    const wake = (e?: Event) => {
      if (awake) return
      const d = (e as CustomEvent | undefined)?.detail as { x: number; y: number } | undefined
      if (d) { x = d.x; y = d.y }
      awake = true; root.setAttribute('data-awake', '')
    }
    window.addEventListener(MERGED, wake)
    const fallback = window.setTimeout(() => wake(), 6500)

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const now = performance.now(), dt = Math.max(8, now - ptr.t) / 1000
      ptr.vx = (e.clientX - ptr.x) / dt; ptr.vy = (e.clientY - ptr.y) / dt
      ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = now
    }
    const onLeave = () => { ptr.x = -9999; ptr.y = -9999 }
    if (fine) { window.addEventListener('pointermove', onMove, { passive: true }); document.documentElement.addEventListener('pointerleave', onLeave) }
    const onResize = () => { setSize(); collect() }
    window.addEventListener('resize', onResize)

    /* ── reactions ── */
    let reaction = 0
    const say = (text: string) => {
      const el = document.createElement('div'); el.className = styles.say; el.textContent = text; fx.appendChild(el)
      const sx = x - 20, sy = y - S - 34
      el.animate([{ transform: `translate(${sx}px,${sy + 10}px) scale(.4) rotate(-8deg)`, opacity: 0 }, { transform: `translate(${sx}px,${sy}px) scale(1.1) rotate(-4deg)`, opacity: 1, offset: 0.2 }, { transform: `translate(${sx}px,${sy - 6}px) scale(1) rotate(-4deg)`, opacity: 1, offset: 0.8 }, { transform: `translate(${sx}px,${sy - 16}px) scale(1) rotate(-4deg)`, opacity: 0 }], { duration: 1000, easing: 'ease-out' }).finished.then(() => el.remove(), () => el.remove())
    }
    const split = () => {
      busyUntil = performance.now() + 1250
      const bx = x - S / 2, by = y - S, R = S * 1.5
      inner.animate([{ opacity: 1 }, { opacity: 0, offset: 0.08 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }], { duration: 1200 })
      const kinds: Pose[] = ['fly', 'slide', 'wave', 'carry', 'skate']
      kinds.forEach((p, i) => {
        const img = document.createElement('img'); img.src = src(p); img.alt = ''; img.className = styles.clone; fx.appendChild(img)
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2, ox = Math.cos(a) * R, oy = Math.sin(a) * R * 0.7, r = (i % 2 ? 1 : -1) * 25
        img.animate([
          { transform: `translate(${bx}px,${by}px) scale(.5)`, opacity: 0 },
          { transform: `translate(${bx + ox}px,${by + oy}px) scale(1) rotate(${r}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${bx + ox * 1.15}px,${by + oy * 1.15}px) scale(1) rotate(${-r}deg)`, opacity: 1, offset: 0.7 },
          { transform: `translate(${bx}px,${by}px) scale(.6) rotate(0)`, opacity: 0 },
        ], { duration: 1150, easing: 'cubic-bezier(.3,.7,.4,1)' }).finished.then(() => img.remove(), () => img.remove())
      })
      window.setTimeout(() => {
        const ring = document.createElement('div'); ring.className = styles.poof; fx.appendChild(ring)
        ring.animate([{ transform: `translate(${x}px,${y - S / 2}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x}px,${y - S / 2}px) scale(1.3)`, opacity: 0 }], { duration: 420, easing: 'ease-out' }).finished.then(() => ring.remove(), () => ring.remove())
        say(w.pop)
      }, 1080)
    }
    const toss = () => {
      busyUntil = performance.now() + 500
      const el = document.createElement('div'); el.className = styles.thrown
      el.textContent = w.cards[Math.floor(Math.random() * w.cards.length)]
      fx.appendChild(el)
      const dir = x > window.innerWidth / 2 ? -1 : 1
      const dist = (mobile() ? 110 : 200) + Math.random() * 80, peak = 150 + Math.random() * 60
      const x0 = x - 30, y0 = y - S, frames: Keyframe[] = []
      for (let i = 0; i <= 10; i++) {
        const k = i / 10
        frames.push({ transform: `translate(${x0 + dir * dist * k}px,${y0 - peak * 4 * k * (1 - k) + 40 * k}px) rotate(${dir * 400 * k}deg) scale(${0.5 + 0.5 * Math.min(1, k * 3)})`, opacity: 1, offset: k * 0.55 })
      }
      frames.push({ transform: `translate(${x0 + dir * dist}px,${y0 + 40}px) rotate(${dir * 368}deg)`, opacity: 1, offset: 0.62 })
      frames.push({ transform: `translate(${x0 + dir * dist}px,${y0 + 40}px) rotate(${dir * 368}deg)`, opacity: 1, offset: 0.9 })
      frames.push({ transform: `translate(${x0 + dir * dist}px,${y0 + 60}px) rotate(${dir * 368}deg)`, opacity: 0 })
      el.animate(frames, { duration: 2200, easing: 'linear' }).finished.then(() => el.remove(), () => el.remove())
      setPose('carry')
    }
    const honk = () => {
      busyUntil = performance.now() + 750
      body.animate([{ transform: body.style.transform }, { transform: `${body.style.transform} translateY(-70px) rotate(180deg)`, offset: 0.45 }, { transform: `${body.style.transform} translateY(-70px) rotate(360deg)`, offset: 0.55 }, { transform: body.style.transform }], { duration: 720, easing: 'cubic-bezier(.3,.6,.4,1)', composite: 'replace' })
      say(w.honk)
    }
    const hop = (h = 18, ms = 420) => body.animate([{ transform: 'none' }, { transform: `translateY(-${h}px) scale(1.05, .95)`, offset: 0.4 }, { transform: 'none' }], { duration: ms, easing: 'ease-out' })
    const slip = () => {
      busyUntil = performance.now() + 1500
      holdPose('splat', 950)
      body.animate([{ transform: 'none' }, { transform: 'translateX(14px) rotate(-14deg)', offset: 0.2 }, { transform: 'translateX(24px)', offset: 0.55 }, { transform: 'translateX(24px)', offset: 0.85 }, { transform: 'none' }], { duration: 1400, easing: 'ease-out' })
      window.setTimeout(() => { say(w.oops); holdPose('stand', 400); hop(22) }, 1000)
    }
    const cool = () => { busyUntil = performance.now() + 1500; holdPose('shades', 1500); hop(10, 360); window.setTimeout(() => say(w.cool), 250) }
    const flagWave = () => {
      holdPose('flag', 1900)
      body.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], { duration: 480, iterations: 3, easing: 'ease-in-out' })
    }
    const scare = () => {
      busyUntil = performance.now() + 1700
      const b = document.createElement('span'); b.className = styles.soap; fx.appendChild(b)
      const bx = x + S * 0.55, by = y - S * 0.3
      b.animate([
        { transform: `translate(${bx}px,${by}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${bx - 6}px,${by - 30}px) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${bx - 18}px,${by - 52}px) scale(1.05)`, opacity: 1, offset: 0.62 },
        { transform: `translate(${bx - 18}px,${by - 52}px) scale(1.7)`, opacity: 0 },
      ], { duration: 1150, easing: 'ease-out' }).finished.then(() => b.remove(), () => b.remove())
      window.setTimeout(() => { holdPose('open', 650); hop(34, 380); say(w.eep) }, 720)
    }
    const IDLES: Array<() => void> = [
      () => holdPose('yawn', 1500),
      () => holdPose('phone', 2300),
      flagWave, cool, slip, scare,
    ]
    let lastIdle = -1, nextIdleAt = performance.now() + 6000
    const idle = () => {
      let i = Math.floor(Math.random() * IDLES.length)
      if (i === lastIdle) i = (i + 1) % IDLES.length
      lastIdle = i; IDLES[i]()
    }
    const onCheer = () => {
      if (!awake || performance.now() < busyUntil) return
      busyUntil = performance.now() + 1200
      holdPose('flag', 1200); hop(26)
    }
    window.addEventListener('huddle:cheer', onCheer)
    /* ── feeding (the main click reaction, 2026-09-26) ──
       A fish flies from the click point in an arc into the open beak; each
       fish makes the penguin rounder; the 4th one sits it down, full, for a
       short nap, then it slims back down over time. */
    let fat = 0, fatS = 0, lastFed = 0
    const hold = { pose: 'stand' as Pose, until: 0 }
    const holdPose = (p: Pose, ms: number) => { hold.pose = p; hold.until = performance.now() + ms; setPose(p) }
    const burst = (cx: number, cy: number) => {
      for (let i = 0; i < 5; i++) {
        const el = document.createElement('span'); el.className = i % 2 ? styles.spark : styles.heart; el.textContent = i % 2 ? '✦' : '♥'; fx.appendChild(el)
        const a = -Math.PI / 2 + (i - 2) * 0.55, d = 46 + Math.random() * 26
        el.animate([
          { transform: `translate(${cx}px,${cy}px) scale(.3)`, opacity: 0 },
          { transform: `translate(${cx + Math.cos(a) * d * 0.6}px,${cy + Math.sin(a) * d * 0.6}px) scale(1.15)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${cx + Math.cos(a) * d}px,${cy + Math.sin(a) * d - 14}px) scale(.8)`, opacity: 0 },
        ], { duration: 760, easing: 'ease-out', delay: i * 40 }).finished.then(() => el.remove(), () => el.remove())
      }
    }
    const gulp = () => {
      const now = performance.now()
      fat = Math.min(4, fat + 1); lastFed = now
      holdPose('chomp', 620)
      body.animate([{ transform: 'none' }, { transform: 'translateY(-18px) scale(1.06, .95)', offset: 0.4 }, { transform: 'none' }], { duration: 440, easing: 'ease-out' })
      burst(x, y - S * 0.9)
      if (fat >= 4) {
        busyUntil = now + 5600
        window.setTimeout(() => { say(w.full); holdPose('full', 2300) }, 620)
        window.setTimeout(() => holdPose('sleep', 2600), 2920)
        window.setTimeout(() => { fat = 1; lastFed = performance.now() }, 5500)
      } else if (fat === 2 || Math.random() < 0.3) window.setTimeout(() => say(w.burp), 520)
    }
    const feed = (fromX: number, fromY: number) => {
      busyUntil = performance.now() + 1250
      holdPose('open', 640)
      const el = document.createElement('div'); el.className = styles.fish
      el.innerHTML = '<svg viewBox="0 0 36 24" width="44" height="30" aria-hidden="true"><path d="M3 12c5-8 15-9 22-3l7-6v18l-7-6c-7 6-17 5-22-3z" fill="#cf5731" stroke="#292b24" stroke-width="2.4" stroke-linejoin="round"/><circle cx="10" cy="10.5" r="2" fill="#292b24"/></svg>'
      fx.appendChild(el)
      const mx = x, my = y - S * 0.6, dx = mx - fromX, dy = my - fromY
      const peak = Math.max(110, Math.min(230, Math.hypot(dx, dy) * 0.45 + 90))
      // a click right on the penguin tosses the fish up and over, not in place
      const side = Math.abs(dx) < 50 ? (fromX > window.innerWidth / 2 ? -70 : 70) : 0
      const dir = (dx || side) >= 0 ? 1 : -1, frames: Keyframe[] = []
      for (let i = 0; i <= 12; i++) {
        const k = i / 12
        frames.push({ transform: `translate(${fromX + dx * k + side * Math.sin(Math.PI * k) - 6}px,${fromY + dy * k - peak * 4 * k * (1 - k) - 15}px) rotate(${dir * 400 * k}deg) scale(${1 - 0.45 * k})` })
      }
      el.animate(frames, { duration: 560, easing: 'linear' }).finished.then(() => { el.remove(); gulp() }, () => el.remove())
    }
    const INTERACTIVE = 'a,button,input,textarea,select,label,summary,video,[role=tab],[role=button],[contenteditable]'
    const onClick = (e: MouseEvent) => {
      if (!awake || performance.now() < busyUntil || root.hasAttribute('data-hidden') || root.hasAttribute('data-peek')) return
      const onBird = body.contains(e.target as Node)
      if (!onBird) {
        // mouse users can also toss from nearby empty space (never from UI)
        if (!fine || (e.target as Element).closest?.(INTERACTIVE) || window.getSelection()?.toString()) return
        if (Math.hypot(e.clientX - x, e.clientY - (y - S / 2)) > 280) return
      }
      if (onBird && Math.random() < 0.25) {
        const others = [split, toss, honk, slip, cool, scare]
        others[(reaction++ + Math.floor(Math.random() * others.length)) % others.length]()
        return
      }
      feed(e.clientX, e.clientY)
    }
    document.addEventListener('click', onClick)

    /* ── main loop ── */
    let variantFor: Stop | null = null, variant: Pose = 'stand'
    const lastVariant = new WeakMap<HTMLElement, Pose>()
    let raf = 0, last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (!awake) return
      const vw = window.innerWidth, vh = window.innerHeight
      const scroll = window.scrollY, sd = scroll - prevScroll; prevScroll = scroll
      if (now - picked > 180) {
        picked = now
        let best: Stop | null = null, bd = Infinity
        for (const s of stops) {
          const r = s.el.getBoundingClientRect()
          if (!r.height) continue
          const d = Math.abs(anchor(s, r).y - vh * 0.52)
          if (d < bd) { bd = d; best = s }
        }
        active = best
      }
      let tx = vw - S, ty = vh - 12, stopPose: Pose = 'stand', rot = 0, motionFacing = 0
      let napping = false
      if (active) {
        const r = active.el.getBoundingClientRect(), a = anchor(active, r), ts = now / 1000
        tx = a.x; ty = a.y
        if (active !== variantFor) {
          variantFor = active
          const pool = VARIANTS[active.pose] ?? [active.pose], prev = lastVariant.get(active.el)
          let v = pool[Math.floor(Math.random() * pool.length)]
          if (pool.length > 1 && v === prev) v = pool[(pool.indexOf(v) + 1) % pool.length]
          lastVariant.set(active.el, v); variant = v
          nextIdleAt = now + 4500 + Math.random() * 4000
        }
        stopPose = variant
        if (active.motion === 'skate') {
          const rx = Math.min(r.width * 0.3, 170), ry = rx * 0.2
          tx += Math.sin(ts * 1.3) * rx; ty += Math.sin(ts * 2.6) * ry; motionFacing = Math.cos(ts * 1.3) >= 0 ? 1 : -1
          rot = Math.cos(ts * 1.3) * 8
        } else if (active.motion === 'orbit') {
          const R = r.width * 0.46, ang = ts * 1.1
          tx = r.left + r.width / 2 + Math.cos(ang) * R; ty = r.top + r.height / 2 + Math.sin(ang) * R
          rot = (ang * 180) / Math.PI + 90; motionFacing = 1
        } else if (active.motion === 'pace') {
          tx += Math.sin(ts * 0.8) * 70; motionFacing = Math.cos(ts * 0.8) >= 0 ? 1 : -1
        }
        napping = active.nap
      }
      // pointer: slow approach → curious; fast lunge → flee
      let fleeing = false
      if (fine && ptr.x > -999) {
        const dx = x - ptr.x, dy = y - S / 2 - ptr.y, d = Math.hypot(dx, dy)
        const toward = -(ptr.vx * dx + ptr.vy * dy) / Math.max(d, 1)
        const want = d < 150 && toward > 700 && now - ptr.t < 120
        if (want) { flee.x = (dx / d) * 150; flee.y = (dy / d) * 110; fleeing = true }
      }
      flee.x *= Math.exp(-dt * 1.6); flee.y *= Math.exp(-dt * 1.6)
      if (Math.hypot(flee.x, flee.y) > 25) { fleeing = true; napping = false }
      tx += flee.x; ty += flee.y
      // off-screen anchors: peek from the viewport edge
      let peek = 0
      const m = 8
      tx = Math.min(vw - S / 2 - m, Math.max(S / 2 + m, tx))
      if (ty > vh + S * 0.1) { ty = vh + S * 0.42; peek = 1 } else if (ty < S * 0.4) { ty = -S * 0.42; peek = -1 } else ty = Math.min(vh - 4, Math.max(S + 4, ty))
      const busy = now < busyUntil
      if (!busy) {
        const k = 1 - Math.exp(-dt * (active?.motion ? 7 : 5))
        const nx = x + (tx - x) * k, ny = y + (ty - y) * k
        const vx = (nx - x) / dt, dvy = (ny - y) / dt + sd / dt // velocity relative to the page
        x = nx; y = ny
        if (Math.hypot(vx, dvy) > 480 && !peek) { travelPose = Math.abs(dvy) > Math.abs(vx) * 1.1 ? (dvy < 0 ? 'fly' : 'carry') : 'slide'; travelUntil = now + 300 }
        const traveling = now < travelUntil
        const near = Math.hypot(tx - x, ty - y) < 26
        if (traveling || fleeing) hold.until = 0
        const p: Pose = fleeing ? 'fly' : traveling ? travelPose : peek ? 'stand' : now < hold.until ? hold.pose : stopPose
        if (!(pose === 'carry' && now < busyUntil + 500 && !traveling)) setPose(p)
        // idle mood: only when parked at a still stop and nothing else is going on
        if (near && !traveling && !fleeing && !peek && !napping && !active?.motion && now > hold.until) {
          if (now > nextIdleAt) { idle(); nextIdleAt = now + 6500 + Math.random() * 5000 }
        } else if (now > nextIdleAt - 2500) nextIdleAt = now + 2500
        // facing: movement > motion script > look at the pointer
        if (Math.abs(vx) > 60) facing = vx > 0 ? 1 : -1
        else if (motionFacing && near) facing = motionFacing
        else if (fine && ptr.x > -999 && Math.hypot(ptr.x - x, ptr.y - y) < 320) facing = ptr.x > x ? 1 : -1
        if (traveling && travelPose === 'fly') rot = Math.max(-18, Math.min(18, vx * 0.02))
        else if (traveling && travelPose === 'carry') rot = Math.sin(now / 90) * 9
        else if (!(near && active?.motion)) rot = 0
        const hide = napping && near && !traveling
        root.toggleAttribute('data-hidden', hide)
        stops.forEach(s => { if (s.nap) s.el.toggleAttribute('data-occupied', hide && s === active) })
      }
      if (busy && now < hold.until) { setPose(hold.pose); rot = 0 } else if (now < hold.until) rot = 0
      if (fat > 0 && !busy && now - lastFed > 9000) { fat--; lastFed = now }
      fatS += (fat - fatS) * Math.min(1, dt * 6)
      root.toggleAttribute('data-peek', peek !== 0)
      flipSmooth += ((FACES_RIGHT.has(pose) ? facing : 1) - flipSmooth) * Math.min(1, dt * 14)
      const fl = Math.abs(flipSmooth) < 0.12 ? 0.12 * Math.sign(flipSmooth || 1) : flipSmooth
      root.style.transform = `translate3d(${x - S / 2}px,${y - S}px,0)`
      if (!busy || pose !== 'carry') inner.style.transform = `${peek < 0 ? 'rotate(180deg) ' : ''}rotate(${rot}deg) scaleX(${fl}) scale(${1 + fatS * 0.08},${1 + fatS * 0.025})`
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf); clearTimeout(fallback)
      window.removeEventListener(MERGED, wake); window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('click', onClick); window.removeEventListener('huddle:cheer', onCheer)
      fx.replaceChildren()
    }
  }, [locale])

  return (
    <>
      <div ref={rootRef} className={styles.roam} aria-hidden="true">
        <div className={styles.roamBody}>
          <div className={styles.roamInner}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {POSES.map(p => <img key={p} data-pose={p} src={src(p)} alt="" width={240} height={240} className={styles.pose} decoding="async" draggable={false} />)}
          </div>
          <span className={styles.zzz}><span>z</span><span>z</span><span>Z</span></span>
        </div>
      </div>
      <div ref={fxRef} className={styles.fx} aria-hidden="true" />
    </>
  )
}

/* ────────────── Section vignettes (in-flow, absolutely positioned) ────────────── */

/** Plays only while on screen (IntersectionObserver toggles data-play). */
function usePlayWhenVisible<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || noMotion()) return
    const io = new IntersectionObserver(([e]) => el.toggleAttribute('data-play', e.isIntersecting), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return ref
}

export function FoldVignette({ locale = 'zh' }: { locale?: Locale }) {
  const ref = usePlayWhenVisible<HTMLDivElement>()
  const w = words[locale]
  return (
    <div ref={ref} className={styles.fold} data-fold="" aria-hidden="true">
      <span className={`${styles.bubble} ${styles.b1}`}>{w.bubbles[0]}</span>
      <span className={`${styles.bubble} ${styles.b2}`}>{w.bubbles[1]}</span>
      <span className={`${styles.bubble} ${styles.b3}`}>{w.bubbles[2]}</span>
      <span className={styles.foldCard}>{w.card}</span>
      <span className={styles.ding} />
    </div>
  )
}

/** Timer ring around the focus art; fills (25:00 → 00:00) as you scroll past. */
export function FocusRing() {
  const ref = useRef<SVGSVGElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const svg = ref.current, time = timeRef.current, stage = svg?.parentElement
    if (!svg || !time || !stage || noMotion()) return
    let raf = 0, visible = false
    const update = () => {
      raf = 0
      if (stage.hasAttribute('data-toy-running')) return // the focus toy is driving the ring
      const r = stage.getBoundingClientRect(), vh = window.innerHeight
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height * 0.6)))
      stage.style.setProperty('--p', p.toFixed(3))
      const left = Math.round((1 - p) * 25 * 60)
      time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
    }
    const onScroll = () => { if (visible && !raf) raf = requestAnimationFrame(update) }
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) onScroll() })
    io.observe(stage)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return (
    <>
      <svg ref={ref} className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
        <circle className={styles.ringTrack} cx="18" cy="18" r="16" pathLength={100} />
        <circle className={styles.ringFill} cx="18" cy="18" r="16" pathLength={100} />
      </svg>
      <span ref={timeRef} className={styles.ringTime} data-ring-time="" aria-hidden="true">25:00</span>
    </>
  )
}

export function Hammock() {
  return (
    <div className={styles.hammock} data-penguin-stop="hammock" data-penguin-at="0.5 0.78" data-penguin-pose="sleep" data-penguin-nap="" aria-hidden="true">
      <div className={styles.hammockSwing}>
        <svg viewBox="0 0 190 96" preserveAspectRatio="none">
          <circle cx="6" cy="8" r="5" fill="none" stroke="#292b24" strokeWidth="3" />
          <circle cx="184" cy="8" r="5" fill="none" stroke="#292b24" strokeWidth="3" />
          <path d="M9 12 L38 46 M181 12 L152 46" stroke="#292b24" strokeWidth="2.5" fill="none" />
          <path d="M34 44 Q95 104 156 44 Q95 72 34 44 Z" fill="#edc747" stroke="#292b24" strokeWidth="3" strokeLinejoin="round" />
          <path d="M52 56 Q95 86 138 56 M70 52 L74 68 M95 54 L95 75 M120 52 L116 68" stroke="#292b24" strokeWidth="1.6" fill="none" opacity=".55" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.hammockBird} src={src('sleep')} alt="" width={240} height={240} loading="lazy" />
        <span className={styles.zzz}><span>z</span><span>z</span><span>Z</span></span>
      </div>
    </div>
  )
}
