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

// Scene geometry (viewBox 0 0 360 220).
const W = 360
const H = 220
const CX = 218
const BASE = 178
const R = 64
const COURSE = R / IGLOO_LAYERS.length
/** Where the penguin holds a brick (in scene units) — the flight starts here. */
const HANDS = { x: 72, y: 160 }
/** Back-row spots for finished igloos, nearest-to-main first. */
const VILLAGE = [
  { x: 316, y: 140, s: 0.36 },
  { x: 128, y: 138, s: 0.32 },
  { x: 350, y: 132, s: 0.26 },
  { x: 32, y: 136, s: 0.3 },
  { x: 86, y: 128, s: 0.24 },
  { x: 274, y: 128, s: 0.22 },
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
  const w = 15 * s
  const h = 22 * s
  return (
    <g>
      <path
        d={`M${cx - w - 4 * s} ${base} L${cx - w - 4 * s} ${base - h + w * 0.2} A${w + 4 * s} ${w + 4 * s} 0 0 1 ${cx + w + 4 * s} ${base - h + w * 0.2} L${cx + w + 4 * s} ${base} Z`}
        className={styles.brick}
        strokeWidth={1.6 * Math.max(0.6, s)}
      />
      <path
        d={`M${cx - w} ${base} L${cx - w} ${base - h + w} A${w} ${w} 0 0 1 ${cx + w} ${base - h + w} L${cx + w} ${base} Z`}
        fill="var(--ig-door)"
      />
    </g>
  )
}

/** A finished igloo, drawn whole (village + the day one is finished). */
function FinishedIgloo({ cx, base, s, flag = true }: { cx: number; base: number; s: number; flag?: boolean }) {
  const r = R * s
  const courses = IGLOO_LAYERS.length
  return (
    <g>
      <path d={`M${cx - r} ${base} A${r} ${r} 0 0 1 ${cx + r} ${base} Z`} className={styles.brick} strokeWidth={1.6 * Math.max(0.55, s)} />
      {Array.from({ length: courses - 1 }, (_, i) => {
        const yy = (i + 1) * (r / courses)
        const half = Math.sqrt(r * r - yy * yy)
        return <path key={i} d={`M${cx - half} ${base - yy} L${cx + half} ${base - yy}`} stroke="var(--ig-line)" strokeOpacity={0.35} strokeWidth={Math.max(0.6, 1.2 * s)} />
      })}
      <Door cx={cx + r * 0.05} base={base} s={s} />
      {flag && (
        <g>
          <path d={`M${cx} ${base - r} L${cx} ${base - r - 16 * s}`} stroke="var(--ig-line)" strokeWidth={Math.max(0.8, 1.6 * s)} />
          <path d={`M${cx} ${base - r - 16 * s} L${cx + 11 * s} ${base - r - 12.5 * s} L${cx} ${base - r - 9 * s} Z`} fill="var(--ig-flag)" stroke="var(--ig-line)" strokeWidth={Math.max(0.6, 1.1 * s)} strokeLinejoin="round" />
        </g>
      )}
    </g>
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
          <clipPath id={`dome-${uid}`}>
            <circle cx={CX} cy={BASE} r={R + 0.5} />
          </clipPath>
          <clipPath id={`built-${uid}`}>
            {placed.map((b) => <rect key={b.key} x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} />)}
          </clipPath>
        </defs>

        {/* sky: sun by day, moon + stars at night */}
        {sleeping ? (
          <g>
            <path d="M318 26 A14 14 0 1 0 330 50 A11 11 0 1 1 318 26 Z" fill="var(--ig-sun)" stroke="var(--ig-line)" strokeWidth="1.4" strokeLinejoin="round" />
            {[[40, 30], [92, 18], [160, 34], [250, 20], [286, 52]].map(([x, y]) => (
              <path key={`${x}`} d={`M${x} ${y - 3} L${x} ${y + 3} M${x - 3} ${y} L${x + 3} ${y}`} stroke="var(--ig-sun)" strokeWidth="1.4" strokeLinecap="round" />
            ))}
          </g>
        ) : (
          <circle cx="320" cy="38" r="13" fill="var(--ig-sun)" fillOpacity="0.55" />
        )}

        {/* back hills + village */}
        <path d="M0 132 Q48 112 110 126 T226 120 T360 124 L360 160 L0 160 Z" fill="var(--ig-hill)" />
        {VILLAGE.slice(0, villageCount).map((v, i) => (
          <FinishedIgloo key={i} cx={v.x} base={v.y} s={v.s} />
        ))}

        {/* ground */}
        <path d="M0 156 Q80 144 170 152 T360 148 L360 220 L0 220 Z" fill="var(--ig-snow)" />
        <path d="M0 156 Q80 144 170 152 T360 148" fill="none" stroke="var(--ig-ghost)" strokeWidth="1.4" />
        <path d="M150 196 Q230 188 320 194" fill="none" stroke="var(--ig-snow-shade)" strokeWidth="2" strokeLinecap="round" />

        {/* footprints from the penguin to the igloo */}
        {Array.from({ length: 6 }, (_, i) => (
          <ellipse key={i} cx={104 + i * 13} cy={190 - (i % 2) * 4} rx="2.4" ry="1.4" fill="var(--ig-snow-shade)" opacity={mood === 'waiting' ? 0.45 : 0.9} />
        ))}

        {/* the brick pile next to the penguin */}
        <g>
          <rect x="104" y="176" width="16" height="9" rx="2.5" className={styles.brick} />
          <rect x="121" y="176" width="16" height="9" rx="2.5" className={styles.brick} />
          <rect x="112" y="167" width="16" height="9" rx="2.5" className={styles.brick} />
        </g>

        {/* the igloo under construction (or today's finished one) */}
        {showFinished ? (
          <FinishedIgloo cx={CX} base={BASE} s={1} />
        ) : (
          <g>
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
              <path d={`M${CX - R} ${BASE} A${R} ${R} 0 0 1 ${CX + R} ${BASE}`} fill="none" stroke="var(--ig-line)" strokeWidth="1.8" />
            </g>
            {bricks >= IGLOO_LAYERS[0] + IGLOO_LAYERS[1] && <Door cx={CX + 3} base={BASE} />}
          </g>
        )}
        <path d={`M${CX - R - 10} ${BASE + 1} Q${CX} ${BASE + 7} ${CX + R + 12} ${BASE + 1}`} fill="none" stroke="var(--ig-snow-shade)" strokeWidth="2.4" strokeLinecap="round" />

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
            style={{ '--dx': `${HANDS.x - flying.x}px`, '--dy': `${HANDS.y - flying.y}px` } as React.CSSProperties}
          />
        )}

        {/* the finished-igloo moment */}
        {celebrating && (
          <g>
            {[[CX - 70, 110], [CX + 72, 104], [CX - 40, 92], [CX + 44, 90], [CX, 84], [CX - 86, 140], [CX + 88, 138]].map(([x, y], i) => (
              <path
                key={i}
                className={styles.burst}
                d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`}
                fill={i % 2 ? 'var(--ig-sun)' : 'var(--ig-flag)'}
                stroke="var(--ig-line)"
                strokeWidth="0.9"
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
      <div className={styles.penguin} style={{ left: '9%', bottom: '13%', width: '21%' }} data-igloo-penguin>
        <div key={hopKey} className={cn(styles.penguinInner, hopKey > 0 && mood !== 'waiting' && styles.hop)}>
          <PetSprite color={look.color} accessory={look.accessory} pose={sleeping ? 'sleep' : 'stand'} blush={mood === 'proud' || celebrating} />
          {showCarry && <span className={styles.carry} aria-hidden="true" />}
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
