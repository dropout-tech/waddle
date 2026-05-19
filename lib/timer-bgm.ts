// Background music + ambient overlay engine for the focus timer.
//
// Two channels:
//  - music: at most one *selection* at a time. Selection may be a real
//    track id, OR the sentinel 'all' meaning "cycle the playlist".
//    Switching crossfades.
//  - ambient: any number of overlays (rain, fire, etc.), each with its
//    own gain.
//
// All sources are HTMLAudioElements pointed at files under /public/audio/.
// Missing files (404) resolve quietly and mark the track unavailable —
// the UI surfaces that as a disabled state.
//
// Looping is dual-buffered: each music track holds *two* Audio elements
// (a/b) and we hand off from one to the other ~0.3s before end-of-file.
// HTMLAudioElement's native `loop = true` produces an audible click at
// the loop seam (MP3 decoder priming silence + decoder reset), which
// the user reported as "音樂會一直斷斷續續". Dual-buffer hides the seam
// by playing the second buffer over the tail of the first.
//
// In 'all' mode the same handoff machinery walks the playlist instead
// of looping in place, so the user hears every track once before any
// repeats.

export type RealMusicId = 'relax' | 'energetic' | 'nature'
/** Music selection. 'all' = cycle the whole playlist. */
export type BgmMusicId = RealMusicId | 'all'
export type BgmAmbientId = 'rain' | 'fire' | 'waves' | 'cafe'

interface MusicMeta {
  id: RealMusicId
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

export const ALL_MUSIC_ID = 'all' as const
export const ALL_MUSIC_LABEL = '全部循環'
export const ALL_MUSIC_EMOJI = '🔀'

const FADE_MS = 300
/** Start the next buffer this many seconds before the current one ends.
 *  Picked to comfortably cover MP3 priming silence (~50ms) plus a margin
 *  for `timeupdate` event jitter (browsers fire it every ~250ms). */
const HANDOFF_LEAD_S = 0.4

interface MusicPair {
  /** Two Audio elements pointing at the same src, used alternately for
   *  gapless looping. */
  a: HTMLAudioElement
  b: HTMLAudioElement
  current: 'a' | 'b'
}

interface AmbientTrack {
  el: HTMLAudioElement
  targetVol: number
}

class BgmEngine {
  private musicPairs = new Map<RealMusicId, MusicPair>()
  private ambient = new Map<BgmAmbientId, AmbientTrack>()
  /** Whatever the user picked: 'all', a real id, or null. */
  private selection: BgmMusicId | null = null
  /** Ordered playlist of *real* ids to walk through. Length 1 when the
   *  selection is a single track, length N when 'all'. */
  private playlist: RealMusicId[] = []
  private playlistIndex = 0
  /** The audio element that is currently audible (or just started fading
   *  in). Volume slider edits target this element only. */
  private currentEl: HTMLAudioElement | null = null
  /** Handoff listener bookkeeping so a re-arm or stop reliably removes
   *  the previous timeupdate handler — leaks here cause double-plays. */
  private handoffEl: HTMLAudioElement | null = null
  private handoffListener: (() => void) | null = null

  private musicVol = 0.5
  private playing = false
  private unavailable = new Set<string>()
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  private notify() { this.listeners.forEach(fn => fn()) }

  isAvailable(src: string) { return !this.unavailable.has(src) }

  /** Instantiate every track up-front so `error` listeners fire before
   *  the user touches any button. Idempotent. */
  preload() {
    for (const m of BGM_MUSIC) this.getOrCreateMusicPair(m.id, m.src)
    for (const a of BGM_AMBIENT) this.getOrCreateAmbient(a.id, a.src)
  }

  private getOrCreateMusicPair(id: RealMusicId, src: string): MusicPair {
    let pair = this.musicPairs.get(id)
    if (pair) return pair
    const make = () => {
      const el = new Audio(src)
      // We do our own loop via dual-buffer handoff, so leave loop=false.
      // (Native loop=true produces an audible click at the seam.)
      el.loop = false
      el.preload = 'auto'
      el.volume = 0
      el.addEventListener('error', () => {
        this.unavailable.add(src)
        this.notify()
      })
      return el
    }
    pair = { a: make(), b: make(), current: 'a' }
    this.musicPairs.set(id, pair)
    return pair
  }

