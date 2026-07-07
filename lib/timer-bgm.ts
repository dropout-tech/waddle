// Background music + ambient overlay engine for the focus timer.
//
// Two channels with different implementations, chosen per usage pattern:
//
// • Music — Web Audio API. AudioBufferSourceNode.loop=true loops the
//   pre-decoded PCM sample-accurately, the *canonical* way to do
//   gapless looping on the web. The previous HTMLAudioElement
//   approaches (native `loop=true`, and a hand-rolled dual-buffer
//   handoff on `timeupdate`) both produced an audible click at the
//   loop seam because MP3 frames have priming silence at start/end
//   that gets re-decoded on every loop reset. Decoding once into a
//   buffer and letting the audio thread loop the raw samples
//   sidesteps the problem entirely.
//
//   In 'all' (shuffle) mode the loop flag stays off and we schedule
//   the *next* track to start with a short crossfade right before the
//   current one ends, using sample-accurate Web Audio scheduling.
//
// • Ambient overlays (rain, fire, waves, cafe) — kept on
//   HTMLAudioElement with native loop=true. They're noise, so any
//   seam click is masked by the noise floor; refactoring all 4 to
//   Web Audio would double decode memory + latency for no perceptible
//   gain.
//
// Missing files (404) resolve quietly and mark the track unavailable —
// the UI surfaces that as a disabled state.

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

const FADE_S = 0.3
/** When in 'all' mode, schedule the next track to start this many seconds
 *  before the current one ends, so the crossfade hides the transition.
 *  Must be > 2× the typical audio-thread render quantum (~10ms) plus the
 *  fade duration. 0.4s is comfortable and inaudible as a "boundary". */
const SHUFFLE_LEAD_S = 0.4

interface ActiveMusic {
  id: RealMusicId
  source: AudioBufferSourceNode
  gain: GainNode
  /** Wall-clock setTimeout id for the next scheduled shuffle transition.
   *  Null in single-track loop mode (the source itself loops forever). */
  shuffleTimer: number | null
}

interface AmbientTrack {
  el: HTMLAudioElement
  targetVol: number
}

type BufferState = AudioBuffer | 'loading' | 'failed' | 'idle'

class BgmEngine {
  private ctx: AudioContext | null = null
  /** Decoded buffers + their load state. */
  private buffers = new Map<RealMusicId, BufferState>()
  /** Promises for in-flight loads so concurrent calls don't double-fetch. */
  private loading = new Map<RealMusicId, Promise<AudioBuffer | null>>()
  /** Raw fetched bytes, kept around so we can decode lazily once the
   *  AudioContext exists. We separate fetch (does not need a gesture) from
   *  decode + ctx creation (do). This is the key fix for the "press play
   *  → nothing happens" bug: previously preload() created an AudioContext
   *  during a mount useEffect (outside any user gesture), and several
   *  browsers refuse to resume() a context born like that — even if
   *  resume() is later called inside a click. Now the context is created
   *  exclusively from synchronous click handlers via unlockAudio(). */
  private prefetched = new Map<RealMusicId, ArrayBuffer | 'failed'>()
  private prefetching = new Map<RealMusicId, Promise<ArrayBuffer | null>>()

  /** The currently-audible music node, if any. */
  private active: ActiveMusic | null = null

  private ambient = new Map<BgmAmbientId, AmbientTrack>()

  /** Whatever the user picked: 'all', a real id, or null. */
  private selection: BgmMusicId | null = null
  /** Ordered real-id playlist. Length 1 for single track; length N for 'all'. */
  private playlist: RealMusicId[] = []
  private playlistIndex = 0

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

  /** Synchronously create + resume the AudioContext from inside a click
   *  handler. Browsers (esp. Safari, recent Chrome) only honour
   *  `ctx.resume()` while the user-gesture token is still hot — that
   *  token does NOT survive React's render → useEffect roundtrip nor a
   *  preceding `await`. So every button that wants audio must call this
   *  *synchronously* in its onClick, before any state updates.
   *
   *  Safe to call repeatedly; resume() on an already-running context is
   *  a no-op. Fire-and-forget — we never await it because awaiting would
   *  itself burn the gesture credit. */
  unlockAudio() {
    const ctx = this.ensureCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      // Intentionally not awaited — caller is in a sync click path.
      ctx.resume().catch(() => {})
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx
    if (typeof window === 'undefined') return null
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    this.ctx = new Ctor()
    return this.ctx
  }

