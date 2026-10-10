/**
 * How a due water reminder shows up (老闆 2026-10-10 選 A＋C):
 *
 *   A 企鵝送水來 — the penguin on screen waddles over with a glass + a small card
 *                  (drawn by components/pet/penguin-pet.tsx + pet-water.tsx).
 *   C 輕輕一滴   — fallback when there is no penguin to send (not adopted, switched
 *                  off, hidden by the layout, muted 「安靜」, or not visible for a few
 *                  seconds): one water drop in the corner (components/water/water-drop.tsx).
 *
 * hooks/use-water-reminder.ts still decides WHEN. The host (components/water/water-reminder.tsx,
 * mounted in app/page.tsx) decides WHICH WAY, and hands A to the pet through this tiny external
 * store — the pet lives deep inside MainLayout, so no prop path / context is shared.
 *
 * Only reminds, never records (老闆 2026-10-02): nothing here counts glasses.
 */

/** C: how long the drop may sit on a VISIBLE page before it evaporates on its own. */
export const WATER_DROP_VISIBLE_MS = 60_000
/** C: an evaporated drop asks again this much later… */
export const WATER_IGNORE_RETRY_MINUTES = 15
/** A: the penguin may be unavailable this long (muted, the layout hiding it, stepping aside) before C takes over. */
export const WATER_PET_GRACE_MS = 3_000

/** Something that covers the whole screen for a while (a dialog, the immersive timer): the penguin hides under
 *  it (penguin-pet.tsx uses the same rule) and the drop's countdown doesn't run behind it. */
export const WATER_COVER_SELECTOR = '[role="dialog"]:not([data-pet-ui]):not([data-onboarding-tour]), [data-pet-hide]'

export const WATER_IGNORED_KEY = 'waddle.waterReminder.ignoredOnce'

/**
 * C was ignored (evaporated without a tap). The first time: ask again in 15 minutes.
 * The second time in a row: that round is over — the next reminder is a full interval away.
 * Any answer (drink / later / switch off) clears the streak.
 */
export function planAfterIgnore(p: { ignoredBefore: boolean; now: number; intervalMin: number }): {
  nextDueAt: number
  ignoredOnce: boolean
} {
  if (p.ignoredBefore) return { nextDueAt: p.now + Math.max(1, p.intervalMin) * 60_000, ignoredOnce: false }
  return { nextDueAt: p.now + WATER_IGNORE_RETRY_MINUTES * 60_000, ignoredOnce: true }
}

export function getWaterIgnoredOnce(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(WATER_IGNORED_KEY) === '1'
  } catch {
    return false
  }
}

export function setWaterIgnoredOnce(on: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (on) window.localStorage.setItem(WATER_IGNORED_KEY, '1')
    else window.localStorage.removeItem(WATER_IGNORED_KEY)
  } catch {
    /* storage unavailable: the streak just isn't remembered */
  }
}

// ── pet ⇄ host store ────────────────────────────────────────────────────────────────────

export interface WaterPetHandlers {
  /** 「乾杯」: had a sip → full interval. */
  drink: () => void
  /** 「等等再喝」: ask again in a few minutes. */
  later: () => void
  /** The card's ⋯ panel switched the reminder off. */
  disable: () => void
}

/**
 * Which words to use:
 *   break      — a pomodoro break is actually running → 「剛好休息…」
 *   focusEnded — it waited for a focus stretch that was paused / stopped (no break) → 「這段專注告一段落…」
 *   normal     — everything else.
 */
export type WaterVariant = 'normal' | 'focusEnded' | 'break'

export function waterVariant(p: { onBreak: boolean; dueAfterFocus: boolean }): WaterVariant {
  if (p.onBreak) return 'break'
  return p.dueAfterFocus ? 'focusEnded' : 'normal'
}

export interface WaterPetRequest {
  /** New id = a new delivery (the pet starts walking over). */
  id: number
  variant: WaterVariant
  handlers: WaterPetHandlers
}

/**
 * ready — on screen and free to walk over;
 * wait  — only covered for now (a dialog such as 「這段時間做了什麼？」 after a pomodoro, or a background
 *         tab): A waits for it instead of falling back;
 * off   — no penguin to send (not adopted / switched off / muted / hidden by the layout / stepping aside
 *         for a control): C.
 */
export type PetWaterState = 'ready' | 'wait' | 'off'

let petState: PetWaterState = 'off'
let request: WaterPetRequest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function subscribeWaterMoment(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const getPetWaterState = () => petState
export const getWaterPetRequest = () => request

export function setPetWaterState(next: PetWaterState) {
  if (petState === next) return
  petState = next
  emit()
}

export function setWaterPetRequest(next: WaterPetRequest | null) {
  if (request === next) return
  request = next
  emit()
}
