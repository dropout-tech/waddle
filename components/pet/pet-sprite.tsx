'use client'

import { cn } from '@/lib/utils'
import { PET_COLOR_STYLES, type PetAccessory, type PetColor } from '@/lib/pet/types'
import styles from './pet.module.css'

export type PetPose = 'stand' | 'sleep'

const INK = '#292b24'
/** The art's body charcoal — eyelids are painted in it so a blink reads as closed eyes. */
const BODY = '#555549'

/**
 * The penguin itself: the existing marketing art (public/art/penguin) with a
 * colour filter, SVG eyelids/blush and an SVG accessory layered on top.
 * All geometry is in the art's 240×240 space (eyes measured at (90,82) and
 * (162,82)); the accessory sits outside the filter so it keeps its colour.
 * Pure presentation — animation state arrives as data attributes that
 * pet.module.css keys off.
 */
export function PetSprite({
  color,
  accessory,
  pose = 'stand',
  blink = false,
  blush = false,
  className,
}: {
  color: PetColor
  accessory: PetAccessory
  pose?: PetPose
  blink?: boolean
  blush?: boolean
  className?: string
}) {
  const palette = PET_COLOR_STYLES[color] ?? PET_COLOR_STYLES.ink
  const accent = palette.accent
  const standing = pose === 'stand'
  return (
    <span className={cn(styles.sprite, className)} data-pose={pose} data-blink={blink ? '' : undefined} aria-hidden="true">
      <span className={styles.body} style={{ filter: palette.body === 'none' ? undefined : palette.body }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static sprite, next/image adds wrappers + lazy logic we don't want */}
        <img src={`/art/penguin/${pose}.webp`} alt="" width={240} height={240} draggable={false} decoding="async" />
        {standing && (
          <svg viewBox="0 0 240 240" className={styles.overlay}>
            <g className={styles.lids}>
              <ellipse cx="90" cy="82" rx="20" ry="21" fill={BODY} />
              <ellipse cx="162" cy="82" rx="20" ry="21" fill={BODY} />
            </g>
            <g className={styles.blush} data-on={blush ? '' : undefined}>
              <ellipse cx="60" cy="114" rx="16" ry="9" fill="#e79a86" />
              <ellipse cx="192" cy="114" rx="16" ry="9" fill="#e79a86" />
            </g>
          </svg>
        )}
      </span>
      {standing && accessory !== 'none' && (
        <svg viewBox="0 0 240 240" className={styles.overlay}>
          <Accessory kind={accessory} accent={accent} />
        </svg>
      )}
    </span>
  )
}

function Accessory({ kind, accent }: { kind: PetAccessory; accent: string }) {
  switch (kind) {
    case 'scarf':
      return (
        <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
          <path d="M150 124 L170 176 L150 181 L136 128 Z" fill={accent} />
          <path d="M38 110 Q120 140 202 110 L206 130 Q120 160 34 130 Z" fill={accent} />
          <path d="M70 124 L74 140 M100 131 L102 148 M140 131 L138 148 M170 124 L166 140" stroke={INK} strokeOpacity="0.35" strokeWidth="4" fill="none" />
        </g>
      )
    case 'hat':
      return (
        <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
          <path d="M72 40 Q72 2 120 2 Q168 2 168 40 Z" fill={accent} />
          <rect x="64" y="30" width="112" height="18" rx="9" fill={accent} />
          <path d="M84 34 L84 46 M102 34 L102 46 M120 34 L120 46 M138 34 L138 46 M156 34 L156 46" stroke={INK} strokeOpacity="0.35" strokeWidth="4" />
          <circle cx="120" cy="2" r="11" fill="#f6f3e9" />
        </g>
      )
    case 'glasses':
      return (
        <g stroke={INK} strokeWidth="5" fill="none">
          <circle cx="90" cy="82" r="27" fill={accent} fillOpacity="0.14" />
          <circle cx="90" cy="82" r="27" stroke={accent} strokeWidth="7" />
          <circle cx="90" cy="82" r="27" />
          <circle cx="162" cy="82" r="27" fill={accent} fillOpacity="0.14" />
          <circle cx="162" cy="82" r="27" stroke={accent} strokeWidth="7" />
          <circle cx="162" cy="82" r="27" />
          <path d="M117 80 Q126 72 135 80" strokeWidth="6" />
        </g>
      )
    case 'headphones':
      return (
        <g stroke={INK} strokeWidth="5" strokeLinejoin="round">
          <path d="M34 92 Q30 14 120 12 Q210 14 206 92" fill="none" strokeWidth="14" />
          <path d="M34 92 Q30 14 120 12 Q210 14 206 92" fill="none" stroke={accent} strokeWidth="6" />
          <rect x="14" y="72" width="32" height="50" rx="14" fill={accent} />
          <rect x="194" y="72" width="32" height="50" rx="14" fill={accent} />
        </g>
      )
    default:
      return null
  }
}
