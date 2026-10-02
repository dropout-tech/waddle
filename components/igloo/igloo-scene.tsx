'use client'

import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IGLOO_LAYERS, brickSlot, type IglooMood } from '@/lib/igloo/compute'
import type { PetAccessory, PetColor } from '@/lib/pet/types'
import { PetSprite } from '@/components/pet/pet-sprite'
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
/** Where the penguin holds a brick (in scene units) — the flight starts here. */
const HANDS = { x: 62, y: 190 }
/** Painted plates (Codex CLI, 2026-10-03; prompts in the feat(igloo) commit message). */
const BG_SRC = '/art/igloo/igloo-bg.webp'
const DONE_SRC = '/art/igloo/igloo-done.webp'
/** The finished-igloo painting: dome width and base line as fractions of the square image. */
const DONE_DOME_W = 0.776
const DONE_BASE_Y = 0.84
const DONE_CX = 0.5
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
  r: 1.4 + (i % 3) * 0.6,
  delay: -((i * 1.7) % 9),
  dur: 8 + (i % 4),
}))

/** Deterministic tiny wobble so bricks look hand-laid, not CAD. */
const wob = (n: number, k: number) => (((Math.sin(n * 12.9898 + k * 78.233) * 43758.5453) % 1) - 0.5)

interface BrickGeom { x: number; y: number; w: number; h: number; key: string }

function courseGeom(layer: number, count: number): BrickGeom[] {
  const y = BASE - (layer + 1) * COURSE
  const bottom = layer * COURSE
  const half = Math.sqrt(Math.max(0, R * R - bottom * bottom)) + 1
  const bw = (half * 2) / count
  // Every other course is offset by half a brick, like real masonry.
  const shift = layer % 2 === 1 ? bw * 0.18 : 0
  return Array.from({ length: count }, (_, i) => ({
    x: CX - half + i * bw + 0.7 + shift + wob(layer * 10 + i, 1) * 0.6,
    y: y + 0.6 + wob(layer * 10 + i, 2) * 0.5,
    w: bw - 1.4,
    h: COURSE - 1.2,
    key: `${layer}-${i}`,
  }))
}

const ALL_BRICKS: BrickGeom[] = IGLOO_LAYERS.flatMap((n, layer) => courseGeom(layer, n))

function brickAt(n: number): BrickGeom {
  const { layer, index } = brickSlot(n)
  let offset = 0
  for (let l = 0; l < layer; l++) offset += IGLOO_LAYERS[l]
  return ALL_BRICKS[offset + index]
}

function Door({ cx, base, s = 1 }: { cx: number; base: number; s?: number }) {
  const w = 13 * s
  const h = 24 * s
  const o = w + 5 * s
  return (
    <g>
      <path d={`M${cx - o} ${base} L${cx - o} ${base - h + o * 0.3} A${o} ${o} 0 0 1 ${cx + o} ${base - h + o * 0.3} L${cx + o} ${base} Z`} className={styles.brick} />
      <path d={`M${cx - w} ${base} L${cx - w} ${base - h + w} A${w} ${w} 0 0 1 ${cx + w} ${base - h + w} L${cx + w} ${base} Z`} fill="var(--ig-door)" />
    </g>
  )
}