  /** Fetch the raw MP3 bytes for an id, without touching AudioContext.
   *  Safe to call at any time (mount, no user gesture required). */
  private async prefetchBytes(id: RealMusicId): Promise<ArrayBuffer | null> {
    const cached = this.prefetched.get(id)
    if (cached && cached !== 'failed') return cached
    if (cached === 'failed') return null
    const inflight = this.prefetching.get(id)
    if (inflight) return inflight

    const meta = BGM_MUSIC.find(m => m.id === id)
    if (!meta) return null

    const p = (async () => {
      try {
        const resp = await fetch(meta.src)
        if (!resp.ok) throw new Error(`http ${resp.status}`)
        const arr = await resp.arrayBuffer()
        this.prefetched.set(id, arr)
        return arr
      } catch {
        this.prefetched.set(id, 'failed')
        this.unavailable.add(meta.src)
        this.notify()
        return null
      } finally {
        this.prefetching.delete(id)
      }
    })()
    this.prefetching.set(id, p)
    return p
  }

  /** Idempotent per-id. Returns the decoded AudioBuffer, or null if the
   *  file 404'd or decoding failed. Requires an AudioContext, so callers
   *  must come from a user-gesture path (startPlaylistEntry, which is
   *  triggered by setPlaying(true) from a click handler). */
  private async loadBuffer(id: RealMusicId): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id)
    if (cached && typeof cached !== 'string') return cached
    if (cached === 'failed') return null
    const inflight = this.loading.get(id)
    if (inflight) return inflight

    const meta = BGM_MUSIC.find(m => m.id === id)
    if (!meta) return null
    const ctx = this.ensureCtx()
    if (!ctx) return null

    this.buffers.set(id, 'loading')
    const p = (async () => {
      try {
        // Reuse prefetched bytes if available; otherwise fetch now.
        let arr = this.prefetched.get(id)
        if (!arr || arr === 'failed') {
          const fetched = await this.prefetchBytes(id)
          if (!fetched) throw new Error('fetch failed')
          arr = fetched
        }
        // decodeAudioData detaches the ArrayBuffer; clone so a second
        // decode (after a failed gesture, say) still has bytes.
        const buf = await ctx.decodeAudioData((arr as ArrayBuffer).slice(0))
        this.buffers.set(id, buf)
        return buf
      } catch {
        this.buffers.set(id, 'failed')
        this.unavailable.add(meta.src)
        this.notify()
        return null
      } finally {
        this.loading.delete(id)
      }
    })()
    this.loading.set(id, p)
    return p
  }

  /** Pre-fetch all music bytes and pre-construct ambient <audio> elements
   *  so the UI can render which files 404'd before the user clicks. Does
   *  NOT create an AudioContext — that's deferred to the first click via
   *  unlockAudio(). */
  preload() {
    for (const m of BGM_MUSIC) {
      if (!this.prefetched.has(m.id)) {
        this.prefetchBytes(m.id).catch(() => {})
      }
    }
    for (const a of BGM_AMBIENT) this.getOrCreateAmbient(a.id, a.src)
  }

  private getOrCreateAmbient(id: BgmAmbientId, src: string): AmbientTrack {
    let t = this.ambient.get(id)
    if (t) return t
    const el = new Audio(src)
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

  setMusic(id: BgmMusicId | null) {
    if (id === this.selection) return
    this.stopActiveMusic()
    this.selection = id
    this.playlist = this.buildPlaylist(id)
    this.playlistIndex = 0
    if (this.playing && this.playlist.length > 0) {
      this.startPlaylistEntry().catch(() => {})
    }
  }

  setMusicVolume(v: number) {
    this.musicVol = Math.max(0, Math.min(1, v))
    if (this.active && this.ctx) {
      const now = this.ctx.currentTime
      const g = this.active.gain.gain
      // Cancel any pending fades (e.g., the shuffle-mode end fade) so the
      // user's slider drag takes effect immediately rather than fighting a
      // scheduled ramp. We re-arm the end-fade in startPlaylistEntry; for
      // single-track loop there's nothing to re-arm.
      g.cancelScheduledValues(now)
      g.setValueAtTime(g.value, now)
      g.linearRampToValueAtTime(this.musicVol, now + 0.08)
    }
  }

  /** Start the playlist[playlistIndex] track. In single-track mode the
   *  AudioBufferSourceNode loops itself forever (gapless). In shuffle
   *  mode the source plays once and we schedule the next entry to
   *  start SHUFFLE_LEAD_S before this one ends. */
  private async startPlaylistEntry() {
    if (!this.playing || this.playlist.length === 0) return
    const id = this.playlist[this.playlistIndex]
    const buf = await this.loadBuffer(id)
    if (!buf) {
      // Skip missing tracks in shuffle mode so the playlist keeps moving.
      if (this.playlist.length > 1) {
        this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length
        if (this.playing) this.startPlaylistEntry().catch(() => {})
      }
      return
    }
    const ctx = this.ensureCtx()
    if (!ctx) return
    // Autoplay-policy compliance: a context spawned outside a user
    // gesture starts suspended. setMusic / setPlaying are always called
    // from React handlers triggered by clicks, so resume() succeeds.
    if (ctx.state === 'suspended') {
      try { await ctx.resume() } catch {}
    }

    const source = ctx.createBufferSource()
    source.buffer = buf
    const isShuffle = this.playlist.length > 1
    source.loop = !isShuffle

    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain).connect(ctx.destination)

    const startAt = ctx.currentTime
    source.start(startAt)
    // Fade in to the user's target volume.
    gain.gain.linearRampToValueAtTime(this.musicVol, startAt + FADE_S)

    const entry: ActiveMusic = { id, source, gain, shuffleTimer: null }
    this.active = entry

    if (isShuffle) {
      const dur = buf.duration
      const fadeStartAt = startAt + Math.max(0, dur - SHUFFLE_LEAD_S)
      const endAt = startAt + dur
      // Fade out over the tail. setValueAtTime anchors the volume so
      // linearRampToValueAtTime ramps from the right starting value.
      gain.gain.setValueAtTime(this.musicVol, fadeStartAt)
      gain.gain.linearRampToValueAtTime(0, endAt)

      // setTimeout offset is wall-clock from now; subtract ctx time we've
      // already consumed (which is 0 since startAt === currentTime).
      const msUntilNext = Math.max(0, (fadeStartAt - ctx.currentTime) * 1000)
      entry.shuffleTimer = window.setTimeout(() => {
        if (this.active !== entry) return
        this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length
        // Old source will fade to 0 and stop naturally; just start the next.
        this.startPlaylistEntry().catch(() => {})
        // Disconnect the old source AFTER its scheduled end so we don't
        // cut the tail crossfade short.
        try { entry.source.stop(endAt + 0.05) } catch {}
      }, msUntilNext)
    }
  }

  /** Stop whatever's playing on the music channel with a fade.
   *  `fadeSeconds` defaults to the quick utility fade; the timer's gentle
   *  completion sequence passes a longer one (~1.5s) so the music ends with
   *  the session instead of being clipped. */
  private stopActiveMusic(fadeSeconds: number = FADE_S) {
    const a = this.active
    if (!a) return
    this.active = null
    if (a.shuffleTimer !== null) window.clearTimeout(a.shuffleTimer)
    const ctx = this.ctx
    if (!ctx) {
      try { a.source.stop() } catch {}
      try { a.source.disconnect() } catch {}
      try { a.gain.disconnect() } catch {}
      return
    }
    const now = ctx.currentTime
    const g = a.gain.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0, now + fadeSeconds)
    try { a.source.stop(now + fadeSeconds + 0.05) } catch {}
    // Disconnect once the fade finishes (free GC reachability).
    window.setTimeout(() => {
      try { a.source.disconnect() } catch {}
      try { a.gain.disconnect() } catch {}
    }, (fadeSeconds + 0.1) * 1000)
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
      this.fadeAmbient(t.el, t.targetVol)
    } else {
      this.fadeAmbient(t.el, 0)
      if (!enabled) {
        window.setTimeout(() => { if (t.targetVol === 0) t.el.pause() }, FADE_S * 1000 + 50)
      }
    }
  }

  /** rAF fade for HTMLAudioElement (ambient). Clamps every write to [0,1]
   *  — out-of-range volume throws IndexSizeError and one throw stalls the
   *  whole BGM chain. */
  private fadeHandles = new WeakMap<HTMLAudioElement, number>()
  private fadeAmbient(el: HTMLAudioElement, to: number, ms = FADE_S * 1000) {
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
      el.volume = Math.max(0, Math.min(1, from + (target - from) * p))
      if (p < 1) {
        this.fadeHandles.set(el, requestAnimationFrame(tick))
      } else {
        this.fadeHandles.delete(el)
      }
    }
    this.fadeHandles.set(el, requestAnimationFrame(tick))
  }

  /** Start/stop everything (call when timer starts/stops).
   *  `opts.fadeSeconds` lengthens the stop fade-out (music + ambient) — the
   *  timer's completion sequence uses ~1.5s so the audio lands softly. */
  setPlaying(on: boolean, opts?: { fadeSeconds?: number }) {
    if (on === this.playing) return
    this.playing = on
    if (on) {
      if (this.selection && this.playlist.length > 0) {
        this.startPlaylistEntry().catch(() => {})
      }
      for (const [id, t] of this.ambient) {
        if (t.targetVol > 0) {
          const meta = BGM_AMBIENT.find(a => a.id === id)
          if (!meta || this.unavailable.has(meta.src)) continue
          t.el.play().catch(() => {})
          this.fadeAmbient(t.el, t.targetVol)
        }
      }
    } else {
      const fadeS = opts?.fadeSeconds ?? FADE_S
      this.stopActiveMusic(fadeS)
      for (const t of this.ambient.values()) {
        if (!t.el.paused) {
          this.fadeAmbient(t.el, 0, fadeS * 1000)
          window.setTimeout(() => t.el.pause(), fadeS * 1000 + 50)
        }
      }
    }
  }
}

// Lazy singleton so SSR doesn't choke on `new Audio()` / `new AudioContext()`.
// Returns null on the server — callers must guard.
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
