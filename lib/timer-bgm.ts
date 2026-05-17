// Background music + ambient overlay engine for the focus timer.
//
// Two channels:
//  - music: at most one track at a time (mood). Switching crossfades.
//  - ambient: any number of overlays (rain, fire, etc.), each with its own gain.
//
// All sources are looping HTMLAudioElements pointed at files under
// /public/audio/. Missing files (404) resolve quietly and mark the track
// unavailable — the UI surfaces that as a disabled state.
//
// Volumes are 0..1 and applied per channel; tracks fade in/out over 300ms
// so a swipe between moods doesn't pop.

export type BgmMusicId = 'relax' | 'energetic' | 'nature'
export type BgmAmbientId = 'rain' | 'fire' | 'waves' | 'cafe'

interface MusicMeta {
  id: BgmMusicId
  label: string
  src: string
  emoji: string
}

interface AmbientMeta {
  id: BgmAmbientId
  label: string
  src: string
  emoji: string
}

export const BGM_MUSIC: MusicMeta[] = [
  { id: 'relax',     label: '放鬆',     src: '/audio/music/relax.mp3',     emoji: '🌿' },
  { id: 'energetic', label: '激昂',     src: '/audio/music/energetic.mp3', emoji: '🔥' },
  { id: 'nature',    label: '大自然',   src: '/audio/music/nature.mp3',    emoji: '🌲' },
]

export const BGM_AMBIENT: AmbientMeta[] = [
  { id: 'rain',  label: '雨聲',     src: '/audio/ambient/rain.mp3',  emoji: '🌧' },
  { id: 'fire',  label: '火焰',     src: '/audio/ambient/fire.mp3',  emoji: '🔥' },
  { id: 'waves', label: '海浪',     src: '/audio/ambient/waves.mp3', emoji: '🌊' },
  { id: 'cafe',  label: '咖啡廳',   src: '/audio/ambient/cafe.mp3',  emoji: '☕' },
]

const FADE_MS = 300

interface Track {
  el: HTMLAudioElement
  targetVol: number
  available: boolean
}

