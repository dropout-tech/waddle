/**
 * Single source of truth for every hex color the app persists to the
 * database or offers as a user-facing swatch (workspace.color,
 * categories/tasks color, user_settings.calendar_color/default_task_colors,
 * and the color-picker preset lists in settings-modal / task-detail-modal).
 *
 * Values are derived from DESIGN.md's OKLCH definitions (see app/globals.css
 * for the CSS custom properties used by the live theme). Storage layers only
 * understand hex strings, so this module exports hex as the primary value —
 * each entry's OKLCH source is kept in a comment so the two never drift
 * silently.
 *
 * DESIGN.md hard rules this file must respect:
 * - Warm hue range 25-155 only, except the one explicitly permitted cool
 *   exception: Workspace 2 / 低彩度藍 at oklch(*, *, 230).
 * - No pure Tailwind red/blue/purple/green (#ef4444 / #3b82f6 / #a855f7 /
 *   #22c55e and friends).
 * - Urgency communicated via increasing terracotta saturation, never a bare
 *   red exclamation color.
 */

// ─────────────────────────────────────────────────────────────────────────
// Workspace Color Set (DESIGN.md § Workspace Color Set)
// ─────────────────────────────────────────────────────────────────────────

export interface PaletteColor {
  id: string
  /** 中文名，供設定介面顯示 */
  name: string
  hex: string
  /** DESIGN.md 原始 OKLCH 定義，僅供對照，不在執行期使用 */
  oklch: string
}

export const WORKSPACE_COLORS = {
  /** Workspace 1 — 預設第一個 workspace */
  terracotta: {
    id: 'terracotta',
    name: '赤陶（主色）',
    hex: '#E1755A',
    oklch: 'oklch(0.68 0.14 35)',
  },
  /** Workspace 2 — 唯一允許的冷色 */
  lowChromaBlue: {
    id: 'low-chroma-blue',
    name: '霧藍（低彩度藍）',
    hex: '#259CCA',
    oklch: 'oklch(0.65 0.12 230)',
  },
  /** Workspace 3 */
  sage: {
    id: 'sage',
    name: '鼠尾草綠',
    hex: '#59B47D',
    oklch: 'oklch(0.7 0.12 155)',
  },
  /** Workspace 4 */
  dustyLavender: {
    id: 'dusty-lavender',
    name: '霧薰衣草',
    hex: '#AE96DA',
    oklch: 'oklch(0.72 0.1 300)',
  },
} as const satisfies Record<string, PaletteColor>

/** Ordered list matching the Workspace 1-4 assignment order in DESIGN.md. */
export const WORKSPACE_COLOR_ORDER: PaletteColor[] = [
  WORKSPACE_COLORS.terracotta,
  WORKSPACE_COLORS.lowChromaBlue,
  WORKSPACE_COLORS.sage,
  WORKSPACE_COLORS.dustyLavender,
]

/** Default color for a brand-new workspace (Workspace 1 slot / primary). */
export const DEFAULT_WORKSPACE_COLOR = WORKSPACE_COLORS.terracotta.hex

/** Default value for user_settings.calendar_color (replaces old '#3b82f6'). */
export const DEFAULT_CALENDAR_COLOR = WORKSPACE_COLORS.terracotta.hex

// ─────────────────────────────────────────────────────────────────────────
// Additional picker swatches — same warm hue family, for free color choice
// on categories/tasks/time-blocks where a plain workspace color isn't enough
// variety. Chosen to stay within hue 25-155 (or the same permitted blue).
// ─────────────────────────────────────────────────────────────────────────

export const EXTRA_PICKER_COLORS = {
  terracottaDark: {
    id: 'terracotta-dark',
    name: '深赤陶',
    hex: '#BC4527',
    oklch: 'oklch(0.55 0.16 35)',
  },
  terracottaLight: {
    id: 'terracotta-light',
    name: '淺赤陶',
    hex: '#F3B2A1',
    oklch: 'oklch(0.82 0.08 35)',
  },
  rose: {
    id: 'rose',
    name: '玫瑰粉',
    hex: '#E98092',
    oklch: 'oklch(0.72 0.13 10)',
  },
  honey: {
    id: 'honey',
    name: '蜂蜜黃',
    hex: '#DDB049',
    oklch: 'oklch(0.78 0.13 85)',
  },
  clayBrown: {
    id: 'clay-brown',
    name: '陶土棕',
    hex: '#865634',
    oklch: 'oklch(0.5 0.08 55)',
  },
  tangerine: {
    id: 'tangerine',
    name: '蜜柑橘',
    hex: '#F28E42',
    oklch: 'oklch(0.74 0.15 55)',
  },
} as const satisfies Record<string, PaletteColor>

/**
 * Full picker swatch list for color-choice UIs (settings-modal's slot-type
 * color picker, task-detail-modal's calendar-color picker). 10 colors total,
 * matching the size of the old non-brand PRESET_COLORS arrays it replaces.
 */