/** A finished igloo — the Codex painting, placed so its dome sits on (cx, base) at radius r. */
function FinishedIgloo({ cx, base, r }: { cx: number; base: number; r: number }) {
  const size = (2 * r) / DONE_DOME_W
  return (
    <image
      href={DONE_SRC}
      x={cx - size * DONE_CX}
      y={base - size * DONE_BASE_Y}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}

export function IglooScene({
  view,
  look,
  bubble,
  placing = null,
  celebrating = false,
  hopKey = 0,
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
  const placed = useMemo(() => ALL_BRICKS.slice(0, Math.min(bricks, ALL_BRICKS.length)), [bricks])
  const flying = placing !== null && placing >= 0 && placing < ALL_BRICKS.length ? brickAt(placing) : null
  const sleeping = mood === 'sleeping'
  const showCarry = !sleeping && mood !== 'waiting' && !showFinished

  return (
    <div
      className={cn(styles.scene, compact && styles.compact, className)}
      data-mood={mood}
      data-igloo-scene
      role="img"
      aria-label={label}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} aria-hidden="true">
        <defs>
          {/* Dry-brush look for the live SVG parts: wobble the edges, then sprinkle grain. */}
          <filter id={`rough-${uid}`} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="3" result="fine" />
            <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 0 0.2  -1.3 0 0 0 0.63" result="speck" />
            <feComposite in="speck" in2="rough" operator="in" result="grain" />
            <feMerge>
              <feMergeNode in="rough" />
              <feMergeNode in="grain" />
            </feMerge>
          </filter>
          <clipPath id={`dome-${uid}`}>
            <circle cx={CX} cy={BASE} r={R + 0.5} />
          </clipPath>
          <clipPath id={`built-${uid}`}>
            {placed.map((b) => <rect key={b.key} x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} />)}
          </clipPath>
        </defs>

        <image href={BG_SRC} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        {sleeping && (
          <g>
            <rect x="0" y="0" width={W} height={H} fill="#3d3024" opacity="0.26" />
            <g filter={`url(#rough-${uid})`}>
              <path d="M312 30 A15 15 0 1 0 326 56 A12 12 0 1 1 312 30 Z" fill="var(--ig-sun)" stroke="var(--ig-line)" strokeWidth="2" strokeLinejoin="round" />
              {[[40, 34], [96, 20], [170, 38], [252, 22], [282, 58]].map(([x, y]) => (
                <path key={`${x}`} d={`M${x} ${y - 3.5} L${x} ${y + 3.5} M${x - 3.5} ${y} L${x + 3.5} ${y}`} stroke="var(--ig-sun)" strokeWidth="2" strokeLinecap="round" />
              ))}
            </g>
          </g>
        )}

        {/* the village: one painted igloo per finished one */}
        {VILLAGE.slice(0, villageCount).map((v, i) => (
          <FinishedIgloo key={i} cx={v.x} base={v.y} r={R * v.s} />
        ))}

        {/* footprints from the penguin to the igloo */}
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} cx={98 + i * 12} cy={222 - (i % 2) * 4} rx="2.6" ry="1.5" fill="var(--ig-snow-shade)" opacity={mood === 'waiting' ? 0.5 : 0.95} />
        ))}

        {/* the brick pile next to the penguin */}
        <g filter={`url(#rough-${uid})`}>
          <rect x="96" y="208" width="18" height="10" rx="2.5" className={styles.brick} />
          <rect x="115" y="208" width="18" height="10" rx="2.5" className={styles.brick} />
          <rect x="105" y="198" width="18" height="10" rx="2.5" className={styles.brick} />
        </g>

        {/* the igloo under construction (or today's finished one) */}
        {showFinished ? (
          <FinishedIgloo cx={CX} base={BASE} r={R} />
        ) : (
          <g filter={`url(#rough-${uid})`}>
            <path d={`M${CX - R} ${BASE} A${R} ${R} 0 0 1 ${CX + R} ${BASE}`} className={styles.ghost} />
            {IGLOO_LAYERS.slice(0, -1).map((_, i) => {
              const yy = (i + 1) * COURSE
              const half = Math.sqrt(R * R - yy * yy)
              return <path key={i} d={`M${CX - half} ${BASE - yy} L${CX + half} ${BASE - yy}`} className={styles.ghost} strokeOpacity={0.6} />
            })}
            <g clipPath={`url(#dome-${uid})`}>
              {placed.map((b, i) => (
                <g key={b.key} className={i === placing ? styles.appear : undefined}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="2.6" className={styles.brick} />
                  <rect x={b.x + 1.2} y={b.y + b.h - 3} width={Math.max(0, b.w - 2.4)} height="1.8" rx="0.9" className={styles.brickShade} />
                </g>
              ))}
            </g>
            {/* solid dome outline, only around what's built */}
            <g clipPath={`url(#built-${uid})`}>
              <path d={`M${CX - R} ${BASE} A${R} ${R} 0 0 1 ${CX + R} ${BASE}`} fill="none" stroke="var(--ig-line)" strokeWidth="2.6" />
            </g>
            {bricks >= IGLOO_LAYERS[0] + IGLOO_LAYERS[1] && <Door cx={CX + 3} base={BASE} s={1.1} />}
          </g>
        )}
        {!showFinished && <path d={`M${CX - R - 10} ${BASE + 1} Q${CX} ${BASE + 7} ${CX + R + 12} ${BASE + 1}`} fill="none" stroke="var(--ig-snow-shade)" strokeWidth="3" strokeLinecap="round" />}

        {/* the brick in flight */}
        {flying && (
          <rect
            key={`fly-${placing}`}
            x={flying.x}
            y={flying.y}
            width={flying.w}
            height={flying.h}
            rx="2.6"
            className={cn(styles.brick, styles.flying)}
            filter={`url(#rough-${uid})`}
            style={{ '--dx': `${HANDS.x - flying.x}px`, '--dy': `${HANDS.y - flying.y}px` } as React.CSSProperties}
          />
        )}

        {/* the finished-igloo moment */}
        {celebrating && (
          <g>
            {[[CX - 80, BASE - 70], [CX + 82, BASE - 76], [CX - 46, BASE - 94], [CX + 50, BASE - 96], [CX, BASE - 106], [CX - 96, BASE - 34], [CX + 98, BASE - 36]].map(([x, y], i) => (
              <path
                key={i}
                className={styles.burst}
                d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`}
                fill={i % 2 ? 'var(--ig-sun)' : 'var(--ig-flag)'}
                stroke="var(--ig-line)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            ))}
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

      {/* the penguin (the user's own look) */}
      <div className={styles.penguin} style={{ left: '9%', bottom: '8%', width: '16%' }} data-igloo-penguin>
        <div key={hopKey} className={cn(styles.penguinInner, hopKey > 0 && mood !== 'waiting' && styles.hop)}>
          <PetSprite color={look.color} accessory={look.accessory} pose={sleeping ? 'sleep' : 'stand'} blush={mood === 'proud' || celebrating} />
          {showCarry && (
            <svg viewBox="0 0 40 18" className={styles.carry} aria-hidden="true">
              <g filter={`url(#rough-${uid})`}>
                <rect x="2" y="2" width="36" height="14" rx="3" className={styles.brick} />
                <rect x="5" y="11.5" width="30" height="2.2" rx="1.1" className={styles.brickShade} />
              </g>
            </svg>
          )}
        </div>
        {mood === 'waiting' && <span className={styles.snowMound} aria-hidden="true" />}
        {mood === 'waiting' && <span className={styles.thinking} aria-hidden="true">…</span>}
        {sleeping && (
          <span className={styles.zzz} aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>Z</span>
          </span>
        )}
      </div>

      {bubble && !compact && (
        <div key={bubble.key} className={styles.bubble} data-igloo-bubble aria-live="polite">
          <strong className="mr-1.5">{bubble.name}</strong>
          {bubble.text}
        </div>
      )}
    </div>
  )
}
