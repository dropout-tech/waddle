'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X, Check, ChevronUp, ChevronDown, Music2, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BGM_MUSIC, BGM_AMBIENT, summarizeBgm,
  ALL_MUSIC_ID, ALL_MUSIC_LABEL, ALL_MUSIC_EMOJI,
  type AmbientPref, type BgmMusicId, type BgmAmbientId,
} from '@/lib/timer-bgm'

export interface ImmersiveProps {
  visible: boolean
  state: 'idle' | 'running' | 'paused'
  phase: 'work' | 'break'
  label: string
  color: string
  timeText: string
  progress: number
  startedAtText: string
  music: BgmMusicId | null
  musicVolume: number
  ambient: Record<BgmAmbientId, AmbientPref>
  bgmPlaying: boolean
  unavailableSrcs: Set<string>
  onPause: () => void
  onResume: () => void
  onExit: () => void
  onToggleBgm: () => void
  // Music picker callbacks so the bar can actually swap tracks mid-session
  // instead of only play/pause. Each call should also unlock audio (Web
  // Audio autoplay policy) before mutating prefs.
  onSelectMusic: (id: BgmMusicId | null) => void
  onMusicVolumeChange: (volume: number) => void
  onToggleAmbient: (id: BgmAmbientId) => void
  onAmbientVolumeChange: (id: BgmAmbientId, volume: number) => void
}

const EXIT_HOLD_MS = 900
const DIM_DELAY_MS = 5000

