'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { BRAND_QUOTE } from '@/lib/brand'
import { marketingMediaUrl } from '@/lib/marketing-media'
import styles from './promo-loop.module.css'

// Seamless 7s loops, no audio track. 720p under 760px, 1080p otherwise.
const SOURCES = {
  desktop: { webm: marketingMediaUrl('promo-loop/hammock-1080.webm'), mp4: marketingMediaUrl('promo-loop/hammock-1080.mp4') },
  mobile: { webm: marketingMediaUrl('promo-loop/hammock-720.webm'), mp4: marketingMediaUrl('promo-loop/hammock-720.mp4') },
} as const
const POSTER = marketingMediaUrl('promo-loop/hammock-poster.jpg')
const NARROW_QUERY = '(max-width: 760px)'

/** Ambient "breathing moment" loop — the calm ending of the promo film,
 * decorative and silent. Loads and plays only near the viewport, respects
 * prefers-reduced-motion, and always offers a visible pause/play control. */
export function PromoLoop({ locale = 'zh' }: { locale?: 'zh' | 'en' }) {
  const en = locale === 'en'
  const tagline = en ? BRAND_QUOTE.quoteEn : BRAND_QUOTE.quote
  const copy = en
    ? { pause: 'Pause the looping video', play: 'Play the looping video' }
    : { pause: '暫停循環影片', play: '播放循環影片' }

  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const manualPauseRef = useRef(false)
  const sourceKeyRef = useRef('')

  const [narrow, setNarrow] = useState(false)
  const [inView, setInView] = useState(false)
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [paused, setPaused] = useState(true)

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => setInView(entry.isIntersecting)),
      { threshold: 0.3, rootMargin: '160px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Latch: once near the viewport, start loading. Never unloads again, so
  // scrolling away and back doesn't re-trigger a fetch.
  useEffect(() => {
    if (inView) setReady(true)
  }, [inView])

  const variant = narrow ? SOURCES.mobile : SOURCES.desktop

  // Sources render only once `ready`, so the browser must be told to
  // (re-)scan them — adding <source> children after mount doesn't do this
  // on its own. Only reload when the chosen source actually changes (e.g.
  // crossing the 760px breakpoint on rotation), not on every dependency
  // change, and resume playback afterwards unless the user paused manually.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !ready) return
    const key = `${variant.webm}|${variant.mp4}`
    if (sourceKeyRef.current === key) return
    sourceKeyRef.current = key
    video.load()
    if (inView && !reducedMotion && !manualPauseRef.current) {
      void video.play().catch(() => {})
    }
  }, [ready, variant.webm, variant.mp4, inView, reducedMotion])

  // Drives play/pause from viewport visibility and the reduced-motion
  // preference. Reduced motion must stop playback immediately even if the
  // video was already playing when the preference changed.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !ready) return
    if (reducedMotion) {
      video.pause()
      return
    }
    if (inView) {
      if (!manualPauseRef.current) void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [inView, ready, reducedMotion])

  function toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      manualPauseRef.current = false
      void video.play().catch(() => {})
    } else {
      manualPauseRef.current = true
      video.pause()
    }
  }

  return (
    <section lang={en ? 'en' : 'zh-TW'} className={styles.section}>
      <div className={styles.inner}>
        <div ref={wrapRef} className={styles.frame}>
          <video
            ref={videoRef}
            aria-hidden="true"
            muted
            loop
            playsInline
            preload={ready ? 'auto' : 'none'}
            poster={POSTER}
            width={1920}
            height={1080}
            className={styles.video}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          >
            {ready ? (
              <>
                <source src={variant.webm} type='video/webm; codecs="vp9"' />
                <source src={variant.mp4} type="video/mp4" />
              </>
            ) : null}
          </video>
          <button type="button" className={styles.toggle} onClick={toggle} aria-label={paused ? copy.play : copy.pause}>
            {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          </button>
        </div>
        <p className={`${styles.tagline}${en ? ` ${styles.en}` : ''}`}>{tagline}</p>
      </div>
    </section>
  )
}
