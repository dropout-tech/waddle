/**
 * Per-user penguin pet (「你的企鵝」).
 *
 * Stored inside the existing `user_settings.notifications` JSONB blob under
 * the `pet` key — no migration: that column is already a free-form,
 * owner-only (RLS) JSON document, and a pet that talks to you is a kind of
 * notification preference. See hooks/use-waddle-data.ts `setPet` and
 * lib/supabase/mappers.ts `rowToSettings`.
 *
 * Everything that only matters on one device (mute timers, the last-used
 * line ids, "already reminded today" stamps) lives in localStorage instead —
 * see lib/pet/local.ts.
 */

export const PET_COLORS = ['ink', 'cocoa', 'terracotta', 'mustard', 'sage'] as const
export type PetColor = (typeof PET_COLORS)[number]

export const PET_ACCESSORIES = ['none', 'scarf', 'hat', 'glasses', 'headphones'] as const
export type PetAccessory = (typeof PET_ACCESSORIES)[number]

export const PET_CHATTINESS = ['low', 'medium', 'high'] as const
export type PetChattiness = (typeof PET_CHATTINESS)[number]

export interface PetSettings {
  /** False until the user adopts (or skips the adoption card). */
  adopted: boolean
  /** Master switch — off hides the penguin everywhere. */
  enabled: boolean
  /** 1–12 characters. */
  name: string
  color: PetColor
  accessory: PetAccessory
  chattiness: PetChattiness
  /** Default on: silent while a focus timer is running (still speaks when it ends). */
  quietDuringFocus: boolean
  adoptedAt?: string
}

export const PET_NAME_MAX = 12
export const DEFAULT_PET_NAME_ZH = 'Huddle'
export const DEFAULT_PET_NAME_EN = 'Huddle'

export function defaultPet(lang: 'zh-TW' | 'en' = 'zh-TW'): PetSettings {
  return {
    adopted: false,
    enabled: true,
    name: lang === 'en' ? DEFAULT_PET_NAME_EN : DEFAULT_PET_NAME_ZH,
    color: 'ink',
    accessory: 'scarf',
    chattiness: 'medium',
    quietDuringFocus: true,
  }
}

/** Count user-perceived characters (so an emoji counts as one). */
export function petNameLength(name: string): number {
  return Array.from(name).length
}

/** Trim + collapse whitespace + cap at PET_NAME_MAX characters. */
export function cleanPetName(name: string): string {
  return Array.from(name.replace(/\s+/g, ' ').trim()).slice(0, PET_NAME_MAX).join('')
}

/** Tolerant parser for whatever sits in the JSONB blob. `null` = never adopted. */
export function normalizePet(raw: unknown): PetSettings | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const base = defaultPet()
  const name = typeof r.name === 'string' ? cleanPetName(r.name) : ''
  return {
    adopted: r.adopted === true,
    enabled: r.enabled !== false,
    name: name || base.name,
    color: PET_COLORS.includes(r.color as PetColor) ? (r.color as PetColor) : base.color,
    accessory: PET_ACCESSORIES.includes(r.accessory as PetAccessory) ? (r.accessory as PetAccessory) : base.accessory,
    chattiness: PET_CHATTINESS.includes(r.chattiness as PetChattiness) ? (r.chattiness as PetChattiness) : base.chattiness,
    quietDuringFocus: r.quietDuringFocus !== false,
    ...(typeof r.adoptedAt === 'string' ? { adoptedAt: r.adoptedAt } : {}),
  }
}

/**
 * Idle-chatter base interval per frequency (minutes), jittered ±20% at
 * runtime: 少 ≈ 2–3 h, 中 (default) ≈ 60–90 min, 多 ≈ 25–35 min. The owner
 * wants the penguin to speak up only now and then (2026-09-27). Stored as
 * the level name, so existing users on the default pick this up as-is.
 */
export const IDLE_MINUTES: Record<PetChattiness, number> = { low: 150, medium: 75, high: 30 }
/** At most this many idle lines per day (per device), whatever the frequency. */
export const IDLE_DAILY_CAP = 4
/** Chance that completing a task gets a celebration line. */
export const CELEBRATE_CHANCE = 1 / 3

/**
 * Warm palette (DESIGN.md: hue 25–155, no cold blues/purples). `body` is a
 * CSS filter applied to the charcoal art (belly tints along with it, which
 * reads as a warmer bird rather than a recolour); `accent` paints the
 * accessory so the colour pick is visible even at 40px.
 */
export const PET_COLOR_STYLES: Record<PetColor, { label: string; body: string; accent: string; swatch: string }> = {
  ink: { label: '墨炭', body: 'none', accent: '#b8482a', swatch: '#3b3c34' },
  cocoa: { label: '可可', body: 'sepia(0.55) saturate(1.5) hue-rotate(-12deg) brightness(1.18)', accent: '#dca06a', swatch: '#6f5140' },
  terracotta: { label: '赤陶', body: 'sepia(0.75) saturate(2.4) hue-rotate(-22deg) brightness(1.22)', accent: '#cf5731', swatch: '#9c4b33' },
  mustard: { label: '芥末', body: 'sepia(0.85) saturate(2) hue-rotate(8deg) brightness(1.4)', accent: '#edc747', swatch: '#a08a3a' },
  sage: { label: '鼠尾草', body: 'sepia(0.45) saturate(1.3) hue-rotate(45deg) brightness(1.3)', accent: '#cdd3a6', swatch: '#6b7560' },
}

export const PET_ACCESSORY_LABELS: Record<PetAccessory, string> = {
  none: '無',
  scarf: '圍巾',
  hat: '帽子',
  glasses: '眼鏡',
  headphones: '耳機',
}

export const PET_CHATTINESS_LABELS: Record<PetChattiness, string> = {
  low: '少',
  medium: '中',
  high: '多',
}
