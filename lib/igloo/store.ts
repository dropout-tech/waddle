/**
 * Tiny external store for the current igloo state. IglooHost (mounted once in
 * app/page.tsx) is the only writer; the growth-page card, the pet's bubble
 * and the native widget payload read it — so none of them needs new props
 * threaded through the main layout.
 */
import type { IglooState } from './compute'

export const OPEN_IGLOO_EVENT = 'huddle:open-igloo'

let current: IglooState | null = null
let currentOwner: string | null = null
const listeners = new Set<() => void>()

export function getIglooSnapshot(): IglooState | null {
  return current
}

/**
 * Publish the igloo of `owner` (a user id); `null` clears it (signed out /
 * switching accounts) so no reader — e.g. the widget payload — ever shows
 * the previous account's numbers.
 */
export function setIglooSnapshot(next: IglooState | null, owner: string | null = null): void {
  if (!next) {
    if (current === null) return
    current = null
    currentOwner = null
    for (const l of listeners) l()
    return
  }
  const prev = current
  if (
    prev &&
    currentOwner === owner &&
    prev.totalBricks === next.totalBricks &&
    prev.bricksToday === next.bricksToday &&
    prev.mood === next.mood &&
    prev.daysIdle === next.daysIdle
  ) return
  current = next
  currentOwner = owner
  for (const l of listeners) l()
}

export function subscribeIgloo(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Open the igloo from anywhere (pet menu, growth card). */
export function openIgloo(): void {
  window.dispatchEvent(new CustomEvent(OPEN_IGLOO_EVENT))
}
