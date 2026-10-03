'use client'

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IGLOO_LAYERS, brickSlot, type IglooMood } from '@/lib/igloo/compute'
import { PET_COLOR_STYLES, type PetAccessory, type PetColor } from '@/lib/pet/types'
import { Accessory } from '@/components/pet/pet-sprite'
import styles from './igloo.module.css'

/** What the scene draws — may lag the real state while bricks are replayed. */
export interface IglooView {
  completed: number
  bricks: number
  per: number
  mood: IglooMood
}

/*
 * Everything here is painted art in the promo film's style (Codex CLI,
 * 2026-10-03; raw files, prompts and side-by-side checks in the session's
 * art-kit/igloo/v2). The igloo under construction is the SAME finished-igloo
 * painting, revealed brick by brick through a mask whose bricks follow the
 * painted courses and seams — so a half-built igloo has the same strokes as a
 * finished one.
 */
const BG_SRC = '/art/igloo/igloo-bg.webp'
const IGLOO_SRC = '/art/igloo/igloo-full.webp'
const POSE_SRC = {
  carry: '/art/igloo/pose-carry.webp',
  sit: '/art/igloo/pose-sit.webp',
  cheer: '/art/igloo/pose-cheer.webp',
  sleep: '/art/igloo/pose-sleep.webp',
} as const

// Scene geometry (viewBox 0 0 360 240, the 3:2 painted plate).
const W = 360
const H = 240
const CX = 240
const BASE = 206

/**
 * The igloo painting, measured on its 1024px original: dome centre and base,
 * the five painted courses (bottom → top, y ranges) with the x of the painted
 * seams between blocks, and where the pennant starts.
 */
const ART = 1024
const ART_CX = 510
const ART_BASE = 880
const ART_DOME_W = 931
const ART_FLAG_BOTTOM = 198
const COURSES: { y: [number, number]; x: [number, number]; seams: number[] }[] = [
  { y: [704, 930], x: [10, 1014], seams: [136, 333, 510, 684, 887] },
  { y: [562, 708], x: [30, 995], seams: [249, 383, 640, 766] },
  { y: [422, 566], x: [70, 955], seams: [210, 391, 627, 813] },
  { y: [298, 426], x: [140, 885], seams: [311, 512, 709] },
  { y: [ART_FLAG_BOTTOM, 302], x: [240, 790], seams: [418, 610] },
]
/** Main igloo width in scene units → scale of the painting. */
const DOME_W = 152
const SCALE = DOME_W / ART_DOME_W
const SIZE = ART * SCALE
const ART_X = CX - ART_CX * SCALE
const ART_Y = BASE - ART_BASE * SCALE

interface Slot { x: number; y: number; w: number; h: number }

/**
 * Brick n of an igloo → its slot in painting pixels. Each course's target
 * count (IGLOO_LAYERS) is shared out over the painted blocks by width, and a
 * block that gets more than one brick is split evenly — so mask edges fall
 * on painted seams wherever possible. Deterministic, so idempotent.
 */
function buildSlots(): Slot[] {
  const out: Slot[] = []
  IGLOO_LAYERS.forEach((n, layer) => {
    const c = COURSES[layer]
    const edges = [c.x[0], ...c.seams, c.x[1]]
    const blocks = edges.slice(1).map((e, i) => [edges[i], e] as const)
    const total = c.x[1] - c.x[0]
    const raw = blocks.map(([a, b]) => ((b - a) / total) * n)
    const counts = raw.map((r) => Math.max(1, Math.floor(r)))
    let left = n - counts.reduce((a, b) => a + b, 0)
    const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k][1]]++
    for (let k = order.length - 1; left < 0; k--, left++) if (counts[order[k][1]] > 1) counts[order[k][1]]--
    blocks.forEach(([a, b], i) => {
      const step = (b - a) / counts[i]
      for (let j = 0; j < counts[i]; j++) out.push({ x: a + j * step - 3, y: c.y[0] - 3, w: step + 6, h: c.y[1] - c.y[0] + 6 })
    })
  })
  return out
}
const SLOTS = buildSlots()
const slotOf = (n: number) => {
  const { layer, index } = brickSlot(n)
  let offset = 0
  for (let l = 0; l < layer; l++) offset += IGLOO_LAYERS[l]
  return SLOTS[offset + index]
}

/** Penguin box per pose, in % of the scene (left, bottom, width). Building stands at the igloo's left edge. */
const SPOTS = {
  carry: { left: 19, bottom: 4, width: 26 },
  cheer: { left: 18, bottom: 4, width: 26 },
  sit: { left: 15, bottom: 2, width: 28 },
  sleep: { left: 15, bottom: 1, width: 29 },
} as const
type Pose = keyof typeof SPOTS
/** Where the carried block is (scene units) — the flying brick starts here. */
const HANDS = {
  x: ((SPOTS.carry.left + SPOTS.carry.width * 0.5) / 100) * W,
  y: H * (1 - SPOTS.carry.bottom / 100) - (SPOTS.carry.width / 100) * W * 0.81,
}
/**
 * The user's accessory on the painted poses: translate + scale (in the
 * 240×240 space PetSprite's accessories are drawn in) that maps the stand
 * pose's eyes onto each pose's eyes. Measured on the art.
 */
