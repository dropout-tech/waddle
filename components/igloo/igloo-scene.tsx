'use client'

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IGLOO_LAYERS, brickSlot, type IglooMood } from '@/lib/igloo/compute'
import { PET_COLOR_STYLES, type PetAccessory, type PetColor } from '@/lib/pet/types'
import { Accessory, PetSprite } from '@/components/pet/pet-sprite'
import styles from './igloo.module.css'

/** What the scene draws — may lag the real state while bricks are replayed. */
export interface IglooView {
  completed: number
  bricks: number
  per: number
  mood: IglooMood
}

// Scene geometry (viewBox 0 0 360 240, the 3:2 painted plate).
const W = 360
const H = 240
const CX = 238
const BASE = 204
const R = 74
const COURSE = R / IGLOO_LAYERS.length
/** Painted plates (Codex CLI, 2026-10-03; raw files + prompts in the session's art-kit/igloo). */
const BG_SRC = '/art/igloo/igloo-bg.webp'
const DONE_SRC = '/art/igloo/igloo-done.webp'
const SIT_SRC = '/art/igloo/penguin-sit.webp'
const PAPER_SRC = '/art/paper-texture.jpg'
/** The finished-igloo painting, as fractions of the square image (measured on the 1024px original). */
const DONE_DOME_W = 0.776
const DONE_BASE_Y = 0.84
const DONE_TOP_Y = 0.225
/** Rows above this hold the painted pennant — hidden on the main igloo, where an SVG one rises. */
const DONE_CLIP_Y = 0.205

/** Penguin box per pose, in % of the scene (left, bottom, width). Building stands at the igloo's left edge. */
const SPOTS = {
  carry: { left: 24, bottom: 7, width: 20 },
  happy: { left: 24, bottom: 7, width: 20 },
  sleep: { left: 22, bottom: 5, width: 21 },
  sit: { left: 19, bottom: 4, width: 25 },
} as const
type Pose = keyof typeof SPOTS
/**
 * Where the user's accessory goes on the other art: translate + scale that maps
 * the stand pose's eyes (the space PetSprite's accessories are drawn in) onto
 * each pose's eyes. Measured on the art, 2026-10-03.
 */
const ACCESSORY_FIT: Partial<Record<Pose, { x: number; y: number; s: number }>> = {
  carry: { x: 40.6, y: 54, s: 0.66 },
  happy: { x: -4.9, y: -5.5, s: 1.03 },
  sit: { x: 52, y: 37.4, s: 0.64 },
}
/** Where the carried brick sits (scene units): top-centre of the carry spot. */
const HANDS = {
  x: ((SPOTS.carry.left + SPOTS.carry.width / 2) / 100) * W,
  y: H * (1 - SPOTS.carry.bottom / 100) - (SPOTS.carry.width / 100) * W * 0.9,
}

/** Back-row spots for finished igloos (dome base centre + scale vs the main igloo). */
const VILLAGE = [
  { x: 330, y: 142, s: 0.3 },
  { x: 140, y: 138, s: 0.26 },
  { x: 290, y: 132, s: 0.22 },
  { x: 30, y: 140, s: 0.28 },
  { x: 92, y: 130, s: 0.2 },
  { x: 190, y: 128, s: 0.18 },
]
export const VILLAGE_MAX = VILLAGE.length
const FLAKES = Array.from({ length: 9 }, (_, i) => ({
  x: 18 + ((i * 47) % 330),
  r: 1.2 + (i % 3) * 0.5,
  delay: -((i * 1.7) % 9),
  dur: 8 + (i % 4),
}))

/** Deterministic noise in [-0.5, 0.5) — same brick, same wobble, every render. */
const wob = (n: number, k: number) => {
  const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453
  return v - Math.floor(v) - 0.5
}

interface BrickGeom { x: number; y: number; w: number; h: number; rx: number; key: string }

/** One course of hand-cut blocks: lengths and heights vary a little (seeded, so idempotent). */
function courseGeom(layer: number, count: number): BrickGeom[] {
  const top = BASE - (layer + 1) * COURSE
  const bottom = layer * COURSE
  const half = Math.sqrt(Math.max(0, R * R - bottom * bottom)) + 1
  const weights = Array.from({ length: count }, (_, i) => 1 + wob(layer * 17 + i, 3) * 0.45)
  const sum = weights.reduce((a, b) => a + b, 0)
  // Every other course starts a little later, like real masonry.
  let x = CX - half + (layer % 2 === 1 ? 2.5 : 0)
  return weights.map((wgt, i) => {
    const w = (wgt / sum) * half * 2
    const h = COURSE - 1.4 + wob(layer * 17 + i, 5) * 1.6
    const g = {
      x: x + 0.8 + wob(layer * 17 + i, 1) * 0.5,
      y: top + (COURSE - h) / 2 + wob(layer * 17 + i, 2) * 0.9,
      w: w - 1.6,
      h,
      rx: 2.2 + wob(layer * 17 + i, 4) * 1.4,
      key: `${layer}-${i}`,
    }
    x += w
    return g
  })
}