class BgmEngine {
  private music = new Map<BgmMusicId, Track>()
  private ambient = new Map<BgmAmbientId, Track>()
  private currentMusic: BgmMusicId | null = null
  private musicVol = 0.5
  private playing = false
  /** Tracks (by src) that 404'd. UI consults via isAvailable(). */
  private unavailable = new Set<string>()
  /** Subscribers notified when availability changes (after a load failure). */
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    // Wrap so the returned unsubscribe has a void return — Set.delete leaks
    // a boolean, which trips React's useEffect cleanup type.
    return () => { this.listeners.delete(fn) }
  }
  private notify() { this.listeners.forEach(fn => fn()) }

  isAvailable(src: string) { return !this.unavailable.has(src) }

  /** Instantiate every track up-front so the `error` listener fires before
   *  the user touches any button. Without this, missing tracks don't show
   *  as disabled until first click. Safe to call repeatedly — getOrCreate
   *  is idempotent per id. */
  preload() {
    for (const m of BGM_MUSIC) this.getOrCreate(this.music, m.id, m.src)
    for (const a of BGM_AMBIENT) this.getOrCreate(this.ambient, a.id, a.src)
  }

  private getOrCreate<T extends string>(map: Map<T, Track>, id: T, src: string): Track {
    let t = map.get(id)
    if (t) return t
    const el = new Audio(src)
    el.loop = true
    el.preload = 'auto'
    el.volume = 0
    el.addEventListener('error', () => {
      this.unavailable.add(src)
      this.notify()
    })
    t = { el, targetVol: 0, available: true }
    map.set(id, t)
    return t
  }

  /** rAF handle per element so a new fade cancels any in-flight one — prevents
   *  overlapping fades writing el.volume on the same frame (which produces
   *  audible bounce when the user drags the volume slider). */
  private fadeHandles = new WeakMap<HTMLAudioElement, number>()

  /** Fade element volume to a target over FADE_MS using rAF. Cancels any
   *  in-flight fade on the same element first. */
  private fadeTo(el: HTMLAudioElement, to: number, ms = FADE_MS) {
    const prev = this.fadeHandles.get(el)
    if (prev !== undefined) cancelAnimationFrame(prev)
    const from = el.volume
    if (Math.abs(from - to) < 0.01) {
      el.volume = to
      this.fadeHandles.delete(el)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      el.volume = from + (to - from) * p
      if (p < 1) {
        this.fadeHandles.set(el, requestAnimationFrame(tick))
      } else {
        this.fadeHandles.delete(el)
      }
    }
    this.fadeHandles.set(el, requestAnimationFrame(tick))
  }

  /** Set the active music mood (or null for none). Crossfades. */
  setMusic(id: BgmMusicId | null) {
    if (id === this.currentMusic) return
    // Fade out previous
    if (this.currentMusic) {
      const prev = this.music.get(this.currentMusic)
      if (prev) {
        this.fadeTo(prev.el, 0)
        window.setTimeout(() => { prev.el.pause() }, FADE_MS + 50)
      }
    }
    this.currentMusic = id
    if (id && this.playing) {
      const meta = BGM_MUSIC.find(m => m.id === id)
      if (!meta) return
      const t = this.getOrCreate(this.music, id, meta.src)
      if (this.unavailable.has(meta.src)) return
      t.el.play().catch(() => { /* autoplay blocked — will retry on user gesture */ })
      this.fadeTo(t.el, this.musicVol)
    }
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v))
    if (this.currentMusic) {
      const t = this.music.get(this.currentMusic)
      // Fade rather than direct-assign so a slider drag that interrupts a
      // crossfade doesn't pop — the WeakMap cancellation makes this cheap.
      if (t) this.fadeTo(t.el, this.musicVol, 80)
    }
  }

  /** Enable or disable an ambient overlay. */
  setAmbient(id: BgmAmbientId, enabled: boolean, volume = 0.5) {
    const meta = BGM_AMBIENT.find(a => a.id === id)
    if (!meta) return
    const t = this.getOrCreate(this.ambient, id, meta.src)
    if (this.unavailable.has(meta.src)) return
    t.targetVol = enabled ? Math.max(0, Math.min(1, volume)) : 0
    if (enabled && this.playing) {
      t.el.play().catch(() => {})
      this.fadeTo(t.el, t.targetVol)
    } else {
      this.fadeTo(t.el, 0)
      if (!enabled) {
        window.setTimeout(() => { if (t.targetVol === 0) t.el.pause() }, FADE_MS + 50)
      }
    }
  }

  /** Start/stop everything (call when timer starts/stops). */
  setPlaying(on: boolean) {
    if (on === this.playing) return
    this.playing = on
    if (on) {
      if (this.currentMusic) {
        const meta = BGM_MUSIC.find(m => m.id === this.currentMusic)
        if (meta && !this.unavailable.has(meta.src)) {
          const t = this.getOrCreate(this.music, this.currentMusic, meta.src)
          t.el.play().catch(() => {})
          this.fadeTo(t.el, this.musicVol)
        }
      }
      for (const [id, t] of this.ambient) {
        if (t.targetVol > 0) {
          const meta = BGM_AMBIENT.find(a => a.id === id)
          if (!meta || this.unavailable.has(meta.src)) continue
          t.el.play().catch(() => {})
          this.fadeTo(t.el, t.targetVol)
        }
      }
    } else {
      // Fade everything out, then pause
      for (const t of this.music.values()) {
        this.fadeTo(t.el, 0)
        window.setTimeout(() => t.el.pause(), FADE_MS + 50)
      }
      for (const t of this.ambient.values()) {
        this.fadeTo(t.el, 0)
        window.setTimeout(() => t.el.pause(), FADE_MS + 50)
      }
    }
  }
}

// Lazy singleton so SSR doesn't choke on `new Audio()`. Returns null on the
// server — callers must guard.
let engine: BgmEngine | null = null
export function getBgmEngine(): BgmEngine | null {
  if (typeof window === 'undefined') return null
  if (!engine) engine = new BgmEngine()
  return engine
}
