'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { isNative } from '@/lib/platform'

// Browser dictation via the Web Speech API, only where the browser ships it
// (Chrome / Edge / Safari). Deliberately OFF inside the Capacitor iOS shell:
// the app has no NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription
// in Info.plist, and touching the recogniser without them can terminate the
// app — iOS users get the keyboard's own mic key instead (the panel says so).

interface SpeechResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechEventLike {
  resultIndex: number
  results: ArrayLike<SpeechResultLike>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const noopSubscribe = () => () => {}
const supportedSnapshot = () => !!getCtor() && !isNative()
const serverSnapshot = () => false

export function useSpeechDictation(lang: 'zh-TW' | 'en', onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, supportedSnapshot, serverSnapshot)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onFinalRef.current = onFinal
  })

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor || recRef.current) return
    setError(null)
    const rec = new Ctor()
    rec.lang = lang === 'en' ? 'en-US' : 'zh-TW'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) onFinalRef.current(r[0].transcript)
        else live += r[0].transcript
      }
      setInterim(live)
    }
    rec.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'failed')
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      recRef.current = null
      setError('failed')
    }
  }, [lang])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, interim, error, start, stop }
}