const ALL_BRICKS: BrickGeom[] = IGLOO_LAYERS.flatMap((n, layer) => courseGeom(layer, n))

function brickAt(n: number): BrickGeom {
  const { layer, index } = brickSlot(n)
  let offset = 0
  for (let l = 0; l < layer; l++) offset += IGLOO_LAYERS[l]
  return ALL_BRICKS[offset + index]
}

function Door({ cx, base, fill }: { cx: number; base: number; fill: string }) {
  const w = 14
  const h = 26
  const o = w + 5.5
  return (
    <g>
      <path d={`M${cx - o} ${base} L${cx - o} ${base - h + o * 0.3} A${o} ${o} 0 0 1 ${cx + o} ${base - h + o * 0.3} L${cx + o} ${base} Z`} fill={fill} className={styles.brick} />
      <path d={`M${cx - w} ${base} L${cx - w} ${base - h + w} A${w} ${w} 0 0 1 ${cx + w} ${base - h + w} L${cx + w} ${base} Z`} fill="var(--ig-door)" />
    </g>
  )
}

/** A finished igloo — the Codex painting, its dome sitting on (cx, base) at radius r. */
function FinishedIgloo({ cx, base, r, clipId, className }: { cx: number; base: number; r: number; clipId?: string; className?: string }) {
  const size = (2 * r) / DONE_DOME_W
  return (
    <image
      href={DONE_SRC}
      x={cx - size / 2}
      y={base - size * DONE_BASE_Y}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      clipPath={clipId ? `url(#${clipId})` : undefined}
      className={className}
    />
  )
}

