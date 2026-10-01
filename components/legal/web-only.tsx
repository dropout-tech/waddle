'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { isNative } from '@/lib/platform'

/**
 * Renders its children everywhere except inside the native iOS/Android shell.
 *
 * Used for text that describes buying Huddle Pro on the website. Apple App
 * Review Guideline 3.1.1(a) does not allow the app to point to purchase
 * methods other than in-app purchase, and the legal pages are bundled into the
 * Capacitor static export. The text is present in the static HTML (so browsers
 * and reviewers of the website see it) and is removed after mount in the app.
 */
const noopSubscribe = () => () => {}

/** false during SSR / static prerender and first hydration, then the real value (no mismatch). */
export function useIsNativeShell(): boolean {
  return useSyncExternalStore(noopSubscribe, isNative, () => false)
}

export function WebOnly({ children }: { children: ReactNode }) {
  return useIsNativeShell() ? null : <>{children}</>
}
