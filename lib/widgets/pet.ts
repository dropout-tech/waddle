import { PET_LINES, linesOf, renderLine, type PetLineCategory } from '@/lib/pet/lines'
import { iglooLine } from '@/lib/igloo/lines'
import type { IglooMood, IglooState } from '@/lib/igloo/compute'
import { PET_COLORS, PET_ACCESSORIES, type PetAccessory, type PetColor, type PetSettings } from '@/lib/pet/types'

/**
 * What the native 「我的 Huddle」 widget needs about the user's penguin. The
 * widget picks the speech bubble itself (next scheduled item > overdue /
 * unfinished today > water > a fun line, HuddleWidgets.swift petBubble), so
 * this only carries the look, the language, and ready-rendered lines.
 */
export interface WidgetPet {
  /** Adopted and not hidden. False → the widget invites the user to adopt. */
  adopted: boolean
  name: string
  color: PetColor
  accessory: PetAccessory
  lang: 'zh-TW' | 'en'
  overdue: number
  /** An 'overdue' line with the real count filled in; '' when nothing is overdue. */
  overdueLine: string
  /** Short absurd lines / jokes / tips for idle moments and 「呱」 taps. */
  lines: string[]
  /**
   * 企鵝的冰屋 (lib/igloo). Optional: older app builds don't send it and the
   * native widget must treat it as absent. Not read by Swift yet.
   */
  igloo?: WidgetIgloo
}

export interface WidgetIgloo {
  /** 1-based number of the igloo under construction (or the one finished today). */
  stage: number
  /** Igloos already finished. */
  built: number
  /** Bricks on the current igloo (equals perIgloo on the day one is finished). */
  bricks: number
  perIgloo: number
  /** Bricks added today. */
  today: number
  mood: IglooMood
  /** One ready-rendered line about today, in `lang`. */
  line: string
}

export function widgetIgloo(state: IglooState, lang: 'zh-TW' | 'en', seed: string): WidgetIgloo {
  const full = state.bricksInCurrent === 0 && state.completedIgloos > 0 && state.mood === 'proud'
  return {
    stage: full ? state.completedIgloos : state.completedIgloos + 1,
    built: state.completedIgloos,
    bricks: full ? state.bricksPerIgloo : state.bricksInCurrent,
    perIgloo: state.bricksPerIgloo,
    today: state.bricksToday,
    mood: state.mood,
    line: iglooLine(state, lang, seed),
  }
}

const FUN: PetLineCategory[] = ['absurd', 'joke', 'work', 'tip']
export const WIDGET_PET_LINES = 12
/** Bubble budget: roughly three lines in a small widget. */
const MAX_CHARS = { 'zh-TW': 30, en: 72 } as const

/** Small deterministic PRNG so the day's lines stay put across the many snapshot publishes of one day. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function widgetPet(pet: PetSettings | null | undefined, opts: { overdue: number; lang: 'zh-TW' | 'en'; day: string; igloo?: IglooState | null }): WidgetPet {
  const { lang, day } = opts
  const adopted = !!pet?.adopted && pet.enabled !== false
  const name = pet?.name || 'Huddle'
  const fits = (s: string) => s.length > 0 && Array.from(s).length <= MAX_CHARS[lang]
  const rand = seeded(`${day}:${name}`)
  const pool = PET_LINES.filter(l => FUN.includes(l.cat) && (lang === 'en' ? l.en : l.zh))
    .map(l => renderLine(l, lang, { name })).filter(fits)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const overdueTemplates = linesOf('overdue').map(l => renderLine(l, lang, { count: opts.overdue })).filter(fits)
  return {
    adopted,
    name,
    color: PET_COLORS.includes(pet?.color as PetColor) ? pet!.color : 'ink',
    accessory: PET_ACCESSORIES.includes(pet?.accessory as PetAccessory) ? pet!.accessory : 'none',
    lang,
    overdue: opts.overdue,
    overdueLine: opts.overdue > 0 && overdueTemplates.length ? overdueTemplates[Math.floor(rand() * overdueTemplates.length)] : '',
    lines: adopted ? pool.slice(0, WIDGET_PET_LINES) : [],
    ...(opts.igloo ? { igloo: widgetIgloo(opts.igloo, lang, `${day}:${name}`) } : {}),
  }
}
