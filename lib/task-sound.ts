// Short, cute "task complete" chime via Web Audio API. Plays a quick
// three-note ascending arpeggio with a sparkle on top — celebratory but
// not disruptive.
//
// We keep a single AudioContext for the lifetime of the page. Creating /
// closing a context per call introduced a perceptible delay when users
// completed a task right after un-completing one: the previous context
// was still tearing down when the next call started, so the second sound
// would either drop or feel laggy. A shared context plays back-to-back
// instantly and survives browser autoplay-policy constraints because
// each click counts as a fresh user gesture that can resume() it.

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (sharedCtx) return sharedCtx
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  sharedCtx = new AudioCtx()
  return sharedCtx
}

// Per-device preference (localStorage). Default on. Mirrors how the timer
// stores its sound choice — personal toggle, not synced across devices.
export const TASK_SOUND_PREF_KEY = 'waddle.taskCompleteSound.enabled'

export function getTaskCompleteSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(TASK_SOUND_PREF_KEY)
    if (raw === null) return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

export function setTaskCompleteSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TASK_SOUND_PREF_KEY, enabled ? '1' : '0')
  } catch {}
}

export function playTaskCompleteSound() {
  if (typeof window === 'undefined') return
  if (!getTaskCompleteSoundEnabled()) return

  const ctx = getContext()
  if (!ctx) return

  // Autoplay policy: a context created before any user gesture starts
  // in 'suspended' state. resume() is a no-op when already running, and
  // safe to fire-and-forget — it just unlocks playback for subsequent
  // notes. Each click qualifies as a gesture so this lands cleanly.
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const now = ctx.currentTime

  // Three-note ascending arpeggio: C6 → E6 → G6, then a sparkle C7 on top.
  // Higher register than the timer chime so it reads as "small win" not "alarm".
  const notes: Array<{ freq: number; start: number; dur: number; gain: number; type: OscillatorType }> = [
    { freq: 1046.5, start: 0.0,  dur: 0.12, gain: 0.28, type: 'sine' },     // C6
    { freq: 1318.5, start: 0.07, dur: 0.12, gain: 0.26, type: 'sine' },     // E6
    { freq: 1568.0, start: 0.14, dur: 0.18, gain: 0.28, type: 'sine' },     // G6
    { freq: 2093.0, start: 0.20, dur: 0.20, gain: 0.16, type: 'triangle' }, // C7 sparkle
  ]

  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = n.type
    osc.frequency.value = n.freq
    const t0 = now + n.start
    const t1 = t0 + n.dur
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(n.gain, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.04)
  }
}
