// Generate timer completion sounds via Web Audio API so we don't depend on
// shipping audio assets (which 404 silently and have autoplay quirks). The
// sounds are short tonal chimes — pleasant enough not to startle but loud
// enough to notice. Each call is independent; no shared AudioContext state
// to leak across hot reloads.

export type TimerSoundKind = 'chime' | 'bell' | 'beep' | 'silent'

interface ToneSpec {
  freq: number
  startSec: number
  durationSec: number
  /** 0..1, applied at the peak of the envelope */
  gain: number
}

const TONES: Record<Exclude<TimerSoundKind, 'silent'>, ToneSpec[]> = {
  // Major triad arpeggio — classic "ding" feel
  chime: [
    { freq: 523.25, startSec: 0, durationSec: 0.6, gain: 0.4 },     // C5
    { freq: 659.25, startSec: 0.12, durationSec: 0.6, gain: 0.35 }, // E5
    { freq: 783.99, startSec: 0.24, durationSec: 0.7, gain: 0.35 }, // G5
  ],
  // Single sustained bell — meditative
  bell: [
    { freq: 880, startSec: 0, durationSec: 1.4, gain: 0.4 }, // A5
    { freq: 1318.5, startSec: 0, durationSec: 1.4, gain: 0.18 }, // E6 harmonic
  ],
  // Three short beeps — utility timer feel
  beep: [
    { freq: 880, startSec: 0, durationSec: 0.18, gain: 0.5 },
    { freq: 880, startSec: 0.28, durationSec: 0.18, gain: 0.5 },
    { freq: 880, startSec: 0.56, durationSec: 0.18, gain: 0.5 },
  ],
}

export function playTimerSound(kind: TimerSoundKind) {
  if (kind === 'silent') return
  if (typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  const ctx = new AudioCtx()
  const now = ctx.currentTime
  const tones = TONES[kind]
  let totalEnd = 0
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = tone.freq
    // Quick attack, exponential release — natural chime envelope
    const t0 = now + tone.startSec
    const t1 = t0 + tone.durationSec
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.05)
    if (t1 > totalEnd) totalEnd = t1
  }
  // Close the context shortly after playback so we don't leak audio nodes
  // across many timer cycles in a long-running session.
  window.setTimeout(() => {
    void ctx.close()
  }, Math.ceil((totalEnd - now) * 1000) + 200)
}

export const TIMER_SOUND_LABELS: Record<TimerSoundKind, string> = {
  chime: '鈴聲',
  bell: '鐘聲',
  beep: '嗶嗶',
  silent: '靜音',
}
