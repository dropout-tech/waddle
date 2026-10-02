'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { isNative } from '@/lib/platform'

const noopSubscribe = () => () => {}

/** false during SSR / static prerender and first hydration, then the real value (no mismatch). */
export function useIsNativeShell(): boolean {
  return useSyncExternalStore(noopSubscribe, isNative, () => false)
}

/** Runtime half of WebOnly: hides the children once mounted inside the native shell. */
export function WebOnlyClient({ children }: { children: ReactNode }) {
  return useIsNativeShell() ? null : <>{children}</>
}
