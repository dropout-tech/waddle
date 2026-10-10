'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/react'
import { useIsMobile } from '@/hooks/use-mobile'
import { WATER_DROP_VISIBLE_MS } from '@/lib/water-moment'
import { hapticSelection } from '@/lib/haptics'
import { WaterSettingsPanel } from './water-settings-panel'
import { useControlYield, useIsScrolling } from '@/components/timer/use-floating-dodge'
import styles from './water-drop.module.css'

type DropState = 'here' | 'tap' | 'fade'

const HINT_MS = 6000
const LONG_PRESS_MS = 500
const SWIPE_PX = 36

/**
 * 喝水提醒 C「輕輕一滴」: used when there is no penguin to bring the water (lib/water-moment.ts).
 * A drop settles in the corner with a short question that tucks itself away after a few seconds.
 * Tap / click (or swipe it away) = had a sip. Right click / long press = on/off + interval.
 * Left alone for 60 s of VISIBLE time (a background tab doesn't count) it evaporates → onIgnore.
 */
export function WaterDrop({
  afterFocus,
  onDrink,
  onIgnore,
  onDisable,
}: {
  afterFocus: boolean
  onDrink: () => void
  onIgnore: () => void
  onDisable: () => void
}) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [state, setState] = useState<DropState>('here')
  const [hint, setHint] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [besidePet, setBesidePet] = useState(false)
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLButtonElement>(null)
  // Same manners as the timer pill (components/timer/use-floating-dodge.ts): while the list
  // scrolls the finger belongs to the list; if the drop would cover a small control that has no
  // 44×44 left, it steps up out of the way.
  const { scrolling } = useIsScrolling(state === 'here')
  const blocked = useControlYield(state === 'here' && !settingsOpen, dropRef)
  const [lifted, setLifted] = useState(false)
  useEffect(() => {
    // latch: once lifted it stays up (dropping back would cover the control again and oscillate)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the probe's external DOM result
    if (blocked) setLifted(true)
  }, [blocked])
  const press = useRef<{ x: number; y: number; timer?: number; long?: boolean } | null>(null)
  const cbs = useRef({ onDrink, onIgnore })
  useEffect(() => {
    cbs.current = { onDrink, onIgnore }
  }, [onDrink, onIgnore])

  // Phone: a muted penguin still sits in the corner — stand next to it, not on it.
  useEffect(() => {
    if (!isMobile) return
    const check = () => {
      const pet = document.querySelector<HTMLElement>('[data-pet]')
      // fixed-position: offsetParent is always null, so look at the box itself
      setBesidePet(!!pet && pet.getBoundingClientRect().width > 0 && !pet.hasAttribute('data-yield'))
    }
    check()
    const id = window.setInterval(check, 1000)
    return () => window.clearInterval(id)
  }, [isMobile])

  // The question tucks itself away; the drop stays.
  useEffect(() => {
    const id = window.setTimeout(() => setHint(false), HINT_MS)
    return () => window.clearTimeout(id)
  }, [])

  // Evaporate after 60 s on a visible page. Each tick counts at most 2 s, so a sleeping laptop
  // or a background tab never eats the countdown; the settings panel being open pauses it.
  useEffect(() => {
    if (state !== 'here' || settingsOpen) return
    let visible = 0
    let last = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const dt = Math.min(Math.max(0, now - last), 2000)
      last = now
      if (document.visibilityState === 'visible') visible += dt
      if (visible >= WATER_DROP_VISIBLE_MS) setState('fade')
    }, 1000)
    return () => window.clearInterval(id)
  }, [state, settingsOpen])

  // Let the little animation finish, then report.
  useEffect(() => {
    if (state === 'here') return
    const ms = state === 'tap' ? (reduced ? 250 : 900) : reduced ? 300 : 1500
    const id = window.setTimeout(() => (state === 'tap' ? cbs.current.onDrink() : cbs.current.onIgnore()), ms)
    return () => window.clearTimeout(id)
  }, [state, reduced])

  // Settings panel: close on outside press / Escape.
  useEffect(() => {
    if (!settingsOpen) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSettingsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  const drink = () => {
    if (state !== 'here') return
    hapticSelection()
    setSettingsOpen(false)
    setState('tap')
  }
  const clearPress = () => {
    if (press.current?.timer) window.clearTimeout(press.current.timer)
    press.current = null
  }

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      data-mobile={isMobile ? '' : undefined}
      data-beside-pet={besidePet ? '' : undefined}
      data-state={state}
      data-lifted={lifted ? '' : undefined}
      data-scrolling={scrolling ? '' : undefined}
      data-hint={hint && !settingsOpen ? 'on' : 'off'}
      data-water-drop
      data-hide-on-keyboard
    >
      <div className={styles.ask} aria-hidden="true">
        <b>{afterFocus ? t('剛好休息，喝一口？') : t('喝口水嗎？')}</b>
        <small>{t('點一下就好')}</small>
      </div>
      <button
        ref={dropRef}
        type="button"
        className={styles.drop}
        aria-label={afterFocus ? t('剛好休息，喝一口水吧：喝過了就點一下') : t('喝水提醒：喝過了就點一下')}
        title={isMobile ? undefined : t('點一下＝喝過了（右鍵：提醒設定）')}
        onClick={() => {
          if (press.current?.long) return
          drink()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          clearPress()
          setSettingsOpen(true)
        }}
        onPointerDown={(e) => {
          clearPress()
          press.current = { x: e.clientX, y: e.clientY }
          try {
            e.currentTarget.setPointerCapture(e.pointerId) // keep tracking a swipe that leaves the drop
          } catch {
            /* synthetic events can't be captured */
          }
          if (e.pointerType !== 'mouse') {
            const p = press.current
            p.timer = window.setTimeout(() => {
              p.long = true
              setSettingsOpen(true)
            }, LONG_PRESS_MS)
          }
        }}
        onPointerMove={(e) => {
          const p = press.current
          if (!p || p.long) return
          const dx = e.clientX - p.x
          const dy = e.clientY - p.y
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
            clearPress()
            drink() // swiped sideways = had a sip (a vertical drag scrolls the page instead)
          }
        }}
        onPointerUp={() => {
          const p = press.current
          if (p?.timer) window.clearTimeout(p.timer)
          // keep `long` until the click that follows the long press has been swallowed
          if (p && !p.long) press.current = null
          else window.setTimeout(clearPress, 0)
        }}
        onPointerCancel={clearPress}
      >
        <span className={styles.body}>
          <span className={styles.land} />
          <span className={styles.breathe}>
            <svg viewBox="0 0 48 58" aria-hidden="true">
              <path
                d="M24 3.5 C26.5 11, 41.5 25.5, 41.5 37 C41.5 47.5, 33.5 54.5, 24 54.5 C13.5 54.5, 6 47, 6.5 36.5 C7 25, 21 12, 24 3.5 Z"
                fill="#a6cbd7"
                stroke="currentColor"
                strokeWidth="2.7"
                strokeLinejoin="round"
              />
              <g className={styles.hi}>
                <path d="M13.6 37.5 C13.4 31.5, 15.4 27.4, 19.2 23.6" fill="none" stroke="#fffaf0" strokeWidth="3.4" strokeLinecap="round" />
                <circle cx="15.2" cy="43.4" r="1.8" fill="#fffaf0" />
              </g>
            </svg>
          </span>
          <svg className={styles.vapor} viewBox="0 0 40 26" aria-hidden="true">
            <g fill="none" stroke="#7fa9b8" strokeWidth="2" strokeLinecap="round">
              <path d="M10 24 C 6 18, 14 14, 10 8" />
              <path d="M20 22 C 16 15, 24 11, 20 3" />
              <path d="M30 24 C 26 18, 34 14, 30 8" />
            </g>
          </svg>
        </span>
        <span className={styles.rings} aria-hidden="true">
          <span />
          <span />
        </span>
        <span className={styles.gulp} aria-hidden="true">
          {t('咕嚕')}
        </span>
      </button>
      {/* Announced once when the drop appears. */}
      <span className="sr-only" role="status">
        {state === 'here' ? (afterFocus ? t('剛好休息，喝一口？') : t('喝口水嗎？')) : ''}
      </span>
      {settingsOpen && (
        <div className={styles.settings}>
          <WaterSettingsPanel onDisable={onDisable} />
        </div>
      )}
    </div>
  )
}
