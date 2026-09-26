'use client'

/*
 * Magic toys (2026-09-26 boss brief): one pressable, absurd toy per feature
 * chapter. They riff on real features but are NOT the features — every toy is
 * decorative (stage aria-hidden) with a real, labelled <button> and a polite
 * live-region status.
 *
 * Wiring: <ToyButton toy> dispatches `huddle:toy` (detail = toy); the
 * matching <ToyStage toy> (absolutely positioned inside the chapter's art)
 * plays and answers `huddle:toy-done`. Only transform/opacity animate
 * (WAAPI), no rAF except the 2.4s focus ring run. prefers-reduced-motion:
 * every move jumps straight to its end state (see `mv`), so the result still
 * shows, without motion.
 */

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import styles from './magic-toys.module.css'

type Locale = 'zh' | 'en'
export type Toy = 'chores' | 'sort' | 'focus' | 'meeting'
const EV = 'huddle:toy', DONE = 'huddle:toy-done'

const copy = {
  zh: {
    btn: { chores: '把雜事丟進來', sort: '幫我排好', focus: '開始專注（加速版）', meeting: '丟一段會議進來', stamp: '今天簽到' },
    status: { chores: '六件雜事，疊好蓋章了。', sort: '時間塊都排進格子了。', focus: '專注完成，放個煙火。', meeting: '會議變成三張任務卡了。' },
    chores: ['回 87 封信', '繳電話費', '買貓砂', '找遙控器', '整理桌面', '打給媽媽', '報帳', '回群組訊息', '洗衣服', '澆那盆快死的植物'],
    doneStamp: '搞定', sorted: '排好了！', week: ['一', '二', '三', '四', '五'],
    notes: ['新訊息 (99+)', '限時特價！', '你被標記了', '要不要開個會？', '電量 3%'], focused: '專注完成！',
    garble: ['#%&會？', '嗯…那個', '所以誰負責', '@@!!', '下週？', '…', 'ok ok', '+1', '欸等等', '我先靜音'],
    tasks: ['週四前交提案', 'Amy 訂會議室', '下週一再對一次'], filed: '三件事，收好了',
    days: ['一', '二', '三', '四', '五', '六', '日'], here: '到！', legend: '超級到！', pa: '啪！', checkinTitle: '每日簽到', checkinHint: '連按會越蓋越誇張',
  },
  en: {
    btn: { chores: 'Dump my chores', sort: 'Sort my week', focus: 'Start focus (fast-forward)', meeting: 'Toss in a meeting', stamp: 'Check in today' },
    status: { chores: 'Six chores, stacked and stamped.', sort: 'Every block snapped into the week.', focus: 'Focus done. Fireworks.', meeting: 'The meeting became three task cards.' },
    chores: ['Reply to 87 emails', 'Pay phone bill', 'Buy cat litter', 'Find the remote', 'Clear the desk', 'Call mom', 'File expenses', 'Answer group chat', 'Laundry', 'Water the sad plant'],
    doneStamp: 'DONE', sorted: 'Sorted!', week: ['M', 'T', 'W', 'T', 'F'],
    notes: ['New messages (99+)', 'Flash sale!', 'You were tagged', 'Quick call?', 'Battery 3%'], focused: 'Focused!',
    garble: ['#%&mtg?', 'umm so', 'who owns it', '@@!!', 'next wk?', '…', 'ok ok', '+1', 'wait wait', 'brb muted'],
    tasks: ['Proposal due Thu', 'Amy books the room', 'Re-sync next Monday'], filed: 'Three tasks, filed',
    days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], here: 'HERE!', legend: 'LEGENDARY', pa: 'THWACK!', checkinTitle: 'Daily check-in', checkinHint: 'Keep pressing. It escalates.',
  },
} as const

