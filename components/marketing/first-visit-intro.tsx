'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsRight } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { isDesktop, isNative } from '@/lib/platform'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/utils'
import { marketingMediaUrl } from '@/lib/marketing-media'
import styles from './first-visit-intro.module.css'

const SEEN_KEY = 'huddle-intro-seen'
const FILM_720 = marketingMediaUrl('promo-film/huddle-promo-720.mp4')
const FILM_1080 = marketingMediaUrl('promo-film/huddle-promo-1080.mp4')
const TICK_SOUNDS = [marketingMediaUrl('intro/tick.mp3'), marketingMediaUrl('intro/tock.mp3')]
const NARROW_QUERY = '(max-width: 760px)'
const FADE_MS = 600
// Failsafe for a slow film host (a single range request has taken ~20s in
// production): say we're loading, then let the visitor in rather than leave
// them staring at the gate.
const START_HINT_MS = 2500
const START_GIVE_UP_MS = 12000
const STALL_GIVE_UP_MS = 10000
// The clock: tick/tock every second from the enter click, the hand stepping 6°
// on each one. Web Audio lookahead scheduling keeps the beat exact.
const TICK_GAIN = 0.8
const LOOKAHEAD_S = 0.12
const PUMP_MS = 25
const TICK_FADE_S = 0.3
const REVEAL_LINE_MS = 1200
const REVEAL_PLAY_MS = 2400
// The first tick must always sound: if the two files aren't decoded at the
// click, wait for them up to this long, then start on a synthesized click
// (switching to the files as soon as they land).
const SOUND_WAIT_MS = 1200
// Fallback click: filtered-noise transient + decaying sine. Levels matched to
// the files (peak/RMS within ~5%, measured with OfflineAudioContext).
const SYNTH = [{ freq: 3300, level: 0.46 }, { freq: 2500, level: 0.42 }] // tick, tock
// While the gate is up, the hero swarm and the roaming penguin hold their
// first-visit show (penguin-circus.tsx) and start when this event fires.
export const INTRO_OPEN_ATTR = 'data-intro-open'
export const INTRO_CLOSED_EVENT = 'huddle:intro-closed'

export type IntroCopy = { tick: string; enter: string; enterTap: string; hint: string; line: string; play: string; skip: string; loading: string; label: string }
// enter = stage 1 (still clock, "click to enter"); gate = stage 2 (ticking, line, ▶)
type Phase = 'hidden' | 'enter' | 'gate' | 'film' | 'closing'
type Audio = { ctx: AudioContext; gain: GainNode; buffers: (AudioBuffer | null)[]; settled: boolean; ready: Promise<unknown>; noise: AudioBuffer | null }
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

// Fetch the two sounds as early as possible (gate mount), decode later into
// whichever AudioContext exists.
function fetchSounds() {
  return TICK_SOUNDS.map(url => {
    const p = fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    p.catch(() => {}) // may never be decoded (signed-in visitor): not an unhandled rejection
    return p
  })
}

// One synthesized click at `when` (tick or tock), into `dest`.
function synthClick(ctx: BaseAudioContext, dest: AudioNode, when: number, kind: number, noise: AudioBuffer): AudioScheduledSourceNode[] {
  const { freq, level } = SYNTH[kind]
  const osc = ctx.createOscillator()
  osc.frequency.value = freq
  const tone = ctx.createGain()
  tone.gain.setValueAtTime(0, when)
  tone.gain.linearRampToValueAtTime(level, when + 0.002)
  tone.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
  osc.connect(tone).connect(dest)
  osc.start(when); osc.stop(when + 0.08)
  const burst = ctx.createBufferSource()
  burst.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'; band.frequency.value = freq; band.Q.value = 0.9
  const env = ctx.createGain()
  env.gain.setValueAtTime(level, when)
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.018)
  burst.connect(band).connect(env).connect(dest)
  burst.start(when); burst.stop(when + 0.02)
  return [osc, burst]
}

