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
const BG_NIGHT_SRC = '/art/igloo/igloo-bg-night.webp'
/**
 * The ice block the penguin carries — a real block cut from the igloo painting
 * (so it has the same grain and dry-brush edge); the same block is painted
 * into the carry pose and is what flies onto the igloo.
 */
const BLOCK_SRC = '/art/igloo/ice-block.webp'
const BLOCK_RATIO = 123 / 240
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
 * and for each painted course (bottom → top) its y range and the x edges of
 * every painted block (the painted seams). One brick = one whole painted
 * block, so a brick is either fully there or not there at all — never cut.
 * IGLOO_LAYERS (lib/igloo/compute.ts) must match these block counts.
 */
const ART = 1024
const ART_CX = 510
const ART_BASE = 880
const ART_DOME_W = 931
const ART_FLAG_BOTTOM = 198
/** The painted snow patch under the igloo starts here — faded out, replaced by a soft shadow. */
const ART_FADE: [number, number] = [868, 900]
/**
 * Per course: y range, the outer x limits (outside the dome is transparent
 * anyway) and every painted seam as [x at the course's top, x at its bottom]
 * — the upper courses' seams lean like the blocks of a dome, so each brick is
 * a quadrilateral that follows its block, not an upright rectangle.
 * Seam positions measured on the painting (darkest column near each seam).
 */
const COURSES: { y: [number, number]; x: [number, number]; seams: [number, number][] }[] = [
  // bottom row: edge block, block, door (arch legs + opening), block, edge block
  { y: [704, 905], x: [10, 1014], seams: [[138, 138], [329, 329], [686, 686], [887, 887]] },
  // the door arch counts as one block
  { y: [562, 704], x: [30, 995], seams: [[255, 243], [386, 386], [635, 635], [757, 771]] },
  { y: [422, 562], x: [70, 955], seams: [[224, 197], [392, 385], [623, 628], [792, 823]] },
  { y: [298, 422], x: [140, 885], seams: [[331, 298], [508, 512], [688, 719]] },
  { y: [ART_FLAG_BOTTOM, 298], x: [240, 790], seams: [[435, 409], [591, 615]] },
]
/** How far a brick reaches past its seams, so the dark seam line is part of both neighbours. */
const SEAM_PAD = 8
/** Main igloo width in scene units → scale of the painting. */
const DOME_W = 152
const SCALE = DOME_W / ART_DOME_W
const SIZE = ART * SCALE
const R_SHADOW = DOME_W * 0.62
const ART_X = CX - ART_CX * SCALE
const ART_Y = BASE - ART_BASE * SCALE

/** A brick: its outline polygon (painting px) and its centre. */
interface Slot { points: string; cx: number; cy: number; w: number }

const SLOTS: Slot[] = COURSES.flatMap((c) => {
  const [y0, y1] = [c.y[0] - SEAM_PAD, c.y[1] + SEAM_PAD]
  const cuts: [number, number][] = [[c.x[0], c.x[0]], ...c.seams, [c.x[1], c.x[1]]]
  return cuts.slice(1).map(([rt, rb], i) => {
    const [lt, lb] = cuts[i]
    const pts = [[lt - SEAM_PAD, y0], [rt + SEAM_PAD, y0], [rb + SEAM_PAD, y1], [lb - SEAM_PAD, y1]]
    return {
      points: pts.map(([x, y]) => `${x},${y}`).join(' '),
      cx: (lt + rt + lb + rb) / 4,
      cy: (c.y[0] + c.y[1]) / 2,
      w: (rt + rb - lt - lb) / 2,
    }
  })
})
if (process.env.NODE_ENV !== 'production' && SLOTS.length !== IGLOO_LAYERS.reduce((a, b) => a + b, 0)) {
  console.error('[igloo] painted blocks and IGLOO_LAYERS disagree')
}
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
  y: H * (1 - SPOTS.carry.bottom / 100) - (SPOTS.carry.width / 100) * W * 0.82,
}
/**
 * The user's accessory on the painted poses: translate + scale (in the
 * 240×240 space PetSprite's accessories are drawn in) that maps the stand
 * pose's eyes onto each pose's eyes. Measured on the art.
 */
