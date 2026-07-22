export const DEFAULT_MASCOT_SRC = '/huddle-mascot.png'

export const MASCOT_SURPRISES = [
  {
    id: 'squish',
    src: '/mascot-surprises/huddle-squish.png',
    message: '摸扁了，變成企鵝麻糬了。',
  },
  {
    id: 'paper',
    src: '/mascot-surprises/huddle-paper.png',
    message: '噹，我剛剛把自己摺好了。',
  },
  {
    id: 'pixel',
    src: '/mascot-surprises/huddle-pixel.png',
    message: '叮，切換成像素模式。',
  },
] as const

export type MascotSurprise = (typeof MASCOT_SURPRISES)[number]

/** Deterministic cycling keeps every surprise discoverable without flicker. */
export function getMascotSurprise(step: number): MascotSurprise {
  return MASCOT_SURPRISES[Math.abs(step - 1) % MASCOT_SURPRISES.length]
}
