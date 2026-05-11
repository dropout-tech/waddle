// Short, cute "task complete" chime via Web Audio API. Plays a quick
// three-note ascending arpeggio with a sparkle on top — celebratory but
// not disruptive. Independent context per call so we don't leak nodes
// across many completions in a session.

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
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  const ctx = new AudioCtx()
  const now = ctx.currentTime

  // Three-note ascending arpeggio: C6 → E6 → G6, then a sparkle C7 on top.
  // Higher register than the timer chime so it reads as "small win" not "alarm".
  const notes: Array<{ freq: number; start: number; dur: number; gain: number; type: OscillatorType }> = [
    { freq: 1046.5, start: 0.0,  dur: 0.12, gain: 0.28, type: 'sine' },     // C6
    { freq: 1318.5, start: 0.07, dur: 0.12, gain: 0.26, type: 'sine' },     // E6
    { freq: 1568.0, start: 0.14, dur: 0.18, gain: 0.28, type: 'sine' },     // G6
    { freq: 2093.0, start: 0.20, dur: 0.20, gain: 0.16, type: 'triangle' }, // C7 sparkle
  ]

  let totalEnd = 0
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
    if (t1 > totalEnd) totalEnd = t1
  }

  window.setTimeout(() => {
    void ctx.close()
  }, Math.ceil((totalEnd - now) * 1000) + 200)
}
