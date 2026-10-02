'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { APP_SHELL_BUILD } from '@/lib/billing/launch'
import { useIsNativeShell } from './web-only-client'

/**
 * The "Huddle" brand link in the legal-page header. On the website it goes to
 * the marketing page (/about); inside the native app that page lists website
 * prices and card payment (App Store Review Guideline 3.1.1), so it goes to the
 * app home instead. Server HTML on the website build is unchanged.
 */
export function LegalHomeLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const native = useIsNativeShell()
  return <Link href={APP_SHELL_BUILD || native ? '/' : href} className={className}>{children}</Link>
}
