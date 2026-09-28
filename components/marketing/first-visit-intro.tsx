'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronsRight } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { isDesktop, isNative } from '@/lib/platform'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/utils'
import styles from './first-visit-intro.module.css'

const SEEN_KEY = 'huddle-intro-seen'
const FILM_720 = '/marketing/promo-film/huddle-promo-720.mp4'
const FILM_1080 = '/marketing/promo-film/huddle-promo-1080.mp4'
const NARROW_QUERY = '(max-width: 760px)'
const FADE_MS = 600
// Failsafe for a slow film host (a single range request has taken ~20s in
// production): say we're loading, then let the visitor in rather than leave
// them staring at the gate.
const START_HINT_MS = 2500
const START_GIVE_UP_MS = 12000
const STALL_GIVE_UP_MS = 10000
// While the gate is up, the hero swarm and the roaming penguin hold their
// first-visit show (penguin-circus.tsx) and start when this event fires.
export const INTRO_OPEN_ATTR = 'data-intro-open'
export const INTRO_CLOSED_EVENT = 'huddle:intro-closed'

export type IntroCopy = { tick: string; line: string; play: string; skip: string; loading: string; label: string }
type Phase = 'hidden' | 'gate' | 'film' | 'closing'

function seen() {
  try { return window.localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
function markSeen() {
  try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* storage off: harmless, the gate shows again */ }
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** First-visit entrance: a dark gate whose one button is the user gesture
 * browsers require before a film may play with sound. play() is called
 * synchronously inside the click handler on a <video> that is already in the
 * DOM (iOS only honours the gesture that way), inside a fixed overlay rather
 * than requestFullscreen (which would hand off to the native iOS player).
 * Signed-in visitors, native/desktop shells and #deep-links never see it.
 * `?intro=1` previews it again after it has been seen. */
export function FirstVisitIntro({ locale = 'zh', copy, fontClass = '' }: { locale?: 'zh' | 'en'; copy: IntroCopy; fontClass?: string }) {
  const en = locale === 'en'
  const { session, loading } = useAuth()
  const [phase, setPhase] = useState<Phase>('hidden')
  const [rolling, setRolling] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [src, setSrc] = useState(FILM_1080)
  const decided = useRef<'pending' | 'hold' | 'done'>('pending')
  const held = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const skipLinkRef = useRef<HTMLButtonElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef(0)
  const started = useRef(false)
  const hintTimer = useRef(0)
  const startTimer = useRef(0)
  const stallTimer = useRef(0)

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
    }
    if (decided.current !== 'hold') return
    if (!held.current) hold()
    if (loading) return
    decided.current = 'done'
    if (session) { release(); return }
    setSrc(window.matchMedia(NARROW_QUERY).matches ? FILM_720 : FILM_1080)
    setPhase('gate')
  }, [loading, session, hold, release])

  const clearFailsafe = useCallback(() => {
    window.clearTimeout(hintTimer.current); window.clearTimeout(startTimer.current); window.clearTimeout(stallTimer.current)
    hintTimer.current = startTimer.current = stallTimer.current = 0
  }, [])

  useEffect(() => () => { window.clearTimeout(closeTimer.current); clearFailsafe(); release() }, [release, clearFailsafe])

  const open = phase === 'gate' || phase === 'film'

  // While open: the page behind is inert and doesn't scroll.
  useEffect(() => {
    if (!open) return
    const page = document.getElementById('top')
    page?.setAttribute('inert', '')
    lockBodyScroll()
    return () => { page?.removeAttribute('inert'); unlockBodyScroll() }
  }, [open])

  useEffect(() => {
    if (phase === 'gate') playRef.current?.focus({ preventScroll: true })
    if (phase === 'film') skipRef.current?.focus({ preventScroll: true })
  }, [phase])

  const close = useCallback(() => {
    if (phase !== 'gate' && phase !== 'film') return
    clearFailsafe()
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
  }, [phase, release, clearFailsafe])
  // Failsafe timers fire later than the render that set them.
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key !== 'Tab') return
      // Focus trap: cycle through this phase's controls only.
      const items = (phase === 'gate' ? [playRef.current, skipLinkRef.current] : [skipRef.current, blocked ? videoRef.current : null]).filter((el): el is HTMLButtonElement | HTMLVideoElement => !!el)
      e.preventDefault()
      if (!items.length) return
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length].focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, phase, blocked, close])

  const play = () => {
    const video = videoRef.current
    if (!video) return
    // Keep this synchronous: iOS only unlocks sound for play() called
    // directly inside the tap handler.
    video.muted = false
    const attempt = video.play()
    setPhase('film')
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
          <div className={styles.clock} aria-hidden="true"><span className={styles.dial} /><span className={styles.hand} /><span className={styles.pivot} /></div>
          <p className={styles.tick}>{copy.tick}</p>
          <p className={styles.line}>{copy.line}</p>
          <div className={styles.actions}>
            <button ref={playRef} type="button" className={styles.play} onClick={play}>
              <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true"><path d="M0 0l10 6-10 6z" fill="currentColor" /></svg>{copy.play}
            </button>
            <button ref={skipLinkRef} type="button" className={styles.skipLink} onClick={close}>{copy.skip}</button>
            <p className={styles.loading} aria-live="polite">{buffering && !rolling ? <span>{copy.loading}</span> : null}</p>
          </div>
        </div>
      </div>
      <p className={styles.filmLoading} aria-live="polite">{buffering && rolling ? <span>{copy.loading}</span> : null}</p>
      {phase !== 'gate' ? <button ref={skipRef} type="button" className={styles.skip} onClick={close}>{copy.skip}<ChevronsRight size={16} aria-hidden="true" /></button> : null}
    </div>,
    document.body,
  )
}
