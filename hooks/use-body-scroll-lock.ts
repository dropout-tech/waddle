'use client'

import { useEffect } from 'react'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/utils'

/** Locks body scroll while `active` is true; releases on unmount. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [active])
}