/* ── helpers ── */
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, reduced() ? Math.min(ms, 80) : ms))
/** how long a finished result stays up — never shortened, reduced motion included */
const hold = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const shuffle = <T,>(a: readonly T[]) => [...a].sort(() => Math.random() - 0.5)
function mv(el: Element, frames: Keyframe[], o: KeyframeAnimationOptions = {}) {
  if (reduced()) { const f = frames[frames.length - 1]; return el.animate([f, f], { duration: 1, fill: 'forwards' }).finished.then(() => {}, () => {}) }
  return el.animate(frames, { fill: 'forwards', easing: 'cubic-bezier(.3,.7,.3,1)', ...o }).finished.then(() => {}, () => {})
}
function mk(parent: Element, cls: string, text?: string) {
  const e = document.createElement('div'); e.className = cls
  if (text) e.textContent = text
  parent.appendChild(e); return e
}
const at = (x: number, y: number, extra = '') => `translate(${x}px,${y}px) translate(-50%,-50%) ${extra}`
const cheer = () => window.dispatchEvent(new CustomEvent('huddle:cheer'))
const shake = (el: HTMLElement, amp: number, ms = 260) => { if (!reduced()) el.animate([{ transform: 'none' }, { transform: `translate(${amp}px,${-amp / 2}px)` }, { transform: `translate(${-amp}px,${amp / 2}px)` }, { transform: `translate(${amp / 2}px,0)` }, { transform: 'none' }], { duration: ms }) }
async function fadeOut(els: Element[], ms = 380) { await Promise.all(els.map(e => mv(e, [{ opacity: 0 }], { duration: ms, easing: 'ease-in' }))); els.forEach(e => e.remove()) }
async function intoView(stage: HTMLElement) {
  const r = stage.getBoundingClientRect()
  if (r.top < 0 || r.bottom > window.innerHeight) { stage.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); await wait(450) }
}
function label(stage: HTMLElement, text: string, x: number, y: number) {
  const l = mk(stage, styles.label, text)
  return mv(l, [{ transform: at(x, y, 'scale(.4) rotate(-8deg)'), opacity: 0 }, { transform: at(x, y, 'scale(1) rotate(-4deg)'), opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' }).then(() => l)
}

/* ── the plays ── */
type Play = (stage: HTMLElement, t: (typeof copy)[Locale]) => Promise<void>

const chores: Play = async (stage, t) => {
  const W = stage.clientWidth, H = stage.clientHeight, cx = W / 2, baseY = H * 0.66
  const cards = shuffle(t.chores).slice(0, 6).map(txt => mk(stage, styles.card, txt))
  await Promise.all(cards.map((c, i) => {
    const px = cx + rnd(-W * 0.3, W * 0.3), py = baseY + rnd(-H * 0.2, H * 0.12), r = rnd(-32, 32)
    return mv(c, [{ transform: at(px, -40, `rotate(${r * 4}deg)`), opacity: 0 }, { transform: at(px, py, `rotate(${r}deg)`), opacity: 1 }], { duration: 620, delay: i * 110, easing: 'cubic-bezier(.45,1.45,.5,1)' })
  }))
  await wait(450)
  await Promise.all(cards.map((c, i) => mv(c, [{ transform: at(cx, baseY - i * 7, `rotate(${rnd(-2.5, 2.5)}deg)`), opacity: 1 }], { duration: 320, delay: i * 60 })))
  const stamp = mk(stage, styles.stamp, t.doneStamp)
  await mv(stamp, [{ transform: at(cx + 30, baseY - 44, 'scale(2.6) rotate(-30deg)'), opacity: 0 }, { transform: at(cx + 30, baseY - 44, 'scale(1) rotate(-12deg)'), opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,1.4,.4,1)' })
  shake(stage, 5); cheer()
  await hold(1600)
  await fadeOut([...cards, stamp])
}

const sort: Play = async (stage, t) => {
  const W = stage.clientWidth, H = stage.clientHeight
  const sheet = mk(stage, styles.sheet)
  sheet.innerHTML = t.week.map(d => `<b>${d}</b>`).join('') + '<i></i>'.repeat(15)
  await mv(sheet, [{ transform: 'translateY(18px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300 })
  const s = stage.getBoundingClientRect()
  const cells = shuffle(Array.from(sheet.querySelectorAll('i'))).slice(0, 7).map(c => { const r = c.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height } })
  const blocks = cells.map((c, i) => { const b = mk(stage, `${styles.block} ${styles['b' + (i % 4)]}`); b.style.width = `${c.w - 6}px`; b.style.height = `${c.h - 6}px`; return b })
  // scatter: blocks tumble around above the sheet
  await Promise.all(blocks.map((b, i) => mv(b, [{ transform: at(W / 2, H * 0.4, 'scale(0)'), opacity: 0 }, { transform: at(rnd(W * 0.12, W * 0.88), rnd(H * 0.06, H * 0.42), `rotate(${rnd(-70, 70)}deg) scale(1.2)`), opacity: 1 }], { duration: 380, delay: i * 45, easing: 'cubic-bezier(.3,1.4,.5,1)' })))
  if (!reduced()) blocks.forEach(b => b.animate([{ rotate: '0deg' }, { rotate: '14deg' }, { rotate: '-14deg' }, { rotate: '0deg' }], { duration: 520, iterations: 2, composite: 'add' }))
  await wait(700)
  // swoosh: each block snaps into its day
  await Promise.all(blocks.map((b, i) => mv(b, [{ transform: at(cells[i].x, cells[i].y, 'rotate(0deg) scale(1)'), opacity: 1 }], { duration: 460, delay: i * 110, easing: 'cubic-bezier(.3,1.55,.5,1)' })))
  const l = await label(stage, t.sorted, W * 0.72, H * 0.5)
  cheer()
  await hold(1700)
  await fadeOut([sheet, ...blocks, l])
}

const focus: Play = async (stage, t) => {
  const host = stage.parentElement as HTMLElement
  const time = host.querySelector<HTMLElement>('[data-ring-time]')
  host.setAttribute('data-toy-running', '')
  const W = stage.clientWidth, H = stage.clientHeight, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44
  const shield = mk(stage, styles.shield)
  shield.style.width = shield.style.height = `${R * 2}px`
  mv(shield, [{ transform: at(cx, cy, 'scale(.2)'), opacity: 0 }, { transform: at(cx, cy, 'scale(1)'), opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1.4,.4,1)' })
  // the ring: a fast-forward 25:00 → 00:00 lap
  const lap = new Promise<void>(res => {
    if (reduced()) { host.style.setProperty('--p', '1'); if (time) time.textContent = '00:00'; return res() }
    const t0 = performance.now(), D = 2400
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / D), left = Math.round((1 - p) * 1500)
      host.style.setProperty('--p', p.toFixed(3))
      if (time) time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
      if (p < 1) requestAnimationFrame(tick); else res()
    }
    requestAnimationFrame(tick)
  })
  const notes = t.notes.map(n => mk(stage, styles.note, n))
  const bounce = Promise.all(notes.map(async (n, i) => {
    const a = rnd(0, Math.PI * 2), far = R * 1.9, hit = R * 1.02
    await mv(n, [{ transform: at(cx + Math.cos(a) * far, cy + Math.sin(a) * far), opacity: 0 }, { transform: at(cx + Math.cos(a) * hit, cy + Math.sin(a) * hit), opacity: 1 }], { duration: 380, delay: 200 + i * 300, easing: 'ease-in' })
    shake(shield, 3, 160)
    await mv(n, [{ transform: at(cx + Math.cos(a) * far * 1.25, cy + Math.sin(a) * far * 1.25, `rotate(${rnd(-90, 90)}deg)`), opacity: 0 }], { duration: 440, easing: 'ease-out' })
    n.remove()
  }))
  await Promise.all([lap, bounce])
  // fireworks
  const colors = ['#cf5731', '#edc747', '#292b24', '#f6f3e9']
  const sparks: HTMLElement[] = []
  const bursts = [0, 1, 2].map(async k => {
    await wait(k * 180)
    const bx = cx + rnd(-R * 0.8, R * 0.8), by = cy - R * rnd(0.5, 1.05)
    await Promise.all(Array.from({ length: 12 }, (_, i) => {
      const s = mk(stage, styles.spark); s.style.background = colors[i % 4]; sparks.push(s)
      const a = (i / 12) * Math.PI * 2, d = rnd(48, 78)
      return mv(s, [{ transform: at(bx, by, 'scale(.4)'), opacity: 1 }, { transform: at(bx + Math.cos(a) * d, by + Math.sin(a) * d, 'scale(1)'), opacity: 1, offset: 0.7 }, { transform: at(bx + Math.cos(a) * d * 1.2, by + Math.sin(a) * d * 1.2 + 14, 'scale(.6)'), opacity: 0 }], { duration: 760, easing: 'ease-out' })
    }))
  })
  const l = await label(stage, t.focused, cx, cy + R * 0.2)
  cheer()
  await Promise.all(bursts)
  await hold(1500)
  await fadeOut([shield, l, ...sparks])
  host.removeAttribute('data-toy-running')
  window.dispatchEvent(new Event('scroll')) // hand the ring back to scroll progress
}

const meeting: Play = async (stage, t) => {
  const fold = stage.parentElement?.querySelector<HTMLElement>('[data-fold]')
  fold?.setAttribute('data-toy', '')
  const W = stage.clientWidth, H = stage.clientHeight, cx = W * 0.48, cy = H * 0.15, phone = { x: W * 0.57, y: H * 0.38 }
  const chips = t.garble.map(g => mk(stage, styles.garble, g))
  const R = W * 0.34
  await Promise.all(chips.map((c, i) => {
    const a0 = (i / chips.length) * Math.PI * 2, frames: Keyframe[] = [{ transform: at(cx, cy, 'scale(.2)'), opacity: 0 }]
    for (let k = 0; k <= 10; k++) {
      const a = a0 + (k / 10) * Math.PI * 2.5, r = R * (0.75 + 0.25 * Math.sin(k + i))
      frames.push({ transform: at(cx + Math.cos(a) * r, cy + H * 0.06 + Math.sin(a) * r * 0.42, `rotate(${k * 36 * (i % 2 ? 1 : -1)}deg)`), opacity: 1 })
    }
    frames.push({ transform: at(cx, cy + H * 0.1, 'scale(.1) rotate(0)'), opacity: 0 })
    return mv(c, frames, { duration: 1700, delay: i * 30, easing: 'linear' })
  }))
  chips.forEach(c => c.remove())
  const cards = t.tasks.map(x => mk(stage, styles.card, x))
  await Promise.all(cards.map((c, i) => mv(c, [{ transform: at(cx, cy + H * 0.1, 'scale(.2)'), opacity: 0 }, { transform: at(W * 0.5, H * (0.5 + i * 0.075), `rotate(${(i - 1) * 3}deg)`), opacity: 1 }], { duration: 340, delay: i * 90, easing: 'cubic-bezier(.2,1.4,.4,1)' })))
  await wait(700)
  await Promise.all(cards.map((c, i) => mv(c, [
    { transform: at(W * 0.5, H * (0.5 + i * 0.075), `rotate(${(i - 1) * 3}deg)`), opacity: 1 },
    { transform: at(W * 0.78, H * 0.3, 'scale(.6) rotate(20deg)'), opacity: 1, offset: 0.55 },
    { transform: at(phone.x, phone.y, 'scale(.12) rotate(30deg)'), opacity: 0 },
  ], { duration: 620, delay: i * 260, easing: 'ease-in' })))
  const ding = mk(stage, styles.ding)
  mv(ding, [{ transform: at(phone.x, phone.y, 'scale(.2)'), opacity: 1 }, { transform: at(phone.x, phone.y, 'scale(1.7)'), opacity: 0 }], { duration: 520, easing: 'ease-out' })
  const l = await label(stage, t.filed, W * 0.5, H * 0.62)
  cheer()
  await hold(1500)
  await fadeOut([...cards, ding, l])
  fold?.removeAttribute('data-toy')
}

const PLAYS: Record<Toy, Play> = { chores, sort, focus, meeting }

/* ── components ── */

export function ToyButton({ toy, locale = 'zh' }: { toy: Toy; locale?: Locale }) {
  const t = copy[locale]
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    const done = (e: Event) => { if ((e as CustomEvent).detail === toy) { setBusy(false); setStatus(t.status[toy]) } }
    window.addEventListener(DONE, done)
    return () => window.removeEventListener(DONE, done)
  }, [toy, t])
  useEffect(() => { if (!busy) return; const id = window.setTimeout(() => setBusy(false), 9000); return () => clearTimeout(id) }, [busy])
  return (
    <div className={styles.toyRow}>
      <button type="button" className={styles.toyBtn} aria-busy={busy} onClick={() => { if (busy) return; setBusy(true); setStatus(''); window.dispatchEvent(new CustomEvent(EV, { detail: toy })) }}>
        <Sparkles size={18} aria-hidden="true" />{t.btn[toy]}
      </button>
      <span className={styles.sr} role="status">{status}</span>
    </div>
  )
}

export function ToyStage({ toy, locale = 'zh' }: { toy: Toy; locale?: Locale }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stage = ref.current
    if (!stage) return
    let running = false
    const onToy = async (e: Event) => {
      if ((e as CustomEvent).detail !== toy || running) return
      running = true
      try { await intoView(stage); await PLAYS[toy](stage, copy[locale]) } finally {
        running = false
        window.dispatchEvent(new CustomEvent(DONE, { detail: toy }))
      }
    }
    window.addEventListener(EV, onToy)
    return () => { window.removeEventListener(EV, onToy); stage.replaceChildren() }
  }, [toy, locale])
  return <div ref={ref} className={styles.stage} aria-hidden="true" />
}

/** Daily check-in: each press stamps today harder; the 5th is LEGENDARY. */
export function CheckInToy({ locale = 'zh' }: { locale?: Locale }) {
  const t = copy[locale]
  const card = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const n = useRef(0)
  const [today, setToday] = useState(-1)
  const [status, setStatus] = useState('')
  useEffect(() => { setToday((new Date().getDay() + 6) % 7) }, [])
  const press = () => {
    const c = card.current, l = layer.current
    if (!c || !l) return
    const cell = c.querySelector<HTMLElement>('[data-today]')
    if (n.current >= 5) { l.replaceChildren(); n.current = 0 }
    const k = ++n.current, legend = k === 5
    const cr = c.getBoundingClientRect(), r = cell?.getBoundingClientRect() ?? cr
    const x = legend ? cr.width / 2 : r.left - cr.left + r.width / 2, y = legend ? cr.height / 2 : r.top - cr.top + r.height / 2
    const s = mk(l, `${styles.checkStamp}${legend ? ' ' + styles.legend : ''}`, legend ? t.legend : t.here)
    const scale = legend ? 1 : 0.8 + (k - 1) * 0.3, rot = rnd(-(8 + k * 7), 8 + k * 7)
    mv(s, [{ transform: at(x + rnd(-4, 4) * k, y + rnd(-3, 3) * k, `scale(${scale * 2.6}) rotate(${rot * 2}deg)`), opacity: 0 }, { transform: at(x + rnd(-4, 4) * k, y + rnd(-3, 3) * k, `scale(${scale}) rotate(${rot}deg)`), opacity: 1 }], { duration: 170 + k * 20, easing: 'cubic-bezier(.2,1.3,.4,1)' })
    const pa = mk(l, styles.pa, t.pa)
    pa.style.fontSize = `${16 + k * 6}px`
    mv(pa, [{ transform: at(x + 30, y - 30, 'scale(.5)'), opacity: 1 }, { transform: at(x + 44 + k * 4, y - 50 - k * 6, 'scale(1)'), opacity: 1, offset: 0.4 }, { transform: at(x + 50 + k * 4, y - 64 - k * 6, 'scale(1)'), opacity: 0 }], { duration: 700 }).then(() => pa.remove())
    shake(c, 2 + k * 2.5, 200 + k * 40)
    if (legend) cheer()
    setStatus(legend ? t.legend : `${t.here} ×${k}`)
  }
  return (
    <div className={styles.checkin}>
      <div ref={card} className={styles.checkCard} data-penguin-stop="checkin" data-penguin-at="1 0.5 46 42" data-penguin-at-m="0.86 0 0 3">
        <p className={styles.checkTitle}>{t.checkinTitle}</p>
        <div className={styles.week}>{t.days.map((d, i) => <span key={i} data-today={i === today ? '' : undefined}>{d}</span>)}</div>
        <div ref={layer} className={styles.stampLayer} aria-hidden="true" />
      </div>
      <div className={styles.toyRow}>
        <button type="button" className={styles.toyBtn} onClick={press}><Sparkles size={18} aria-hidden="true" />{t.btn.stamp}</button>
        <span className={styles.hint}>{t.checkinHint}</span>
        <span className={styles.sr} role="status">{status}</span>
      </div>
    </div>
  )
}