const ACCESSORY_FIT: Partial<Record<Pose, { x: number; y: number; s: number }>> = {
  carry: { x: 61.2, y: 76.9, s: 0.543 },
  cheer: { x: 41.6, y: 40.3, s: 0.623 },
  sit: { x: 47.5, y: 33.2, s: 0.636 },
}

/** Back-row spots for finished igloos (dome base centre + scale vs the main igloo). */
const VILLAGE = [
  { x: 334, y: 146, s: 0.3 },
  { x: 32, y: 146, s: 0.28 },
  { x: 296, y: 134, s: 0.22 },
  { x: 150, y: 136, s: 0.22 },
  { x: 98, y: 132, s: 0.19 },
  { x: 196, y: 130, s: 0.17 },
]
export const VILLAGE_MAX = VILLAGE.length
const FLAKES = Array.from({ length: 9 }, (_, i) => ({
  x: 18 + ((i * 47) % 330),
  r: 1.2 + (i % 3) * 0.5,
  delay: -((i * 1.7) % 9),
  dur: 8 + (i % 4),
}))

/** The painting placed with its dome base centre on (cx, base) at scale s of the main igloo. */
function iglooBox(cx: number, base: number, s = 1) {
  return { x: cx - ART_CX * SCALE * s, y: base - ART_BASE * SCALE * s, size: SIZE * s }
}

