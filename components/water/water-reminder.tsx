'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  WATER_PET_GRACE_MS,
  getPetWaterState,
  waterVariant,
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
 *       hidden by the layout, muted (「安靜 1 小時／今天先別吵」), or stepping aside for 3 s.
 *   A penguin that is only covered for now (a dialog, a background tab) is waited for, not replaced.
 * Replaces the old full-screen popup (components/modals/water-reminder-modal.tsx).
 */
export function WaterReminder({
  isOpen,
  dueAfterFocus,
  onBreak,
  onDrink,
  onSnooze,
  onDisable,
  onIgnore,
}: {
  isOpen: boolean
  dueAfterFocus: boolean
  /** A pomodoro break is running right now (only then 「剛好休息」). */
  onBreak: boolean
  onDrink: () => void
  onSnooze: () => void
  onDisable: () => void
  onIgnore: () => void
}) {
  const petState = useSyncExternalStore(subscribeWaterMoment, getPetWaterState, () => 'off' as const)
  const [mode, setMode] = useState<'pet' | 'drop' | null>(null)
  const seq = useRef(0)
  const variant = waterVariant({ onBreak, dueAfterFocus })
  const latest = useRef({ onDrink, onSnooze, onDisable, variant })
  useEffect(() => {
    latest.current = { onDrink, onSnooze, onDisable, variant }
  }, [onDrink, onSnooze, onDisable, variant])

  // Pick the way once, when the reminder opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the hook's open flag into a latched choice
    setMode((m) => (isOpen ? (m ?? (getPetWaterState() === 'off' ? 'drop' : 'pet')) : null))
  }, [isOpen])

  // No penguin to send for a few seconds → the drop takes over for this round. (Merely covered → keep waiting.)
  useEffect(() => {
    if (mode !== 'pet' || petState !== 'off') return
    const id = window.setTimeout(() => setMode('drop'), WATER_PET_GRACE_MS)
    return () => window.clearTimeout(id)
  }, [mode, petState])

  // Hand A to the pet; withdrawing it (answered, switched off, fell back to C) sends it home.
  useEffect(() => {
    if (mode !== 'pet') return
    seq.current += 1
    setWaterPetRequest({
      id: seq.current,
      variant: latest.current.variant,
      handlers: {
        drink: () => latest.current.onDrink(),
        later: () => latest.current.onSnooze(),
        disable: () => latest.current.onDisable(),
      },
    })
    return () => setWaterPetRequest(null)
  }, [mode])

  if (mode !== 'drop') return null
  return <WaterDrop variant={variant} onDrink={onDrink} onIgnore={onIgnore} onDisable={onDisable} />
}