export function FocusTimerImmersive(props: ImmersiveProps) {
  const {
    visible, state, phase, label, color, timeText, progress, startedAtText,
    music, musicVolume, ambient, bgmPlaying, unavailableSrcs,
    onPause, onResume, onExit, onToggleBgm,
    onSelectMusic, onMusicVolumeChange, onToggleAmbient, onAmbientVolumeChange,
  } = props

  const [dimmed, setDimmed] = useState(false)
  const [showCompletion, setShowCompletion] = useState(false)
  const [showBgmBar, setShowBgmBar] = useState(false)
  const [exitHoldProgress, setExitHoldProgress] = useState(0)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null)
  const exitHoldRef = useRef<{ raf: number; cleared: boolean } | null>(null)
  const prevPhaseRef = useRef<'work' | 'break'>(phase)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Mirror the browser's fullscreen state so the Maximize/Minimize toggle
  // stays in sync even when the user hits Esc to leave native fullscreen.
  // Pressing Esc only drops out of OS-level fullscreen — we DON'T exit
  // the immersive overlay or stop the timer, so the experience degrades
  // gracefully to the CSS overlay.
  useEffect(() => {
    if (typeof document === 'undefined') return
    setFullscreenSupported(!!document.fullscreenEnabled)
    const onChange = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleNativeFullscreen = () => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* ignore — Esc may have already exited */ })
    } else if (containerRef.current?.requestFullscreen) {
      void containerRef.current.requestFullscreen().catch(() => { /* permission/timing — silent */ })
    }
  }

  // When the immersive view unmounts (long-press exit / session end), make
  // sure we drop OS-level fullscreen too. Without this, exiting the timer
  // would leave the browser stuck in fullscreen with no UI to undo it.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  const resetDim = () => {
    setDimmed(false)
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current)
    if (state === 'running') {
      dimTimerRef.current = setTimeout(() => setDimmed(true), DIM_DELAY_MS)
    }
  }

  useEffect(() => {
    if (!visible) return
    resetDim()
    return () => { if (dimTimerRef.current) clearTimeout(dimTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, state])

  useEffect(() => {
    if (!visible) return
    if (prevPhaseRef.current === 'work' && phase === 'break') {
      setShowCompletion(true)
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current)
      completionTimeoutRef.current = setTimeout(() => setShowCompletion(false), 2400)
    }
    prevPhaseRef.current = phase
    return () => { if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current) }
  }, [phase, visible])

  const startExitHold = () => {
    if (exitHoldRef.current) return
    const startedAt = performance.now()
    const ref = { raf: 0, cleared: false }
    exitHoldRef.current = ref
    const step = (now: number) => {
      if (ref.cleared) return
      const elapsed = now - startedAt
      const pct = Math.min(1, elapsed / EXIT_HOLD_MS)
      setExitHoldProgress(pct)
      if (pct >= 1) {
        ref.cleared = true
        exitHoldRef.current = null
        setExitHoldProgress(0)
        onExit()
        return
      }
      ref.raf = requestAnimationFrame(step)
    }
    ref.raf = requestAnimationFrame(step)
  }
  const cancelExitHold = () => {
    if (!exitHoldRef.current) return
    exitHoldRef.current.cleared = true
    cancelAnimationFrame(exitHoldRef.current.raf)
    exitHoldRef.current = null
    setExitHoldProgress(0)
  }

  // Ensure an in-flight long-press RAF doesn't outlive the component. Without
  // this, unmounting mid-hold (e.g., session auto-completes) would let the
  // raf step call setState on an unmounted component and possibly double-
  // fire onExit.
  useEffect(() => {
    return () => {
      if (exitHoldRef.current) {
        exitHoldRef.current.cleared = true
        cancelAnimationFrame(exitHoldRef.current.raf)
        exitHoldRef.current = null
      }
    }
  }, [])

  if (!visible) return null

  const ringRadius = 130
  const ringCirc = 2 * Math.PI * ringRadius
  const isBreak = phase === 'break'

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed inset-0 z-[80] flex flex-col select-none',
        'transition-colors duration-700 ease-out',
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 16%, var(--background))`,
      }}
      onPointerDown={resetDim}
      onTouchMove={resetDim}
      role="dialog"
      aria-modal="true"
      aria-label={isBreak ? '休息計時中' : '專注計時中'}
    >
      <style>{`
        @keyframes waddle-breathe {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.04); }
        }
        @keyframes waddle-ring-pulse {
          0% { transform: scale(1); }
          40% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes waddle-immersive-in {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes waddle-completion-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .waddle-breathe-bg { animation: none !important; opacity: 0.75 !important; }
          .waddle-ring-pulse { animation: none !important; }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="waddle-breathe-bg pointer-events-none absolute inset-0"
        style={{
          // color-mix works for any CSS color form (hex, oklch, var(--…)),
          // so this no longer assumes session.color is a 6-digit hex.
          background: `radial-gradient(circle at 50% 42%, color-mix(in oklch, ${color} 22%, transparent) 0%, color-mix(in oklch, ${color} 8%, transparent) 38%, transparent 72%)`,
          animation: state === 'running' ? 'waddle-breathe 8s ease-in-out infinite' : 'none',
          opacity: state === 'running' ? undefined : 0.55,
        }}
      />

      <div
        className="relative flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3"
        style={{
          opacity: dimmed ? 0.25 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="flex flex-col">
          <span
            className="text-[11px] font-medium tracking-[0.18em] uppercase"
            style={{ color: `color-mix(in oklch, ${color} 70%, var(--foreground))` }}
          >
            {isBreak ? 'Break' : 'Focus'}
          </span>
          <span className="text-sm text-foreground/80 mt-0.5">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {fullscreenSupported && (
            <button
              type="button"
              onClick={toggleNativeFullscreen}
              aria-label={isNativeFullscreen ? '退出全螢幕' : '進入瀏覽器全螢幕'}
              title={isNativeFullscreen ? '退出全螢幕（或按 Esc）' : '進入瀏覽器全螢幕'}
              className="h-10 w-10 rounded-full grid place-items-center text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {isNativeFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); startExitHold() }}
            onPointerUp={cancelExitHold}
            onPointerCancel={cancelExitHold}
            onPointerLeave={cancelExitHold}
            aria-label="長按結束（0.9 秒）"
            className="relative h-10 w-10 rounded-full grid place-items-center text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors touch-none"
          >
            <X className="w-5 h-5" />
            {exitHoldProgress > 0 && (
              <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 40 40">
                <circle
                  cx="20" cy="20" r="18"
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={2 * Math.PI * 18 * (1 - exitHoldProgress)}
                  style={{ transition: 'stroke-dashoffset 60ms linear' }}
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 flex flex-col items-center justify-center px-6"
        style={{
          animation: 'waddle-immersive-in 380ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className="relative">
          <svg
            className={cn('-rotate-90', state === 'running' && 'waddle-ring-pulse')}
            width="300"
            height="300"
            viewBox="0 0 300 300"
            style={{
              animation: state === 'running' && progress > 95 ? 'waddle-ring-pulse 1.4s ease-in-out infinite' : undefined,
            }}
          >
            <circle
              cx="150" cy="150" r={ringRadius}
              fill="none"
              stroke={`color-mix(in oklch, ${color} 18%, var(--card))`}
              strokeWidth="6"
            />
            <circle
              cx="150" cy="150" r={ringRadius}
              fill="none"
              stroke={state === 'paused' ? `color-mix(in oklch, ${color} 50%, var(--muted))` : color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={ringCirc * (1 - Math.min(progress, 100) / 100)}
              style={{ transition: 'stroke-dashoffset 1000ms linear, stroke 700ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-mono font-semibold tabular-nums tracking-tight"
              style={{
                fontSize: timeText.length > 5 ? '3.75rem' : '4.5rem',
                lineHeight: 1,
                color: state === 'paused' ? 'var(--muted-foreground)' : 'var(--foreground)',
                transition: 'color 400ms ease-out',
              }}
            >
              {timeText}
            </span>
            {state === 'paused' && (
              <span className="text-xs text-muted-foreground mt-2 tracking-wider">已暫停</span>
            )}
          </div>
        </div>

        <p
          className="text-[11px] text-muted-foreground mt-8"
          style={{ opacity: dimmed ? 0 : 1, transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          開始於 {startedAtText}
        </p>
      </div>

      <div
        className="relative flex flex-col items-stretch px-5 pb-[max(env(safe-area-inset-bottom),1rem)] gap-3"
        style={{
          opacity: dimmed ? 0 : 1,
          transition: 'opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        <BgmBar
          music={music}
          musicVolume={musicVolume}
          ambient={ambient}
          playing={bgmPlaying}
          color={color}
          expanded={showBgmBar}
          unavailableSrcs={unavailableSrcs}
          onToggleExpand={() => setShowBgmBar(v => !v)}
          onTogglePlay={onToggleBgm}
          onSelectMusic={onSelectMusic}
          onMusicVolumeChange={onMusicVolumeChange}
          onToggleAmbient={onToggleAmbient}
          onAmbientVolumeChange={onAmbientVolumeChange}
        />
        <div className="flex justify-center pt-1">
          {state === 'paused' ? (
            <button
              type="button"
              onClick={onResume}
              aria-label="繼續"
              className="h-16 w-16 rounded-full grid place-items-center text-white shadow-lg active:scale-95 transition-transform"
              style={{ backgroundColor: color }}
            >
              <Play className="w-6 h-6 translate-x-[2px]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              aria-label="暫停"
              className="h-16 w-16 rounded-full grid place-items-center bg-card border border-border text-foreground/70 active:scale-95 transition-transform"
            >
              <Pause className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {showCompletion && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{
            // Solid tinted overlay, no backdrop-blur (DESIGN.md bans
            // glassmorphism defaults). All alpha via color-mix so the
            // gradient works for non-hex color inputs too.
            background: `radial-gradient(circle at 50% 42%, color-mix(in oklch, ${color} 36%, var(--background)) 0%, color-mix(in oklch, ${color} 16%, var(--background)) 50%, color-mix(in oklch, ${color} 8%, var(--background)) 100%)`,
            animation: 'waddle-completion-in 500ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div
            className="h-24 w-24 rounded-full grid place-items-center mb-6 shadow-xl"
            style={{ backgroundColor: color }}
          >
            <Check className="w-12 h-12 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">辛苦了</h2>
          <p className="text-sm text-muted-foreground mt-2">慢慢搖擺，喝口水吧</p>
        </div>
      )}
    </div>
  )
}

interface BgmBarProps {
  music: BgmMusicId | null
  musicVolume: number
  ambient: Record<BgmAmbientId, AmbientPref>
  playing: boolean
  color: string
  expanded: boolean
  unavailableSrcs: Set<string>
  onToggleExpand: () => void
  onTogglePlay: () => void
  onSelectMusic: (id: BgmMusicId | null) => void
  onMusicVolumeChange: (v: number) => void
  onToggleAmbient: (id: BgmAmbientId) => void
  onAmbientVolumeChange: (id: BgmAmbientId, v: number) => void
}

function BgmBar({
  music, musicVolume, ambient, playing, color, expanded, unavailableSrcs,
  onToggleExpand, onTogglePlay,
  onSelectMusic, onMusicVolumeChange, onToggleAmbient, onAmbientVolumeChange,
}: BgmBarProps) {
  // Source of truth for the "what's playing" string lives in lib/timer-bgm
  // so the desktop settings panel and this mobile bar can't drift. The
  // emoji formatting is a presentation choice we apply on top.
  const { hasSelection, activeAmbients, musicMeta, isShuffle } = summarizeBgm(music, ambient, { offLabel: '靜音專注' })
  const musicChip = isShuffle
    ? `${ALL_MUSIC_EMOJI} ${ALL_MUSIC_LABEL}`
    : musicMeta
      ? `${musicMeta.emoji} ${musicMeta.label}`
      : null
  const summary = !hasSelection
    ? '靜音專注'
    : [
        musicChip,
        activeAmbients.length > 0 ? activeAmbients.map((a) => a.emoji).join('') : null,
      ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!hasSelection}
          aria-pressed={playing && hasSelection}
          className={cn(
            'h-9 w-9 shrink-0 rounded-full grid place-items-center transition-colors',
            !hasSelection
              ? 'bg-secondary/40 text-muted-foreground/40'
              : playing
                ? 'text-white'
                : 'bg-secondary text-foreground/70',
          )}
          style={hasSelection && playing ? { backgroundColor: color } : undefined}
        >
          {playing && hasSelection ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <Music2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground/80 truncate">{summary}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border/40 space-y-3">
          {/* Music picker — chips for None / each track / 全部循環. Mirror
              of the desktop setup panel, so users can swap tracks without
              leaving focus mode. */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Music2 className="w-3 h-3" />
              背景音樂
            </label>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectMusic(null)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                  music === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                )}
              >
                無
              </button>
              {BGM_MUSIC.map((m) => {
                const missing = unavailableSrcs.has(m.src)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMusic(m.id)}
                    disabled={missing}
                    title={missing ? '音檔尚未加入（見 public/audio/README.md）' : undefined}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                      missing
                        ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                        : music === m.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span>{m.emoji}</span>{m.label}
                  </button>
                )
              })}
              {(() => {
                const everyMissing = BGM_MUSIC.every((m) => unavailableSrcs.has(m.src))
                return (
                  <button
                    type="button"
                    onClick={() => onSelectMusic(ALL_MUSIC_ID)}
                    disabled={everyMissing}
                    title={everyMissing ? '尚未加入任何音檔（見 public/audio/README.md）' : '依序循環播放所有背景音樂'}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                      everyMissing
                        ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                        : music === ALL_MUSIC_ID
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span>{ALL_MUSIC_EMOJI}</span>{ALL_MUSIC_LABEL}
                  </button>
                )
              })()}
            </div>
            {music && (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={musicVolume}
                onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
                aria-label="背景音樂音量"
                className="w-full h-1 accent-primary"
              />
            )}
          </div>

          {/* Ambient overlays — multi-select, independent volumes. */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">
              環境音（可疊加）
            </label>
            <div className="space-y-1">
              {BGM_AMBIENT.map((a) => {
                const p = ambient[a.id]
                const missing = unavailableSrcs.has(a.src)
                return (
                  <div key={a.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAmbient(a.id)}
                      aria-pressed={p.enabled}
                      disabled={missing}
                      title={missing ? '音檔尚未加入（見 public/audio/README.md）' : undefined}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 w-[68px] justify-start',
                        missing
                          ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                          : p.enabled
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <span>{a.emoji}</span>{a.label}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={p.volume}
                      disabled={!p.enabled || missing}
                      onChange={(e) => onAmbientVolumeChange(a.id, parseFloat(e.target.value))}
                      aria-label={`${a.label}音量`}
                      className="flex-1 h-1 accent-primary disabled:opacity-40"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
