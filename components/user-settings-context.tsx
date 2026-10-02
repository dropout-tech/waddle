'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { UserSettings } from '@/lib/types'
import { monthGridStartDay, resolveTaskMinutes, weekViewAlignDay } from '@/lib/settings-auto'

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

/** 預設任務時長 (minutes) — length of a task created by a single click/tap
 *  on the grid. Its own setting (defaultTaskMinutes); 自動 = 30 as before.
 *  (It used to read bufferTime.defaultDuration — the buffer-block length.) */
export function useDefaultTaskDuration(): number {
  return resolveTaskMinutes(useUserSettings()?.defaultTaskMinutes)
}

/** 每週開始日 for the month grid — 0 = Sunday; 自動 = Sunday as before. */
export function useMonthStartDay(): number {
  return monthGridStartDay(useUserSettings()?.weekStartDay)
}

/** Day the desktop week view snaps to, or null (自動: start at the selected
 *  date and roll forward, as before). */
export function useWeekViewAlignDay(): number | null {
  return weekViewAlignDay(useUserSettings()?.weekStartDay)
}