/** The penguin: the user's own colour; accessories only on the poses the overlay art fits. */
function Penguin({ pose, look, rough }: { pose: Pose; look: { color: PetColor; accessory: PetAccessory }; rough: string }) {
  if (pose === 'sleep') return <PetSprite color={look.color} accessory={look.accessory} pose="sleep" />
  const palette = PET_COLOR_STYLES[look.color] ?? PET_COLOR_STYLES.ink
  const filter = palette.body
  const fit = ACCESSORY_FIT[pose]
  const src = pose === 'sit' ? SIT_SRC : `/art/penguin/${pose}.webp`
  return (
    <span className={styles.figure}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static art, same as PetSprite */}
      <img src={src} alt="" draggable={false} decoding="async" style={{ filter: filter === 'none' ? undefined : filter }} />
      {fit && look.accessory !== 'none' && (
        <svg viewBox="0 0 240 240" className={styles.figureOverlay} aria-hidden="true" data-igloo-accessory={look.accessory}>
          <g transform={`translate(${fit.x} ${fit.y}) scale(${fit.s})`}>
            <Accessory kind={look.accessory} accent={palette.accent} />
          </g>
        </svg>
      )}
      {pose === 'carry' && (
        // An ice brick lifted overhead, painted over the card in the carry art.
        <svg viewBox="0 0 100 100" className={styles.figureOverlay} aria-hidden="true">
          <g filter={`url(#${rough})`}>
            <rect x="24" y="1" width="54" height="22" rx="4" className={styles.brick} fill="var(--ig-brick)" />
            <path d="M28 18 Q51 21 74 18" stroke="var(--ig-brick-shade)" strokeWidth="3" fill="none" strokeLinecap="round" />
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
  const rough = `rough-${uid}`
  const paper = `url(#paper-${uid})`
  const { completed, bricks, mood } = view
  // The day an igloo is finished it stays up front, whole, with its flag.
  const showFinished = bricks === 0 && completed > 0 && (celebrating || mood === 'proud')
  const villageCount = Math.min(VILLAGE.length, Math.max(0, showFinished ? completed - 1 : completed))
  const placed = useMemo(() => ALL_BRICKS.slice(0, Math.min(bricks, ALL_BRICKS.length)), [bricks])
  const flying = placing !== null && placing >= 0 && placing < ALL_BRICKS.length ? brickAt(placing) : null
  const pose: Pose = showFinished ? 'happy' : mood === 'sleeping' ? 'sleep' : mood === 'waiting' ? 'sit' : 'carry'
  const spot = SPOTS[pose]
  const doneSize = (2 * R) / DONE_DOME_W
  const domeTopY = BASE - doneSize * (DONE_BASE_Y - DONE_TOP_Y)

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
          {/* Dry-brush look for the live SVG parts: wobble the edges, then sprinkle grain. */}
          <filter id={rough} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="3" result="fine" />
            <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.48  0 0 0 0 0.32  0 0 0 0 0.2  -1.3 0 0 0 0.6" result="speck" />
            <feComposite in="speck" in2="rough" operator="in" result="grain" />
            <feMerge>
              <feMergeNode in="rough" />
              <feMergeNode in="grain" />
            </feMerge>
          </filter>
          {/* Paper-grain fill for the blocks, so they share the plate's tooth. */}
          <pattern id={`paper-${uid}`} patternUnits="userSpaceOnUse" width="90" height="90">
            <rect width="90" height="90" fill="var(--ig-brick)" />
            <image href={PAPER_SRC} width="90" height="90" opacity="0.55" style={{ mixBlendMode: 'multiply' }} />
          </pattern>
          <clipPath id={`dome-${uid}`}>
            <circle cx={CX} cy={BASE} r={R + 0.5} />
          </clipPath>
          <clipPath id={`built-${uid}`}>
            {placed.map((b) => <rect key={b.key} x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} />)}
          </clipPath>
          <clipPath id={`noflag-${uid}`}>
            <rect x="0" y={BASE - doneSize * (DONE_BASE_Y - DONE_CLIP_Y)} width={W} height={H} />
          </clipPath>
        </defs>

        <image href={BG_SRC} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        {night && (
          <g>
            <rect x="0" y="0" width={W} height={H} fill="#3d3024" opacity="0.28" />
            <g filter={`url(#${rough})`}>
              <path d="M312 30 A15 15 0 1 0 326 56 A12 12 0 1 1 312 30 Z" fill="var(--ig-sun)" stroke="var(--ig-line)" strokeWidth="1.4" strokeLinejoin="round" />
              {[[40, 34], [96, 20], [170, 38], [252, 22], [282, 58]].map(([x, y]) => (
                <path key={`${x}`} d={`M${x} ${y - 3.5} L${x} ${y + 3.5} M${x - 3.5} ${y} L${x + 3.5} ${y}`} stroke="var(--ig-sun)" strokeWidth="1.8" strokeLinecap="round" />
              ))}
            </g>
          </g>
        )}

        {/* the village: one painted igloo per finished one */}
        {VILLAGE.slice(0, villageCount).map((v, i) => (
          <FinishedIgloo key={i} cx={v.x} base={v.y} r={R * v.s} />
        ))}

        {/* footprints between the brick pile and the igloo */}
        {Array.from({ length: 7 }, (_, i) => (
          <ellipse key={i} cx={64 + i * 13} cy={226 - (i % 2) * 4} rx="2.6" ry="1.4" fill="var(--ig-snow-shade)" opacity={mood === 'waiting' ? 0.5 : 0.9} />
        ))}

        {/* the brick pile the penguin fetches from */}
        <g filter={`url(#${rough})`}>
          <rect x="34" y="208" width="19" height="10" rx="3" fill={paper} className={styles.brick} />
          <rect x="54" y="209" width="17" height="9.5" rx="2.5" fill={paper} className={styles.brick} />
          <rect x="43" y="198.5" width="18" height="10" rx="3" fill={paper} className={styles.brick} />
        </g>

        {/* the igloo under construction (or today's finished one) */}
        {(!showFinished || celebrating) && (
          <g filter={`url(#${rough})`} className={showFinished ? styles.fadeOut : undefined}>
            {/* pencil under-drawing of the dome still to build */}
            <g className={styles.ghost}>
              <path d={`M${CX - R} ${BASE} A${R} ${R} 0 0 1 ${CX + R} ${BASE}`} />
              <path d={`M${CX - R + 1.5} ${BASE - 0.5} A${R - 1} ${R + 0.5} 0 0 1 ${CX + R - 1} ${BASE}`} opacity="0.6" />
              {IGLOO_LAYERS.slice(0, -1).map((_, i) => {
                const yy = (i + 1) * COURSE
                const half = Math.sqrt(R * R - yy * yy)
                return <path key={i} d={`M${CX - half + 3} ${BASE - yy + wob(i, 9)} Q${CX} ${BASE - yy - 1.5} ${CX + half - 3} ${BASE - yy - wob(i, 8)}`} opacity="0.7" />
              })}
            </g>
            <g clipPath={`url(#dome-${uid})`}>
              {(showFinished ? ALL_BRICKS : placed).map((b, i) => (
                <g key={b.key} className={i === placing ? styles.appear : undefined}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.rx} fill={paper} className={styles.brick} />
                  <path d={`M${b.x + 2} ${b.y + b.h - 2.2} Q${b.x + b.w / 2} ${b.y + b.h - 1.2} ${b.x + b.w - 2} ${b.y + b.h - 2.2}`} className={styles.brickShade} />
                </g>
              ))}
            </g>
            {/* the dome's outline, only around what's built */}
            <g clipPath={showFinished ? undefined : `url(#built-${uid})`}>
              <path d={`M${CX - R} ${BASE} A${R} ${R} 0 0 1 ${CX + R} ${BASE}`} fill="none" stroke="var(--ig-line)" strokeWidth="1.6" />
            </g>
            {(showFinished || bricks >= IGLOO_LAYERS[0] + IGLOO_LAYERS[1]) && <Door cx={CX + 3} base={BASE} fill={paper} />}
          </g>
        )}
        {showFinished && (
          <g>
            <FinishedIgloo cx={CX} base={BASE} r={R} clipId={`noflag-${uid}`} className={celebrating ? styles.doneIn : undefined} />
            {/* the terracotta pennant goes up */}
            <g filter={`url(#${rough})`} className={celebrating ? styles.flagUp : undefined}>
              <path d={`M${CX - 1} ${domeTopY + 2} L${CX - 1} ${domeTopY - 22}`} stroke="var(--ig-line)" strokeWidth="1.8" strokeLinecap="round" />
              <path d={`M${CX - 1} ${domeTopY - 22} L${CX + 15} ${domeTopY - 17} L${CX - 1} ${domeTopY - 12} Z`} fill="var(--ig-flag)" stroke="var(--ig-line)" strokeWidth="1.3" strokeLinejoin="round" />
            </g>
          </g>
        )}
        {!showFinished && <path d={`M${CX - R - 10} ${BASE + 1} Q${CX} ${BASE + 6} ${CX + R + 12} ${BASE + 1}`} fill="none" stroke="var(--ig-snow-shade)" strokeWidth="3" strokeLinecap="round" />}

        {/* the brick in flight */}
        {flying && (
          <rect
            key={`fly-${placing}`}
            x={flying.x}
            y={flying.y}
            width={flying.w}
            height={flying.h}
            rx={flying.rx}
            fill={paper}
            className={cn(styles.brick, styles.flying)}
            filter={`url(#${rough})`}
            style={{ '--dx': `${HANDS.x - (flying.x + flying.w / 2)}px`, '--dy': `${HANDS.y - (flying.y + flying.h / 2)}px` } as React.CSSProperties}
          />
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

      {/* the penguin (the user's own look); a new pose fades in rather than jumping */}
      <div
        key={pose}
        className={cn(styles.penguin, styles.poseIn)}
        style={{ left: `${spot.left}%`, bottom: `${spot.bottom}%`, width: `${spot.width}%` }}
        data-igloo-penguin={pose}
      >
        <div key={hopKey} className={cn(styles.penguinInner, hopKey > 0 && pose === 'carry' && styles.hop)}>
          <Penguin pose={pose} look={look} rough={rough} />
        </div>
        {pose === 'sit' && (
          <>
            {/* the snow drift it sits in, in front of its feet */}
            <svg viewBox="0 0 100 30" className={styles.drift} aria-hidden="true">
              <g filter={`url(#${rough})`}>
                <path d="M2 29 Q8 13 26 15 Q38 6 52 12 Q66 5 78 14 Q94 13 98 29 Z" fill={paper} />
                <path d="M2 29 Q8 13 26 15 Q38 6 52 12 Q66 5 78 14 Q94 13 98 29" fill="none" stroke="var(--ig-line)" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.75" />
                <path d="M30 22 Q42 18 52 21 M62 20 Q72 17 82 21" fill="none" stroke="var(--ig-brick-shade)" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            </svg>
            <span className={styles.thinking} aria-hidden="true">…</span>
          </>
        )}
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