function Penguin({ pose, look }: { pose: Pose; look: { color: PetColor; accessory: PetAccessory } }) {
  const palette = PET_COLOR_STYLES[look.color] ?? PET_COLOR_STYLES.ink
  const fit = ACCESSORY_FIT[pose]
  return (
    <span className={styles.figure}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static art, same as PetSprite */}
      <img src={POSE_SRC[pose]} alt="" draggable={false} decoding="async" style={{ filter: palette.body === 'none' ? undefined : palette.body }} />
      {fit && look.accessory !== 'none' && (
        <svg viewBox="0 0 240 240" className={styles.figureOverlay} aria-hidden="true" data-igloo-accessory={look.accessory}>
          <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.s})`}>
            <Accessory kind={look.accessory} accent={palette.accent} />
          </g>
        </svg>
      )}
    </span>
  )
}

export function IglooScene({
  view,
  look,
  bubble,
  placing = null,
  celebrating = false,
  hopKey = 0,
  night = false,
  compact = false,
  className,
  label,
}: {
  view: IglooView
  look: { color: PetColor; accessory: PetAccessory }
  bubble?: { name: string; text: string; key: number } | null
  /** 0-based slot of the brick being carried right now (replay). */
  placing?: number | null
  celebrating?: boolean
  hopKey?: number
  /** Night sky (moon, stars, dimmed plate) — independent of what the penguin is doing. */
  night?: boolean
  compact?: boolean
  className?: string
  /** Accessible description of the whole picture. */
  label: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { completed, bricks, mood } = view
  // The day an igloo is finished it stays up front, whole, with its flag.
  const showFinished = bricks === 0 && completed > 0 && (celebrating || mood === 'proud')
  const villageCount = Math.min(VILLAGE.length, Math.max(0, showFinished ? completed - 1 : completed))
  const placed = useMemo(() => SLOTS.slice(0, Math.min(bricks, SLOTS.length)), [bricks])
  const flying = placing !== null && placing >= 0 && placing < SLOTS.length ? slotOf(placing) : null
  const pose: Pose = showFinished ? 'cheer' : mood === 'sleeping' ? 'sleep' : mood === 'waiting' ? 'sit' : 'carry'
  const spot = SPOTS[pose]
  const artTransform = `translate(${ART_X} ${ART_Y}) scale(${SCALE})`
  const flyFrom = flying
    ? { dx: HANDS.x - (ART_X + (flying.x + flying.w / 2) * SCALE), dy: HANDS.y - (ART_Y + (flying.y + flying.h / 2) * SCALE) }
    : null

  return (
    <div
      className={cn(styles.scene, compact && styles.compact, className)}
      data-mood={mood}
      data-night={night ? '' : undefined}
      data-celebrating={celebrating ? '' : undefined}
      data-igloo-scene
      role="img"
      aria-label={label}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} aria-hidden="true">
        <defs>
          {/* Brick-shaped mask edges: wobble them so they read as hand-cut, not ruled. */}
          <filter id={`cut-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="11" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <mask id={`built-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <g transform={artTransform} filter={`url(#cut-${uid})`}>
              {placed.map((s, i) => (
                <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill="#fff" className={i === placing ? styles.appear : undefined} />
              ))}
            </g>
          </mask>
          {flying && (
            <mask id={`slot-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
              <g transform={artTransform} filter={`url(#cut-${uid})`}>
                <rect x={flying.x} y={flying.y} width={flying.w} height={flying.h} fill="#fff" />
              </g>
            </mask>
          )}
          <clipPath id={`noflag-${uid}`}>
            <rect x="0" y={ART_Y + ART_FLAG_BOTTOM * SCALE} width={W} height={H} />
          </clipPath>
          <clipPath id={`flag-${uid}`}>
            <rect x="0" y="0" width={W} height={ART_Y + ART_FLAG_BOTTOM * SCALE} />
          </clipPath>
          <radialGradient id={`glow-${uid}`}>
            <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#f6c862" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f6c862" stopOpacity="0" />
          </radialGradient>
        </defs>

        <image href={BG_SRC} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        {night && (
          <g>
            <rect x="0" y="0" width={W} height={H} fill="#3a2a1c" opacity="0.32" />
            <circle cx="314" cy="42" r="26" fill={`url(#glow-${uid})`} opacity="0.5" />
            <path d="M310 27 A16 16 0 1 0 330 52 A13 13 0 1 1 310 27 Z" fill="#f6dc8e" stroke="#5a3d22" strokeWidth="1.2" strokeLinejoin="round" />
            {[[40, 34], [96, 20], [170, 38], [252, 22], [282, 62]].map(([x, y]) => (
              <circle key={`${x}`} cx={x} cy={y} r="1.6" fill="#f6dc8e" opacity="0.9" />
            ))}
          </g>
        )}

        {/* the village: one painted igloo per finished one */}
        {VILLAGE.slice(0, villageCount).map((v, i) => {
          const b = iglooBox(v.x, v.y, v.s)
          return <image key={i} href={IGLOO_SRC} x={b.x} y={b.y} width={b.size} height={b.size} />
        })}

        {/* footprints in the snow between the penguin and the igloo */}
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} cx={118 + i * 10} cy={228 - (i % 2) * 3} rx="2.4" ry="1.3" fill="#d9bf8f" opacity={mood === 'waiting' ? 0.4 : 0.75} />
        ))}

        {/* the moment an igloo is finished: a warm glow like the film's light bursts */}
        {celebrating && <circle cx={CX} cy={BASE - 50} r="105" fill={`url(#glow-${uid})`} className={styles.glow} />}

        {showFinished ? (
          <g>
            <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#noflag-${uid})`} />
            {/* the painted pennant goes up */}
            <g className={celebrating ? styles.flagUp : undefined}>
              <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#flag-${uid})`} />
            </g>
          </g>
        ) : (
          <g>
            {/* the whole igloo, faintly, as the sketch of what's to come */}
            <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#noflag-${uid})`} className={styles.ghost} />
            {/* …and the same painting revealed brick by brick */}
            <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} mask={`url(#built-${uid})`} />
          </g>
        )}

        {/* the brick in flight: the very brick of the painting it will become, lit up */}
        {flying && flyFrom && (
          <g
            key={`fly-${placing}`}
            className={styles.flying}
            style={{ '--dx': `${flyFrom.dx}px`, '--dy': `${flyFrom.dy}px` } as React.CSSProperties}
          >
            <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} mask={`url(#slot-${uid})`} />
          </g>
        )}

        {/* light snowfall */}
        {!compact && (
          <g>
            {FLAKES.map((f, i) => (
              <circle key={i} cx={f.x} cy={0} r={f.r} className={styles.flake} style={{ animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }} />
            ))}
          </g>
        )}
      </svg>

      {/* the penguin (the user's own colour and accessory); a new pose fades in rather than jumping */}
      <div
        key={pose}
        className={cn(styles.penguin, styles.poseIn)}
        style={{ left: `${spot.left}%`, bottom: `${spot.bottom}%`, width: `${spot.width}%` }}
        data-igloo-penguin={pose}
      >
        <div key={hopKey} className={cn(styles.penguinInner, hopKey > 0 && pose === 'carry' && styles.hop)}>
          <Penguin pose={pose} look={look} />
        </div>
        {pose === 'sleep' && (
          <span className={styles.zzz} aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>Z</span>
          </span>
        )}
      </div>

      {bubble && !compact && (
        <div key={bubble.key} className={styles.bubble} data-igloo-bubble aria-live="polite">
          <span className={styles.nameTag} data-igloo-name>{bubble.name}</span>
          <span data-igloo-bubble-text>{bubble.text}</span>
        </div>
      )}
    </div>
  )
}
