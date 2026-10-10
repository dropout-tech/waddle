'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  WATER_PET_GRACE_MS,
  getPetWaterReady,
  setWaterPetRequest,
  subscribeWaterMoment,
} from '@/lib/water-moment'
import { WaterDrop } from './water-drop'

/**
 * Shows a due water reminder (hooks/use-water-reminder.ts decides WHEN) one of two ways
 * (老闆 2026-10-10):
 *   A — the penguin on screen walks over with a glass and a small card (drawn by the pet itself;
 *       this host only hands it the request through lib/water-moment.ts);
 *   C — one water drop in the corner, when there is no penguin to send: not adopted, switched off,
 *       hidden by the layout, muted (「安靜 1 小時／今天先別吵」), or out of sight for 3 s.
 * Replaces the old full-screen popup (components/modals/water-reminder-modal.tsx).
 */
export function WaterReminder({
  isOpen,
  dueAfterFocus,
  onDrink,
  onSnooze,
  onDisable,
  onIgnore,
}: {
  isOpen: boolean
  dueAfterFocus: boolean
  onDrink: () => void
  onSnooze: () => void
  onDisable: () => void
  onIgnore: () => void
}) {
  const petReady = useSyncExternalStore(subscribeWaterMoment, getPetWaterReady, () => false)
  const [mode, setMode] = useState<'pet' | 'drop' | null>(null)
  const seq = useRef(0)
  const latest = useRef({ onDrink, onSnooze, onDisable, dueAfterFocus })
  useEffect(() => {
    latest.current = { onDrink, onSnooze, onDisable, dueAfterFocus }
  }, [onDrink, onSnooze, onDisable, dueAfterFocus])

  // Pick the way once, when the reminder opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the hook's open flag into a latched choice
    setMode((m) => (isOpen ? (m ?? (getPetWaterReady() ? 'pet' : 'drop')) : null))
  }, [isOpen])

  // The penguin can't be seen for a few seconds → the drop takes over for this round.
  useEffect(() => {
    if (mode !== 'pet' || petReady) return
    const id = window.setTimeout(() => setMode('drop'), WATER_PET_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [mode, petReady])

  // Hand A to the pet; withdrawing it (answered, switched off, fell back to C) sends it home.
  useEffect(() => {
    if (mode !== 'pet') return
    seq.current += 1
    setWaterPetRequest({
      id: seq.current,
      afterFocus: latest.current.dueAfterFocus,
      handlers: {
        drink: () => latest.current.onDrink(),
        later: () => latest.current.onSnooze(),
        disable: () => latest.current.onDisable(),
      },
    })
    return () => setWaterPetRequest(null)
  }, [mode])

  if (mode !== 'drop') return null
  return <WaterDrop afterFocus={dueAfterFocus} onDrink={onDrink} onIgnore={onIgnore} onDisable={onDisable} />
}
