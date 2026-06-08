'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Broadcasts the user's `showCategoryPrefix` setting to the calendar views
 * without threading a boolean through every intermediate component. The value
 * lives in UserSettings (React state at the page root), so toggling it in
 * settings re-renders consumers immediately. Defaults to true to match
 * DEFAULT_SETTINGS when no provider is mounted (e.g. isolated tests).
 */
const CategoryPrefixContext = createContext<boolean>(true)

export function CategoryPrefixProvider({
  value,
  children,
}: {
  value: boolean
  children: ReactNode
}) {
  return (
    <CategoryPrefixContext.Provider value={value}>
      {children}
    </CategoryPrefixContext.Provider>
  )
}

/** Whether calendar task titles should be prefixed with their category name. */
export function useShowCategoryPrefix(): boolean {
  return useContext(CategoryPrefixContext)
}