const ACCESSORY_FIT: Partial<Record<Pose, { x: number; y: number; s: number }>> = {
  carry: { x: 57.3, y: 75.1, s: 0.517 },
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
    ? { dx: HANDS.x - (ART_X + flying.cx * SCALE), dy: HANDS.y - (ART_Y + flying.cy * SCALE) }
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
          {/* Whole painted blocks only; their edges run along the painted seams. */}
          <mask id={`built-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <g transform={artTransform}>
              {placed.map((s, i) => (
                <polygon key={i} points={s.points} fill="#fff" className={i === placing ? styles.appear : undefined} />
              ))}
            </g>
          </mask>
          <clipPath id={`noflag-${uid}`}>
            <rect x="0" y={ART_Y + ART_FLAG_BOTTOM * SCALE} width={W} height={H} />
          </clipPath>
          <clipPath id={`flag-${uid}`}>
            <rect x="0" y="0" width={W} height={ART_Y + ART_FLAG_BOTTOM * SCALE} />
          </clipPath>
          {/* Fade out the painted snow patch under an igloo (it read as a hard white disc). */}
          <linearGradient id={`fadeg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={ART_FADE[0] / ART} stopColor="#fff" />
            <stop offset={ART_FADE[1] / ART} stopColor="#000" />
          </linearGradient>
          <mask id={`fade-${uid}`} maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#fadeg-${uid})`} />
          </mask>
          <radialGradient id={`shadow-${uid}`}>
            <stop offset="0%" stopColor="#c9a46a" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#d9b98a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#d9b98a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`glow-${uid}`}>
            <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#f6c862" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f6c862" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* day / night: two paintings of the same snowfield (the night one has its own moon) */}
        <image href={night ? BG_NIGHT_SRC : BG_SRC} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />

        {/* the village: one painted igloo per finished one */}
        {VILLAGE.slice(0, villageCount).map((v, i) => {
          const b = iglooBox(v.x, v.y, v.s)
          return (
            <g key={i}>
              <ellipse cx={v.x} cy={v.y + 1} rx={R_SHADOW * v.s} ry={7 * v.s + 1} fill={`url(#shadow-${uid})`} />
              <image href={IGLOO_SRC} x={b.x} y={b.y} width={b.size} height={b.size} mask={`url(#fade-${uid})`} />
            </g>
          )
        })}

        {/* footprints in the snow between the penguin and the igloo */}
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} cx={118 + i * 10} cy={228 - (i % 2) * 3} rx="2.4" ry="1.3" fill="#d9bf8f" opacity={mood === 'waiting' ? 0.4 : 0.75} />
        ))}

        {/* the moment an igloo is finished: a warm glow like the film's light bursts */}
        {celebrating && <circle cx={CX} cy={BASE - 50} r="105" fill={`url(#glow-${uid})`} className={styles.glow} />}

        {/* a soft snow shadow under the igloo instead of the painted disc */}
        <ellipse cx={CX} cy={BASE + 2} rx={R_SHADOW} ry="9" fill={`url(#shadow-${uid})`} />

        {showFinished ? (
          <g>
            <g mask={`url(#fade-${uid})`}>
              <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#noflag-${uid})`} />
            </g>
            {/* the painted pennant goes up */}
            <g className={celebrating ? styles.flagUp : undefined}>
              <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#flag-${uid})`} />
            </g>
          </g>
        ) : (
          <g>
            {/* the whole igloo as a faint shadow of what's to come */}
            <g mask={`url(#fade-${uid})`}>
              <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} clipPath={`url(#noflag-${uid})`} className={styles.ghost} />
            </g>
            {/* …and the same painting revealed one whole block at a time */}
            <g mask={`url(#fade-${uid})`}>
              <image href={IGLOO_SRC} x={ART_X} y={ART_Y} width={SIZE} height={SIZE} mask={`url(#built-${uid})`} />
            </g>
          </g>
        )}

        {/* the brick in flight: the same painted ice block the penguin is holding */}
        {flying && flyFrom && (() => {
          const bw = Math.min(30, flying.w * SCALE)
          const bh = bw * BLOCK_RATIO
          const cx = ART_X + flying.cx * SCALE
          const cy = ART_Y + flying.cy * SCALE
          return (
            <g
              key={`fly-${placing}`}
              className={styles.flying}
              style={{ '--dx': `${flyFrom.dx}px`, '--dy': `${flyFrom.dy}px` } as React.CSSProperties}
            >
              <image href={BLOCK_SRC} x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} />
            </g>
          )
        })()}

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
            {/* hand-drawn z's (brush strokes, not type) */}
            {[0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 12 12" style={{ width: `${0.55 + i * 0.18}em` }}>
                <path d="M2.2 2.6 Q6 1.8 9.6 2.4 Q6.4 5.8 2.6 9.4 Q6.2 9.9 10 9.2" fill="none" stroke="#5a3d22" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ))}
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