export const PICKER_COLORS: PaletteColor[] = [
  ...WORKSPACE_COLOR_ORDER,
  EXTRA_PICKER_COLORS.terracottaDark,
  EXTRA_PICKER_COLORS.terracottaLight,
  EXTRA_PICKER_COLORS.rose,
  EXTRA_PICKER_COLORS.honey,
  EXTRA_PICKER_COLORS.clayBrown,
  EXTRA_PICKER_COLORS.tangerine,
]

/** Flat hex list, for call sites that only want the string values. */
export const PICKER_COLOR_HEXES: string[] = PICKER_COLORS.map((c) => c.hex)

// ─────────────────────────────────────────────────────────────────────────
// Urgency ramp (DESIGN.md § Functional) — increasing terracotta saturation,
// never a bare red. Mirrors app/globals.css --urgency-*/--overdue tokens.
// ─────────────────────────────────────────────────────────────────────────

export const URGENCY_COLORS = {
  low: { id: 'urgency-low', name: '不急（綠）', hex: '#82CB9B', oklch: 'oklch(0.78 0.1 155)' },
  medium: { id: 'urgency-medium', name: '一般（黃綠）', hex: '#D6BD5C', oklch: 'oklch(0.8 0.12 95)' },
  high: { id: 'urgency-high', name: '重要（橘）', hex: '#F1944F', oklch: 'oklch(0.75 0.14 55)' },
  critical: { id: 'urgency-critical', name: '緊急（赤陶）', hex: '#EA6A64', oklch: 'oklch(0.68 0.16 25)' },
  overdue: { id: 'overdue', name: '逾期（深赤陶）', hex: '#D74745', oklch: 'oklch(0.6 0.18 25)' },
} as const satisfies Record<string, PaletteColor>

// ─────────────────────────────────────────────────────────────────────────
// Migration map — every hardcoded non-brand hex found in the codebase
// (demo-data.ts, mock-data.ts, the two duplicated PRESET_COLORS arrays in
// settings-modal.tsx / task-detail-modal.tsx, the onboarding template
// TEMPLATES in use-waddle-data.ts, and the '#6B7FD4' generic task-type
// default in time-grid.tsx) mapped to the nearest brand color by hue.
// Used by both the runtime migrateLegacyColor() helper below and by
// supabase/migrations/0014_brand_palette_migration.sql (kept in sync by
// hand — the SQL can't import this file).
// ─────────────────────────────────────────────────────────────────────────

export const OLD_COLOR_MIGRATION_MAP: Record<string, string> = {
  // demo-data.ts workspaces
  '#6366f1': WORKSPACE_COLORS.dustyLavender.hex, // indigo (hue ~277) → nearest is lavender (300)
  '#3b82f6': WORKSPACE_COLORS.lowChromaBlue.hex, // tailwind blue (hue ~260) → the permitted blue (230)
  '#10b981': WORKSPACE_COLORS.sage.hex, // emerald (hue ~163) → sage (155)
  // onboarding template ('學習' workspace) — banned pure purple
  '#a855f7': WORKSPACE_COLORS.dustyLavender.hex, // purple (hue ~304) → lavender (300)
  // lib/mock-data.ts workspaces
  '#ff6b6b': WORKSPACE_COLORS.terracotta.hex, // coral red (hue ~23) → terracotta (35)
  '#4a90d9': WORKSPACE_COLORS.lowChromaBlue.hex, // blue (hue ~251) → low-chroma blue (230)
  '#66bb6a': WORKSPACE_COLORS.sage.hex, // green (hue ~145) → sage (155)
  // time-grid.tsx generic "task" slot-type default + week/day drag-preview fallback
  '#6b7fd4': WORKSPACE_COLORS.dustyLavender.hex, // indigo (hue ~272) → lavender (300)
  // settings-modal.tsx / task-detail-modal.tsx duplicated PRESET_COLORS
  '#ffb74d': EXTRA_PICKER_COLORS.honey.hex, // amber (hue ~74) → honey (85)
  '#9575cd': WORKSPACE_COLORS.dustyLavender.hex, // purple (hue ~299) → lavender (300)
  '#4dd0e1': WORKSPACE_COLORS.lowChromaBlue.hex, // cyan (hue ~207) → low-chroma blue (230)
  '#f06292': EXTRA_PICKER_COLORS.rose.hex, // pink (hue ~2) → rose (10)
  '#aed581': WORKSPACE_COLORS.sage.hex, // lime (hue ~129) → sage (155)
  '#ffd54f': EXTRA_PICKER_COLORS.honey.hex, // yellow (hue ~91) → honey (85)
  '#90a4ae': WORKSPACE_COLORS.lowChromaBlue.hex, // slate (hue ~229, low chroma) → low-chroma blue (230)
  // 0001_initial_schema.sql's user_settings.lunch_break / buffer_time jsonb
  // column defaults — the only place these two literal hexes live pre-brand;
  // nothing in TS duplicates them (hooks/use-waddle-data.ts's DEFAULT_SETTINGS
  // uses its own separate #F5F5F5/#FFF8E1 fallback, out of scope here).
  '#fbbf24': EXTRA_PICKER_COLORS.honey.hex, // amber (lunch_break default, hue ~84) → honey (85), near-exact
  '#94a3b8': EXTRA_PICKER_COLORS.clayBrown.hex, // slate-grey (buffer_time default) → clay-brown, keeps it a warm neutral instead of cool grey
}

