'use client'

import { useEffect } from 'react'
import {
  Play, Timer, Clock,
  ChevronDown, Settings2,
  Volume2, VolumeX,
  Maximize2, Pause,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/lib/i18n/react'
import type { Workspace } from '@/lib/types'
import { playTimerSound, TIMER_SOUND_LABELS, type TimerSoundKind } from '@/lib/timer-sound'
import {
  BGM_MUSIC, BGM_AMBIENT, getBgmEngine, summarizeBgm,
  ALL_MUSIC_ID, ALL_MUSIC_LABEL, ALL_MUSIC_EMOJI,
} from '@/lib/timer-bgm'
import { Music2 } from 'lucide-react'
import { formatTime } from '@/lib/timer-format'
import { useFocusTimer, POMODORO_PRESETS, FOCUS_TYPES } from './focus-timer-provider'

interface FocusTimerProps {
  workspaces: Workspace[]
  onCreateTimeBlock?: (date: string, startTime: string, endTime: string, type: string, label: string, color: string) => void
}

/**
 * Idle setup card ("開始專注" collapsed button + expanded settings panel).
 * All state/engine logic lives in FocusTimerProvider (mounted globally in
 * app/layout.tsx) so a running session survives navigation away from
 * MainLayout. This component:
 *   1. registers `onCreateTimeBlock` as the provider's calendar recorder
 *      while it's mounted (MainLayout only — that's where the real
 *      workspaces/categories mutation lives), and
 *   2. renders nothing while a session is running/paused/completed — the
 *      provider portals FocusTimerMini/Immersive onto document.body for
 *      that, visible on every route, not just here.
 */
export function FocusTimer({ onCreateTimeBlock }: FocusTimerProps) {
  const isMobile = useIsMobile()
  const ft = useFocusTimer()
  const { t } = useI18n()

  useEffect(() => {
    if (!onCreateTimeBlock) return
    return ft.registerRecorder(onCreateTimeBlock)
    // Intentionally depend on ft.registerRecorder (stable useCallback
    // identity), not the whole `ft` object — `ft` gets a new reference on
    // every tick while a session is running, which would re-run this
    // (harmless but pointless) unregister/register cycle every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ft.registerRecorder, onCreateTimeBlock])

  // Running/paused/completed sessions are rendered globally by the provider
  // (portal onto document.body) — this component only ever shows the idle
  // setup card. state is only ever non-'idle' here for a brief instant
  // during the very first render after startTimer(), same as the original
  // component's early-return guard.
  if (ft.state !== 'idle') return null

  const {
    isExpanded, setIsExpanded, mode, setMode, selectedPreset, setSelectedPreset,
    customMinutes, setCustomMinutes, useCustom, setUseCustom, focusType, setFocusType,
    customLabel, setCustomLabel, showSettings, setShowSettings, showBgmSettings, setShowBgmSettings,
    bgmManualPlaying, setBgmManualPlaying, prefs, setPrefs, unavailableSrcs, displayTime,
    startTimer, state,
  } = ft

  // Mobile expanded mode renders as a backdrop + bottom sheet (full-width,
  // slide-up from above the tab bar). Desktop keeps the corner card.
  const mobileExpanded = isMobile && isExpanded

  return (
    <>
      {/* Mobile sheet backdrop — clicking it collapses the panel. */}
      {mobileExpanded && (
        <div
          className="fixed inset-0 z-overlay bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Timer Button/Widget — sits above the bottom tab bar on
          mobile (with iOS safe-area-inset-bottom). On mobile, the expanded
          panel becomes a full-width bottom sheet that slides up from the
          screen edge. */}
      <div
        className={cn(
          "fixed z-40 transition-all duration-300",
          // Collapsed mobile: floating chip in the right corner above the
          // tab bar. Expanded mobile: full-width sheet anchored to bottom.
          mobileExpanded
            ? 'inset-x-0 bottom-0 animate-in slide-in-from-bottom duration-300'
            : isMobile
              ? 'right-3'
              : 'bottom-6 right-6',
          !isMobile && (isExpanded ? "w-80 max-w-[calc(100vw-2rem)]" : "w-auto")
        )}
        style={isMobile && !mobileExpanded ? { bottom: 'calc(78px + env(safe-area-inset-bottom))' } : undefined}
      >
        {/* Expanded Panel */}
        {isExpanded ? (
          <div
            className={cn(
              "bg-card",
              mobileExpanded
                ? "border-t border-border rounded-t-3xl shadow-2xl max-h-[88dvh] overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),0.5rem)]"
                : "overflow-hidden border border-border rounded-3xl shadow-xl"
            )}
          >
            {/* Mobile sheet grab handle */}
            {mobileExpanded && (
              <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
                <span className="block w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            {/* Header — just the title + collapse. The old 角落⟷全屏 pref
                toggle lived here and looked like an action button (same
                Maximize2 icon as real zoom actions) while only flipping a
                preference — a trap. Immediate zoom is now the 「放大開始」
                action next to the start button; the remembered preference
                moved into the 更多 panel where settings belong. */}
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <span className="text-[15px] font-semibold tracking-tight text-foreground">{t('專注')}</span>
              <button
                onClick={() => setIsExpanded(false)}
                aria-label={t('收合')}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Tier 1 — essentials, always visible. Pick how long and what
                you're focusing on; flow/sound/music live behind the 「更多」
                summary row below the start button. */}
            {state === 'idle' && (
              <div className="px-5 pt-3 pb-1 space-y-4">
                {/* Mode toggle */}
                <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl">
                  <button
                    onClick={() => setMode('pomodoro')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors",
                      mode === 'pomodoro' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Timer className="w-4 h-4" />
                    {t('番茄鐘')}
                  </button>
                  <button
                    onClick={() => setMode('stopwatch')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-colors",
                      mode === 'stopwatch' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    {t('正計時')}
                  </button>
                </div>

                {/* Duration presets — big number-hero chips. Selected uses a
                    soft tint of the preset color + a colored ring, never a loud
                    full-saturation fill. */}
                {mode === 'pomodoro' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      {POMODORO_PRESETS.map((preset, idx) => {
                        const active = !useCustom && selectedPreset === idx
                        return (
                          <button
                            key={idx}
                            onClick={() => { setSelectedPreset(idx); setUseCustom(false) }}
                            className={cn(
                              "flex flex-col items-center justify-center gap-0.5 rounded-2xl border py-2.5 transition-all",
                              active ? "shadow-sm" : "border-border/60 bg-secondary/30 hover:bg-secondary/60",
                            )}
                            style={active ? {
                              backgroundColor: `color-mix(in oklch, ${preset.color} 16%, var(--card))`,
                              borderColor: `color-mix(in oklch, ${preset.color} 55%, var(--border))`,
                            } : undefined}
                          >
                            <span
                              className="text-lg font-semibold tabular-nums leading-none"
                              style={active ? { color: `color-mix(in oklch, ${preset.color} 72%, var(--foreground))` } : undefined}
                            >
                              {preset.minutes}
                            </span>
                            <span className={cn("text-[11px] leading-none", active ? "text-foreground/70" : "text-muted-foreground")}>
                              {t(preset.label)}
                            </span>
                          </button>
                        )
                      })}
                      {/* 自訂 — same footprint as a preset chip */}
                      <button
                        onClick={() => setUseCustom(true)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-0.5 rounded-2xl border py-2.5 transition-all",
                          useCustom ? "shadow-sm bg-primary/10 border-primary/40" : "border-border/60 bg-secondary/30 hover:bg-secondary/60",
                        )}
                      >
                        <Settings2 className={cn("w-4 h-4", useCustom ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-[11px] leading-none", useCustom ? "text-primary" : "text-muted-foreground")}>
                          {t('自訂')}
                        </span>
                      </button>
                    </div>
                    {useCustom && (
                      <div className="flex items-center justify-center gap-2 pt-0.5">
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          value={customMinutes}
                          onChange={(e) => setCustomMinutes(parseInt(e.target.value) || 25)}
                          className="w-20 h-9 text-sm text-center"
                        />
                        <span className="text-sm text-muted-foreground">{t('分鐘')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Focus type (for stopwatch) — soft-tint selection */}
                {mode === 'stopwatch' && (
                  <div className="grid grid-cols-2 gap-2">
                    {FOCUS_TYPES.map((type) => {
                      const active = focusType.key === type.key
                      return (
                        <button
                          key={type.key}
                          onClick={() => setFocusType(type)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-[13px] font-medium transition-all",
                            active ? "shadow-sm" : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                          )}
                          style={active ? {
                            backgroundColor: `color-mix(in oklch, ${type.color} 16%, var(--card))`,
                            borderColor: `color-mix(in oklch, ${type.color} 55%, var(--border))`,
                            color: `color-mix(in oklch, ${type.color} 72%, var(--foreground))`,
                          } : undefined}
                        >
                          <type.icon className="w-4 h-4" />
                          {t(type.label)}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Intention — what are you focusing on? */}
                <Input
                  placeholder={t('在專注什麼？（選填）')}
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="h-10 text-sm rounded-xl"
                />
              </div>
            )}

            {/* 更多 — one quiet summary row that opens the advanced panel
                (break / sound / music). Replaces the old gear icon. */}
            {state === 'idle' && (() => {
              const allMissing = BGM_MUSIC.every((m) => unavailableSrcs.has(m.src))
                && BGM_AMBIENT.every((a) => unavailableSrcs.has(a.src))
              const { summary: bgmSummary } = summarizeBgm(prefs.music, prefs.ambient, { allMissing })
              const detail = [
                t(TIMER_SOUND_LABELS[prefs.sound]),
                bgmSummary,
                mode === 'pomodoro' ? t('休息 {min} 分', { min: prefs.breakMinutes }) : null,
              ].filter(Boolean).join(' · ')
              return (
                <div className="px-5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSettings((v) => !v)}
                    aria-expanded={showSettings}
                    className="w-full flex items-center gap-2 py-2.5 px-1 -mx-1 rounded-lg hover:bg-secondary/40 transition-colors text-left"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground shrink-0">{t('更多')}</span>
                    <span className="text-[11px] text-foreground/55 truncate flex-1 min-w-0">{detail}</span>
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", showSettings && "rotate-180")} />
                  </button>
                </div>
              )
            })()}

            {/* Advanced panel — break / sound / music. Behind the 更多 row. */}
            {showSettings && state === 'idle' && (
              <div className="px-5 pb-2 space-y-4 border-t border-border/50 pt-3">
                {/* Where sessions open by default. This is the remembered
                    preference (「開始時自動放大」); the header-adjacent
                    「放大開始」 button is the immediate one-off action. */}
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, openInImmersive: !p.openInImmersive }))}
                    aria-pressed={prefs.openInImmersive}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 text-left"
                  >
                    <span className="text-[11px] text-muted-foreground">{t('開始時直接進入沉浸畫面')}</span>
                    <span
                      className={cn(
                        'relative w-8 h-4 rounded-full transition-colors flex-shrink-0',
                        prefs.openInImmersive ? 'bg-primary' : 'bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                          prefs.openInImmersive ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </span>
                  </button>
                )}

                {/* Pomodoro flow settings — break length, auto-start, sound */}
                {mode === 'pomodoro' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground" htmlFor="timer-break-mins">
                        {t('休息時長（分）')}
                      </label>
                      <Input
                        id="timer-break-mins"
                        type="number"
                        min={1}
                        max={60}
                        value={prefs.breakMinutes}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          setPrefs((p) => ({ ...p, breakMinutes: Number.isFinite(v) && v > 0 ? v : 5 }))
                        }}
                        className="w-16 h-7 text-xs text-center"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, autoStartBreak: !p.autoStartBreak }))}
                      aria-pressed={prefs.autoStartBreak}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-secondary/50 text-left"
                    >
                      <span className="text-[11px] text-muted-foreground">{t('完成後自動進入休息')}</span>
                      <span
                        className={cn(
                          'relative w-8 h-4 rounded-full transition-colors flex-shrink-0',
                          prefs.autoStartBreak ? 'bg-primary' : 'bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                            prefs.autoStartBreak ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </span>
                    </button>

                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        {prefs.sound === 'silent' ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        {t('提示音')}
                      </label>
                      <div className="flex gap-1">
                        {(['chime', 'bell', 'beep', 'silent'] as TimerSoundKind[]).map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              setPrefs((p) => ({ ...p, sound: k }))
                              // Preview the sound when picking, except for silent.
                              if (k !== 'silent') playTimerSound(k)
                            }}
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                              prefs.sound === k
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                            )}
                          >
                            {t(TIMER_SOUND_LABELS[k])}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {/* Background music + ambient overlays — collapsible so the
                    settings panel stays scannable. Available in both pomodoro
                    and stopwatch. When closed, summarizes the active selection
                    so the user knows whether anything is playing. */}
                {(() => {
                  const allMissing = BGM_MUSIC.every(m => unavailableSrcs.has(m.src))
                    && BGM_AMBIENT.every(a => unavailableSrcs.has(a.src))
                  // Pull the summary string from the shared util so the
                  // immersive bar (focus-timer-immersive.tsx) and this
                  // settings panel render the same canonical text.
                  const { summary, hasSelection } = summarizeBgm(prefs.music, prefs.ambient, { allMissing })
                  // This card only ever renders while idle (see the early
                  // return above), so state is never 'running' here — the
                  // manual play toggle is the only thing driving playback
                  // from this settings panel.
                  const isPlaying = bgmManualPlaying
                  return (
                <div className="pt-2 border-t border-border/60">
                  <div className="w-full flex items-center justify-between gap-2 py-1.5 px-1 -mx-1 rounded-md hover:bg-secondary/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasSelection || allMissing) return
                        // Web Audio autoplay policy: must resume the
                        // context synchronously from the click handler,
                        // before any awaits / React re-renders eat the
                        // user-gesture token. Without this, the play
                        // button "does nothing" — ctx stays suspended.
                        getBgmEngine()?.unlockAudio()
                        setBgmManualPlaying(v => !v)
                      }}
                      disabled={!hasSelection || allMissing}
                      aria-pressed={isPlaying}
                      title={!hasSelection ? t('請先選擇音樂或環境音') : isPlaying ? t('暫停') : t('播放')}
                      className={cn(
                        'w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors',
                        !hasSelection || allMissing
                          ? 'bg-secondary/30 text-muted-foreground/40 cursor-not-allowed'
                          : isPlaying
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'bg-secondary/60 text-foreground hover:bg-secondary',
                      )}
                    >
                      {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 translate-x-[0.5px]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBgmSettings(v => !v)}
                      aria-expanded={showBgmSettings}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <Music2 className="w-3 h-3" />
                        {t('背景音 / 環境音')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-[10px] truncate max-w-[140px]',
                          allMissing ? 'text-muted-foreground/60 italic' : 'text-foreground/70'
                        )}>
                          {summary}
                        </span>
                        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', showBgmSettings && 'rotate-180')} />
                      </span>
                    </button>
                  </div>
                  {showBgmSettings && (
                <div className="space-y-2 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Music2 className="w-3 h-3" />
                        {t('背景音樂')}
                      </label>
                      <div className="flex gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            getBgmEngine()?.unlockAudio()
                            setPrefs((p) => ({ ...p, music: null }))
                          }}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                            prefs.music === null
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                          )}
                        >
                          {t('無')}
                        </button>
                        {BGM_MUSIC.map((m) => {
                          const missing = unavailableSrcs.has(m.src)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                const eng = getBgmEngine()
                                eng?.unlockAudio()
                                eng?.prepareMusic(m.id)
                                setPrefs((p) => ({ ...p, music: m.id }))
                              }}
                              disabled={missing}
                              title={missing ? t('音檔尚未加入（見 public/audio/README.md）') : undefined}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                                missing
                                  ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                  : prefs.music === m.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                              )}
                            >
                              <span>{m.emoji}</span>{t(m.label)}
                            </button>
                          )
                        })}
                        {/* "全部循環" — engine cycles through every available music
                            track in order, dual-buffering the handoff so the
                            transition is seamless. Disabled iff every music file
                            is missing. */}
                        {(() => {
                          const everyMissing = BGM_MUSIC.every((m) => unavailableSrcs.has(m.src))
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const eng = getBgmEngine()
                                eng?.unlockAudio()
                                eng?.prepareMusic(ALL_MUSIC_ID)
                                setPrefs((p) => ({ ...p, music: ALL_MUSIC_ID }))
                              }}
                              disabled={everyMissing}
                              title={everyMissing ? t('尚未加入任何音檔（見 public/audio/README.md）') : t('依序循環播放所有背景音樂')}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
                                everyMissing
                                  ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                  : prefs.music === ALL_MUSIC_ID
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                              )}
                            >
                              <span>{ALL_MUSIC_EMOJI}</span>{t(ALL_MUSIC_LABEL)}
                            </button>
                          )
                        })()}
                      </div>
                      {prefs.music && (
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={prefs.musicVolume}
                          onChange={(e) => setPrefs((p) => ({ ...p, musicVolume: parseFloat(e.target.value) }))}
                          aria-label={t('背景音樂音量')}
                          className="w-full h-1 accent-primary"
                        />
                      )}
                    </div>

                    {/* Ambient overlays — multi-select, each with its own slider */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-[11px] text-muted-foreground">
                        {t('環境音（可疊加）')}
                      </label>
                      <div className="space-y-1">
                        {BGM_AMBIENT.map((a) => {
                          const p = prefs.ambient[a.id]
                          const missing = unavailableSrcs.has(a.src)
                          return (
                            <div key={a.id} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  getBgmEngine()?.unlockAudio()
                                  setPrefs((prev) => ({
                                    ...prev,
                                    ambient: {
                                      ...prev.ambient,
                                      [a.id]: { ...prev.ambient[a.id], enabled: !prev.ambient[a.id].enabled },
                                    },
                                  }))
                                }}
                                aria-pressed={p.enabled}
                                disabled={missing}
                                title={missing ? t('音檔尚未加入（見 public/audio/README.md）') : undefined}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 w-[68px] justify-start',
                                  missing
                                    ? 'bg-secondary/30 text-muted-foreground/50 line-through cursor-not-allowed'
                                    : p.enabled
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary',
                                )}
                              >
                                <span>{a.emoji}</span>{t(a.label)}
                              </button>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={p.volume}
                                disabled={!p.enabled || missing}
                                onChange={(e) => setPrefs((prev) => ({
                                  ...prev,
                                  ambient: {
                                    ...prev.ambient,
                                    [a.id]: { ...prev.ambient[a.id], volume: parseFloat(e.target.value) },
                                  },
                                }))}
                                aria-label={t('{label}音量', { label: t(a.label) })}
                                className="flex-1 h-1 accent-primary disabled:opacity-40"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {(unavailableSrcs.size > 0) && (
                      <p className="text-[10px] text-muted-foreground/70 italic pt-0.5">
                        {t('灰色項目尚未放入音檔 · 詳見 public/audio/README.md')}
                      </p>
                    )}
                  </div>
                  )}
                </div>
                  )
                })()}
              </div>
            )}

            {/* Duration preview + start. The setup card only renders while
                idle, so this is always the pre-session state: a quiet preview
                of the chosen length, then the primary 開始專注 action. */}
            <div className="px-5 pt-2 pb-5">
              <div className="text-center mb-3">
                <span className="font-mono font-semibold tabular-nums text-foreground/40 text-3xl tracking-tight">
                  {formatTime(displayTime)}
                </span>
              </div>
              <div className="flex items-stretch gap-2">
                <Button
                  onClick={() => startTimer()}
                  className="flex-1 h-12 gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-sm transition-[transform,filter] duration-150 ease-quart hover:brightness-[1.06] active:scale-[0.985] motion-reduce:transform-none"
                  style={{ backgroundColor: mode === 'pomodoro'
                    ? (useCustom ? focusType.color : POMODORO_PRESETS[selectedPreset].color)
                    : focusType.color
                  }}
                >
                  <Play className="w-4 h-4" />
                  {t('開始專注')}
                </Button>
                {/* 放大開始 — the *action* the old header toggle pretended to
                    be: starts this session immediately in the immersive
                    focus screen (in-page overlay, never browser fullscreen). */}
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => startTimer({ immersive: true })}
                    aria-label={t('放大開始：以沉浸畫面開始專注')}
                    title={t('放大開始：立即以沉浸畫面開始專注')}
                    className="h-12 w-12 shrink-0 rounded-2xl border border-border/70 bg-secondary/30 text-muted-foreground grid place-items-center transition-[transform,background-color,color] duration-150 ease-quart hover:bg-secondary/70 hover:text-foreground active:scale-[0.96] motion-reduce:transform-none"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70 text-center mt-2.5">
                {t('結束後會自動記錄到今天的日曆')}
              </p>
            </div>
          </div>
        ) : (
          /* Collapsed Button. Only ever rendered while idle — a running/
             paused/completed session is handled globally by the provider's
             portal (see the early `if (ft.state !== 'idle') return null`
             above), so the "running" appearance this button used to grow
             (ring, live digits) can never actually show here; that branch
             lived in the original component too, gated by the same
             upstream idle check, just expressed as a runtime ternary. */
          <button
            data-tour="focus-timer"
            onClick={() => {
              const eng = getBgmEngine()
              eng?.unlockAudio()
              eng?.prepareMusic(prefs.music)
              setIsExpanded(true)
            }}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg transition-all hover:scale-105 bg-card border border-border"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
            <Timer className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('專注計時')}</span>
          </button>
        )}
      </div>
    </>
  )
}