  private getOrCreateAmbient(id: BgmAmbientId, src: string): AmbientTrack {
    let t = this.ambient.get(id)
    if (t) return t
    const el = new Audio(src)
    // Ambient overlays are noise — native loop is fine (any seam click is
    // masked by the noise floor) and avoids doubling memory.
    el.loop = true
    el.preload = 'auto'
    el.volume = 0
    el.addEventListener('error', () => {
      this.unavailable.add(src)
      this.notify()
    })
    t = { el, targetVol: 0 }
    this.ambient.set(id, t)
    return t
  }

  /** rAF handle per element so a new fade cancels any in-flight one — prevents
   *  overlapping fades writing el.volume on the same frame. */
  private fadeHandles = new WeakMap<HTMLAudioElement, number>()

  /** Fade element volume to a target. Every write to `el.volume` is
   *  clamped to [0, 1]: HTMLMediaElement throws IndexSizeError on
   *  out-of-range values, and one throw kills the entire BGM chain. */
  private fadeTo(el: HTMLAudioElement, to: number, ms = FADE_MS) {
    const prev = this.fadeHandles.get(el)
    if (prev !== undefined) cancelAnimationFrame(prev)
    const target = Math.max(0, Math.min(1, to))
    const from = Math.max(0, Math.min(1, el.volume))
    if (Math.abs(from - target) < 0.01) {
      el.volume = target
      this.fadeHandles.delete(el)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms)
      const next = from + (target - from) * p
      el.volume = Math.max(0, Math.min(1, next))
      if (p < 1) {
        this.fadeHandles.set(el, requestAnimationFrame(tick))
      } else {
        this.fadeHandles.delete(el)
      }
    }
    this.fadeHandles.set(el, requestAnimationFrame(tick))
  }

  /** Build the real-id playlist for a given selection. Filters out any
   *  track whose src is known to be missing so 'all' mode doesn't try to
   *  play 3 seconds of silence per absent file. */
  private buildPlaylist(sel: BgmMusicId | null): RealMusicId[] {
    if (sel === null) return []
    if (sel === 'all') {
      return BGM_MUSIC
        .filter(m => !this.unavailable.has(m.src))
        .map(m => m.id)
    }
    const meta = BGM_MUSIC.find(m => m.id === sel)
    if (!meta || this.unavailable.has(meta.src)) return []
    return [sel]
  }