/**
 * Look up a legacy hex color and return its brand replacement. Falls back to
 * the input unchanged when it isn't a known legacy value (i.e. the user
 * picked a genuinely custom color, which we never overwrite).
 */
export function migrateLegacyColor(hex: string | undefined | null): string | undefined {
  if (!hex) return hex ?? undefined
  return OLD_COLOR_MIGRATION_MAP[hex.trim().toLowerCase()] ?? hex
}

// ─────────────────────────────────────────────────────────────────────────
// Dark-mode display adjustment
//
// Every hex this app persists (workspace.color, category/task colors,
// user_settings.calendar_color, time-block colors) is chosen and stored as
// a *light-mode* value — picked against the cream paper background. Painted
// unchanged onto the warm-charcoal dark background, the same saturated mid-
// lightness swatches read as neon (too much lightness contrast + chroma
// against a dark surface). `toDarkDisplayColor` computes a deterministic
// dark-mode-appropriate variant in OKLCH space: pull lightness into a narrow
// legible band and cap chroma, keeping the hue exactly (so the color still
// reads as "the same" workspace/task color, just toned for the dark
// surface). Pure function of the input hex — same input always yields the
// same output — with a Map cache since this runs on every render of every
// calendar block / chip.
//
// Conversion math is the standard sRGB <-> OKLab <-> OKLCH transform
// (Björn Ottosson, https://bottosson.github.io/posts/oklab/), reimplemented
// here because no color-math dependency (culori/colorjs.io/chroma-js) is in
// package.json. Verified against this file's own oklch source comments —
// e.g. hexToOklch('#E1755A') round-trips to ~oklch(0.68 0.141 35.1),
// matching WORKSPACE_COLORS.terracotta.oklch above.
// ─────────────────────────────────────────────────────────────────────────

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearChannelToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function hexToRgb01(hex: string): [number, number, number] {
  const stripped = hex.trim().replace('#', '')
  const full = stripped.length === 3 ? stripped.split('').map((c) => c + c).join('') : stripped
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]
}

function rgb01ToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgb01ToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbChannelToLinear(r)
  const lg = srgbChannelToLinear(g)
  const lb = srgbChannelToLinear(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

function oklabToRgb01(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [linearChannelToSrgb(lr), linearChannelToSrgb(lg), linearChannelToSrgb(lb)]
}

/** Parse a hex color into OKLCH components (l: 0-1, c: chroma, h: degrees). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = hexToRgb01(hex)
  const [L, a, bb] = rgb01ToOklab(r, g, b)
  const c = Math.sqrt(a * a + bb * bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

/** Render OKLCH components (l: 0-1, c: chroma, h: degrees) back to hex. */
export function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const [r, g, bb] = oklabToRgb01(l, a, b)
  return rgb01ToHex(r, g, bb)
}

/** Lightness band and chroma ceiling a light-mode color is pulled into for
 * display on the dark-charcoal surface. Tuned against real dark-mode
 * screenshots of the calendar/task-row chips — outside this band, saturated
 * workspace colors either glow neon (too light/saturated) or sink invisibly
 * into the card (too dark). */
const DARK_DISPLAY_L_MIN = 0.6
const DARK_DISPLAY_L_MAX = 0.68
const DARK_DISPLAY_MAX_CHROMA = 0.11

const darkDisplayColorCache = new Map<string, string>()

/**
 * Map a light-mode-authored hex color to its dark-mode display variant.
 * Deterministic (same input → same output, memoized). Hue is preserved
 * exactly; lightness is clamped into [0.6, 0.68] and chroma is capped at
 * 0.11 in OKLCH space, per DESIGN.md's "warm hue discipline" — this keeps
 * the color recognizably "the same" swatch, just toned down for the dark
 * charcoal background instead of the cream one it was picked against.
 *
 * Falls back to returning the input unchanged if it isn't parseable hex
 * (defensive — callers should already be passing validated hex).
 */
export function toDarkDisplayColor(hex: string | undefined | null): string | undefined {
  if (!hex) return hex ?? undefined
  const key = hex.trim().toLowerCase()
  const cached = darkDisplayColorCache.get(key)
  if (cached) return cached

  let result: string
  try {
    const { l, c, h } = hexToOklch(key)
    if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) {
      result = key
    } else {
      const clampedL = Math.min(DARK_DISPLAY_L_MAX, Math.max(DARK_DISPLAY_L_MIN, l))
      const clampedC = Math.min(DARK_DISPLAY_MAX_CHROMA, c)
      result = oklchToHex(clampedL, clampedC, h)
    }
  } catch {
    result = key
  }
  darkDisplayColorCache.set(key, result)
  return result
}
