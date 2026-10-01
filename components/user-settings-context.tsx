'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { UserSettings } from '@/lib/types'

/**
 * Makes the signed-in user's saved settings readable deep in the tree
 * (calendar views, notification bell) without threading props through every
 * intermediate component — same idea as CategoryPrefixProvider. `null` when no
 * provider is mounted; consumers fall back to their own defaults.
 */
const UserSettingsContext = createContext<UserSettings | null>(null)

export function UserSettingsProvider({
  value,
  children,
}: {
  value: UserSettings
  children: ReactNode
}) {
  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  )
}

export function useUserSettings(): UserSettings | null {
  return useContext(UserSettingsContext)
}

/** 預設任務時長 (minutes) — length of a task created by a single click/tap on the grid. */
export function useDefaultTaskDuration(): number {
  const raw = useUserSettings()?.bufferTime?.defaultDuration
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 15 ? Math.min(240, Math.round(raw)) : 30
}

/** 每週開始日 — 0 = Sunday, 1 = Monday. */
export function useWeekStartDay(): number {
  const raw = useUserSettings()?.weekStartDay
  return typeof raw === 'number' && raw >= 0 && raw <= 6 ? raw : 0
}