  /** Switch music selection. Crossfades if anything was playing. */
  setMusic(id: BgmMusicId | null) {
    if (id === this.selection) return
    this.stopAllMusic()
    this.selection = id
    this.playlist = this.buildPlaylist(id)
    this.playlistIndex = 0
    if (this.playing && this.playlist.length > 0) {
      this.playCurrentPlaylistEntry()
    }
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v))
    if (this.currentEl) this.fadeTo(this.currentEl, this.musicVol, 80)
  }

  /** Start the playlist[playlistIndex] track from 0 (using the pair's
   *  currently-armed buffer). Fades it in and arms the next handoff. */
  private playCurrentPlaylistEntry() {
    if (this.playlist.length === 0) return
    const id = this.playlist[this.playlistIndex]
    const meta = BGM_MUSIC.find(m => m.id === id)
    if (!meta || this.unavailable.has(meta.src)) return
    const pair = this.getOrCreateMusicPair(id, meta.src)
    const el = pair.current === 'a' ? pair.a : pair.b
    try {
      el.currentTime = 0
    } catch {
      // Some browsers throw on .currentTime= before metadata loads.
      // It's fine — playback still starts at 0 on first play().
    }
    el.play().catch(() => { /* autoplay blocked — will retry on user gesture */ })
    this.fadeTo(el, this.musicVol)
    this.currentEl = el
    this.armHandoff(el, id)
  }

  /** Listen for timeupdate on the playing element; when remaining drops
   *  below HANDOFF_LEAD_S, start the next entry over the tail of this one.
   *  For a single-track selection (playlist length 1) the "next entry"
   *  is the same track on the other buffer — that's the gapless loop.
   *  For 'all' mode it's the next real track. */
  private armHandoff(el: HTMLAudioElement, currentId: RealMusicId) {
    // Tear down any prior handoff so we never have two listeners racing
    // on the same element across selection / volume changes.
    if (this.handoffListener && this.handoffEl) {
      this.handoffEl.removeEventListener('timeupdate', this.handoffListener)
    }

    const listener = () => {
      const dur = el.duration
      if (!isFinite(dur) || dur <= 0) return
      const remaining = dur - el.currentTime
      if (remaining > HANDOFF_LEAD_S) return

      el.removeEventListener('timeupdate', listener)
      if (this.handoffEl === el) {
        this.handoffEl = null
        this.handoffListener = null
      }

      // Pick the next entry in the playlist (looping back to 0).
      const nextIdx = (this.playlistIndex + 1) % Math.max(1, this.playlist.length)
      const nextId = this.playlist[nextIdx]
      this.playlistIndex = nextIdx

      const nextMeta = BGM_MUSIC.find(m => m.id === nextId)
      if (!nextMeta) return
      const nextPair = this.getOrCreateMusicPair(nextId, nextMeta.src)

      // Same-track loop → flip the active buffer so the *other* element
      // plays. Cross-track → use whichever buffer is currently armed on
      // the next track's pair (it's been paused since last play).
      if (nextId === currentId) {
        nextPair.current = nextPair.current === 'a' ? 'b' : 'a'
      }
      const nextEl = nextPair.current === 'a' ? nextPair.a : nextPair.b

      try { nextEl.currentTime = 0 } catch {}
      // Start at target volume so the seam is inaudible. The outgoing
      // element will fade to 0 over the remaining tail.
      nextEl.volume = this.musicVol
      nextEl.play().catch(() => {})
      this.currentEl = nextEl

      // Fade the old element out so end-of-file decoder noise (some MP3s
      // have a tail click) is masked. Pause shortly after the fade completes.
      const tailMs = Math.max(80, Math.round(remaining * 1000))
      this.fadeTo(el, 0, tailMs)
      window.setTimeout(() => el.pause(), tailMs + 50)

      this.armHandoff(nextEl, nextId)
    }

    this.handoffEl = el
    this.handoffListener = listener
    el.addEventListener('timeupdate', listener)
  }

  /** Fade-out + pause every music element, tear down handoff. */
  private stopAllMusic() {
    if (this.handoffListener && this.handoffEl) {
      this.handoffEl.removeEventListener('timeupdate', this.handoffListener)
    }
    this.handoffEl = null
    this.handoffListener = null
    for (const pair of this.musicPairs.values()) {
      for (const el of [pair.a, pair.b]) {
        if (!el.paused) {
          this.fadeTo(el, 0)
          window.setTimeout(() => el.pause(), FADE_MS + 50)
        }
      }
    }
    this.currentEl = null
  }

  /** Enable or disable an ambient overlay. */
  setAmbient(id: BgmAmbientId, enabled: boolean, volume = 0.5) {
    const meta = BGM_AMBIENT.find(a => a.id === id)
    if (!meta) return
    const t = this.getOrCreateAmbient(id, meta.src)
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
      if (this.selection && this.playlist.length > 0) {
        // Resume by replaying the current playlist entry from start.
        // We don't try to preserve mid-track position — focus sessions
        // start fresh, and starting a music selection mid-track on
        // resume is a UX surprise.
        this.playCurrentPlaylistEntry()
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
      this.stopAllMusic()
      for (const t of this.ambient.values()) {
        if (!t.el.paused) {
          this.fadeTo(t.el, 0)
          window.setTimeout(() => t.el.pause(), FADE_MS + 50)
        }
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

export interface AmbientPref { enabled: boolean; volume: number }

export interface BgmSummary {
  summary: string
  hasSelection: boolean
  activeAmbients: AmbientMeta[]
  musicMeta: MusicMeta | null
  /** True iff the user picked 'all' mode (cycle the playlist). */
  isShuffle: boolean
}

// Single source of truth for the "what's playing" string. Both the desktop
// settings panel and the mobile immersive bar read from this so they don't
// drift.
export function summarizeBgm(
  music: BgmMusicId | null,
  ambient: Record<BgmAmbientId, AmbientPref>,
  opts: { allMissingLabel?: string; offLabel?: string; allMissing?: boolean } = {},
): BgmSummary {
  const activeAmbients = BGM_AMBIENT.filter((a) => ambient[a.id]?.enabled)
  const isShuffle = music === 'all'
  const musicMeta = music && music !== 'all' ? BGM_MUSIC.find((m) => m.id === music) ?? null : null
  const hasSelection = !!music || activeAmbients.length > 0
  let summary: string
  if (opts.allMissing) {
    summary = opts.allMissingLabel ?? '尚未加入音檔'
  } else if (!hasSelection) {
    summary = opts.offLabel ?? '關閉'
  } else {
    const parts: string[] = []
    if (isShuffle) parts.push(ALL_MUSIC_LABEL)
    else if (musicMeta) parts.push(musicMeta.label)
    if (activeAmbients.length > 0) parts.push(activeAmbients.map((a) => a.label).join('·'))
    summary = parts.join(' + ')
  }
  return { summary, hasSelection, activeAmbients, musicMeta, isShuffle }
}