function seen() {
  try { return window.localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markSeen() {
  try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* storage off: harmless, the gate shows again */ }
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** First-visit entrance. Stage 1 is a still clock and an "enter" button: that
 * click is the gesture that unlocks sound, so the clock starts ticking (Web
 * Audio) with the hand in step. Stage 2 reveals the line and ▶, whose click
 * plays the film with sound: play() runs synchronously in the handler on a
 * <video> already in the DOM (iOS only honours the gesture that way), inside a
 * fixed overlay rather than requestFullscreen (which hands off to the native
 * iOS player). Signed-in visitors, native/desktop shells and #deep-links never
 * see it. `?intro=1` previews it again after it has been seen. */
export function FirstVisitIntro({ locale = 'zh', copy, fontClass = '' }: { locale?: 'zh' | 'en'; copy: IntroCopy; fontClass?: string }) {
  const en = locale === 'en'
  const { session, loading } = useAuth()
  const [phase, setPhase] = useState<Phase>('hidden')
  const [reveal, setReveal] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [src, setSrc] = useState(FILM_1080)
  const [coarse, setCoarse] = useState(false)
  const decided = useRef<'pending' | 'hold' | 'done'>('pending')
  const held = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLSpanElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const enterRef = useRef<HTMLButtonElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const skipLinkRef = useRef<HTMLButtonElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef(0)
  const revealTimers = useRef<number[]>([])
  const started = useRef(false)
  const hintTimer = useRef(0)
  const startTimer = useRef(0)
  const stallTimer = useRef(0)
  const audio = useRef<Audio | null>(null)
  const clock = useRef({ mode: 'perf' as 'ctx' | 'perf', start: 0, perfStart: 0, beats: 0, steps: 0, pump: 0, raf: 0, stop: 0, wait: 0, gen: 0, audible: 0, kinds: [] as string[], sources: new Set<AudioScheduledSourceNode>() })
  const soundData = useRef<Promise<ArrayBuffer>[] | null>(null)

  const hold = useCallback(() => {
    held.current = true
    document.documentElement.setAttribute(INTRO_OPEN_ATTR, '')
  }, [])
  // Let the page's first-visit animations go.
  const release = useCallback(() => {
    if (!held.current) return
    held.current = false
    document.documentElement.removeAttribute(INTRO_OPEN_ATTR)
    window.dispatchEvent(new CustomEvent(INTRO_CLOSED_EVENT))
  }, [])

  // Decide once; hold the page's show right away so it doesn't run behind
  // the gate, then open once the session is known to be signed out.
  useEffect(() => {
    if (decided.current === 'pending') {
      const force = new URLSearchParams(window.location.search).get('intro') === '1'
      // Deep links (#download…) carry intent: don't stand in the way. The
      // gate stays unseen for a later plain visit.
      const eligible = !isNative() && !isDesktop() && (force || (!window.location.hash && !seen()))
      decided.current = eligible ? 'hold' : 'done'
      if (eligible) soundData.current = fetchSounds()
    }
    if (decided.current !== 'hold') return
    if (!held.current) hold()
    if (loading) return
    decided.current = 'done'
    if (session) { release(); return }
    setSrc(window.matchMedia(NARROW_QUERY).matches ? FILM_720 : FILM_1080)
    setCoarse(window.matchMedia('(pointer: coarse)').matches)
    setPhase('enter')
  }, [loading, session, hold, release])

  /* ── clock audio ── */
  // Seconds since the enter click, on the audio clock once it runs (so hand
  // and sound agree); on the page clock if there is no audio at all.
  const elapsed = useCallback(() => {
    const c = clock.current
    if (c.mode === 'ctx') {
      const a = audio.current
      if (a && a.ctx.state === 'running') return Math.max(0, a.ctx.currentTime - c.start)
      if (a && performance.now() - c.perfStart < 800) return 0
      c.mode = 'perf'; c.perfStart = performance.now() // audio never started: keep time silently
    }
    return (performance.now() - c.perfStart) / 1000
  }, [])

  const stopPump = useCallback(() => {
    const c = clock.current
    window.clearInterval(c.pump); window.clearTimeout(c.stop)
    c.pump = c.stop = 0
  }, [])

  // Skip / end / failsafe / unmount: silence now and let the context go.
  const shutAudio = useCallback(() => {
    const c = clock.current
    stopPump()
    window.clearTimeout(c.wait); c.wait = 0; c.gen++ // a pending start is void
    cancelAnimationFrame(c.raf); c.raf = 0
    c.sources.forEach(s => { try { s.stop() } catch { /* not started */ } })
    c.sources.clear()
    const a = audio.current
    audio.current = null
    if (a) {
      a.ctx.onstatechange = null
      a.gain.gain.value = 0
      void a.ctx.close().catch(() => {})
      rootRef.current?.setAttribute('data-audio', 'closed')
    }
  }, [stopPump])

  // Stage 1 mounts: a suspended AudioContext, decoding the two sounds right
  // away (that works while suspended), so the enter click only resumes it.
  useEffect(() => {
    if (phase !== 'enter' || audio.current) return
    const root = rootRef.current
    root?.setAttribute('data-ticks', '0')
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    let a: Audio
    try {
      const ctx = new AC()
      const gain = ctx.createGain()
      gain.gain.value = TICK_GAIN
      gain.connect(ctx.destination)
      a = { ctx, gain, buffers: [null, null], settled: false, ready: Promise.resolve(), noise: null }
      const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.02), ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      a.noise = noise
    } catch { return }
    audio.current = a
    if (a.ctx.state === 'running') void a.ctx.suspend().catch(() => {})
    const show = () => root?.setAttribute('data-audio', a.ctx.state)
    a.ctx.onstatechange = show
    show()
    const data = soundData.current ?? (soundData.current = fetchSounds())
    a.ready = Promise.allSettled(data.map((p, i) => p
      .then(bytes => a.ctx.decodeAudioData(bytes.slice(0)))
      .then(buffer => { a.buffers[i] = buffer })))
      .then(() => { a.settled = true; rootRef.current?.setAttribute('data-sounds', 'settled') }) // decoded, or failed for good (the synth covers it)
  }, [phase])

  const clearFailsafe = useCallback(() => {
    window.clearTimeout(hintTimer.current); window.clearTimeout(startTimer.current); window.clearTimeout(stallTimer.current)
    hintTimer.current = startTimer.current = stallTimer.current = 0
  }, [])
  const clearReveal = useCallback(() => {
    revealTimers.current.forEach(id => window.clearTimeout(id))
    revealTimers.current = []
  }, [])

  useEffect(() => () => { window.clearTimeout(closeTimer.current); clearFailsafe(); clearReveal(); shutAudio(); release() }, [release, clearFailsafe, clearReveal, shutAudio])

  const open = phase === 'enter' || phase === 'gate' || phase === 'film'

  // While open: the page behind is inert and doesn't scroll.
  useEffect(() => {
    if (!open) return
    const page = document.getElementById('top')
    page?.setAttribute('inert', '')
    lockBodyScroll()
    return () => { page?.removeAttribute('inert'); unlockBodyScroll() }
  }, [open])

  useEffect(() => {
    if (phase === 'enter') enterRef.current?.focus({ preventScroll: true })
    if (phase === 'film') skipRef.current?.focus({ preventScroll: true })
  }, [phase])
  useEffect(() => {
    if (reveal === 2) playRef.current?.focus({ preventScroll: true })
  }, [reveal])

  const close = useCallback(() => {
    if (phase !== 'enter' && phase !== 'gate' && phase !== 'film') return
    clearFailsafe()
    clearReveal()
    shutAudio()
    setBuffering(false)
    markSeen()
    videoRef.current?.pause()
    setPhase('closing')
    // Focus goes back to the page; the gate's controls are about to vanish.
    const page = document.getElementById('top')
    if (page) {
      page.setAttribute('tabindex', '-1')
      page.addEventListener('blur', () => page.removeAttribute('tabindex'), { once: true })
      page.focus({ preventScroll: true })
    }
    closeTimer.current = window.setTimeout(() => { setPhase('hidden'); release() }, reducedMotion() ? 0 : FADE_MS)
  }, [phase, release, clearFailsafe, clearReveal, shutAudio])
  // Failsafe timers fire later than the render that set them.
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      // Focus trap: cycle through this stage's visible controls only.
      const items = (phase === 'enter' ? [enterRef.current, skipLinkRef.current]
        : phase === 'gate' ? [reveal === 2 ? playRef.current : null, skipLinkRef.current]
          : [skipRef.current, blocked ? videoRef.current : null]).filter((el): el is HTMLButtonElement | HTMLVideoElement => !!el)
      e.preventDefault()
      if (!items.length) return
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, phase, reveal, blocked, close])

  const enter = () => {
    if (phase !== 'enter') return
    // All synchronous, inside the click: this is the gesture that unlocks sound.
    const nav = navigator as AudioSessionNavigator
    try { if (nav.audioSession) nav.audioSession.type = 'playback' } catch { /* older Safari */ } // play through the iOS silent switch
    const a = audio.current
    if (a) void a.ctx.resume().catch(() => {})
    const c = clock.current
    const clickedAt = performance.now()
    const still = reducedMotion()
    const root = rootRef.current
    const track = (s: AudioScheduledSourceNode) => { c.sources.add(s); s.onended = () => c.sources.delete(s) }
    // Beat k (tick, tock, tick…) sounds at start + k seconds: the file if it
    // has decoded, otherwise the synthesized click.
    const pump = () => {
      const due = elapsed() + LOOKAHEAD_S
      while (c.beats < due) {
        const now = audio.current
        if (c.mode === 'ctx' && now && now.ctx.state !== 'closed') {
          const kind = c.beats % 2
          const when = Math.max(c.start + c.beats, now.ctx.currentTime)
          const buffer = now.buffers[kind]
          if (buffer) {
            const s = now.ctx.createBufferSource()
            s.buffer = buffer
            s.connect(now.gain)
            track(s)
            s.start(when)
            c.kinds.push('file')
          } else if (now.noise) {
            synthClick(now.ctx, now.gain, when, kind, now.noise).forEach(track)
            c.kinds.push('synth')
          }
          c.audible = c.kinds.length
        }
        c.beats++
      }
      root?.setAttribute('data-ticks', String(c.beats))
      root?.setAttribute('data-audible', String(c.audible))
      root?.setAttribute('data-beat-sources', c.kinds.slice(0, 12).join(','))
    }
    // The hand steps 6° on each beat, read off the same clock.
    const frame = () => {
      c.raf = requestAnimationFrame(frame)
      const steps = Math.floor(elapsed()) + 1
      if (steps === c.steps) return
      c.steps = steps
      if (!still && handRef.current) handRef.current.style.transform = `rotate(${steps * 6}deg)`
    }
    // The metronome: first tick, hand and the stage-2 reveal all count from here.
    let begun = false
    const begin = () => {
      begun = true
      window.clearTimeout(c.wait); c.wait = 0
      const live = audio.current
      c.mode = live ? 'ctx' : 'perf'
      c.start = live ? live.ctx.currentTime : 0
      c.perfStart = performance.now()
      c.beats = 0; c.steps = 0; c.audible = 0; c.kinds = []
      root?.setAttribute('data-first-beat-delay', String(Math.round(performance.now() - clickedAt)))
      pump()
      c.pump = window.setInterval(pump, PUMP_MS)
      frame()
      revealTimers.current = [
        window.setTimeout(() => setReveal(1), REVEAL_LINE_MS),
        window.setTimeout(() => setReveal(2), REVEAL_PLAY_MS),
      ]
    }
    setPhase('gate')
    if (!a || a.settled) begin()
    else {
      // Sounds still on their way: start the moment they're ready, or on the
      // synth after SOUND_WAIT_MS. A close in between voids this (gen).
      const gen = c.gen
      const go = () => { if (c.gen === gen && !begun) begin() }
      c.wait = window.setTimeout(go, SOUND_WAIT_MS)
      void a.ready.then(go)
    }
    // Hold focus on the dialog until ▶ appears (a second Enter must not skip).
    rootRef.current?.focus({ preventScroll: true })
  }

  const play = () => {
    const video = videoRef.current
    if (!video) return
    // Keep this synchronous: iOS only unlocks sound for play() called
    // directly inside the tap handler.
    video.muted = false
    const attempt = video.play()
    setPhase('film')
    // The ticking bows out: fade, then stop scheduling. The hand keeps time
    // silently until the film rolls.
    const a = audio.current
    if (a && a.ctx.state === 'running') {
      const t = a.ctx.currentTime
      a.gain.gain.cancelScheduledValues(t)
      a.gain.gain.setValueAtTime(a.gain.gain.value, t)
      a.gain.gain.linearRampToValueAtTime(0, t + TICK_FADE_S)
    }
    clock.current.stop = window.setTimeout(stopPump, TICK_FADE_S * 1000)
    hintTimer.current = window.setTimeout(() => setBuffering(true), START_HINT_MS)
    startTimer.current = window.setTimeout(() => closeRef.current(), START_GIVE_UP_MS)
    attempt?.catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Still refused: hand over the native controls to press play (the
      // give-up timer still lets them in if they don't).
      window.clearTimeout(hintTimer.current); setBuffering(false)
      setBlocked(true); setRolling(true)
    })
  }
  const markStarted = () => {
    if (started.current) return
    started.current = true
    window.clearTimeout(hintTimer.current); window.clearTimeout(startTimer.current)
  }
  // Mid-film stall: loading line on the film; give up after 10s straight.
  const beginStall = () => {
    if (!started.current || stallTimer.current || phase !== 'film') return
    setBuffering(true)
    stallTimer.current = window.setTimeout(() => closeRef.current(), STALL_GIVE_UP_MS)
  }
  const endStall = () => {
    window.clearTimeout(stallTimer.current); stallTimer.current = 0
    setBuffering(false)
  }

  if (phase === 'hidden') return null
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={copy.label}
      tabIndex={-1}
      lang={en ? 'en' : 'zh-Hant'}
      className={`${styles.root} ${fontClass} ${en ? styles.english : ''}`}
      data-phase={phase}
      data-rolling={rolling ? '' : undefined}
    >
      <video
        ref={videoRef}
        className={styles.film}
        src={src}
        playsInline
        preload={src === FILM_720 ? 'metadata' : 'auto'}
        controls={blocked}
        onPlaying={() => { setRolling(true); markStarted(); endStall() }}
        onTimeUpdate={e => { if (e.currentTarget.currentTime > 0) markStarted() }}
        onWaiting={beginStall}
        // "stalled" also fires while playing on from buffer; only a stall
        // that has run out of frames counts.
        onStalled={e => { if (e.currentTarget.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) beginStall() }}
        onEnded={close}
        onError={close}
      />
      <div className={styles.gate}>
        <div className={styles.stack}>
          <div className={styles.clock} aria-hidden="true"><span className={styles.dial} /><span ref={handRef} className={styles.hand} /><span className={styles.pivot} /></div>
          <p className={styles.tick}>{copy.tick}</p>
          <p className={styles.line} data-shown={reveal >= 1 ? '' : undefined}>{copy.line}</p>
          <div className={styles.actions}>
            <button ref={enterRef} type="button" className={`${styles.cta} ${styles.enter}`} onClick={enter}>{en && coarse ? copy.enterTap : copy.enter}</button>
            <button ref={playRef} type="button" className={`${styles.cta} ${styles.play}`} data-shown={reveal >= 2 ? '' : undefined} onClick={play}>
              <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true"><path d="M0 0l10 6-10 6z" fill="currentColor" /></svg>{copy.play}
            </button>
            <p className={styles.hint}>{copy.hint}</p>
            <p className={styles.loading} aria-live="polite">{buffering && !rolling ? <span>{copy.loading}</span> : null}</p>
            <button ref={skipLinkRef} type="button" className={styles.skipLink} onClick={close}>{copy.skip}</button>
          </div>
        </div>
      </div>
      <p className={styles.filmLoading} aria-live="polite">{buffering && rolling ? <span>{copy.loading}</span> : null}</p>
      {phase === 'film' || phase === 'closing' ? <button ref={skipRef} type="button" className={styles.skip} onClick={close}>{copy.skip}<ChevronsRight size={16} aria-hidden="true" /></button> : null}
    </div>,
    document.body,
  )
}
