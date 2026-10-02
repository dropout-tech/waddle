/**
 * Window events that let any surface (penguin bubble, report card, header
 * menu, ⌘K) open the life grid without importing its provider — the pet and
 * the report dashboard stay decoupled from the overlay's React tree.
 */
export const LIFE_GRID_OPEN_EVENT = 'huddle-life-grid:open'
/** Fired after a line is saved/cleared — `detail.date` is the YYYY-MM-DD. */
export const LIFE_GRID_SAVED_EVENT = 'huddle-life-grid:saved'

export interface LifeGridOpenDetail {
  /** Focus today's input (the penguin's evening question). */
  focusToday?: boolean
}

export function openLifeGrid(detail: LifeGridOpenDetail = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<LifeGridOpenDetail>(LIFE_GRID_OPEN_EVENT, { detail }))
}

export function announceLifeGridSaved(date: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ date: string }>(LIFE_GRID_SAVED_EVENT, { detail: { date } }))
}
