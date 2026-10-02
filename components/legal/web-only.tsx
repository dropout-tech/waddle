import type { ReactNode } from 'react'
import { APP_SHELL_BUILD } from '@/lib/billing/launch'
import { WebOnlyClient } from './web-only-client'

export { useIsNativeShell } from './web-only-client'

/**
 * Renders its children everywhere except inside the native iOS/Android shell.
 *
 * Used for text that describes buying Huddle Pro on the website. Apple App
 * Review Guideline 3.1.1(a) does not allow the app to point to purchase
 * methods other than in-app purchase, and the legal pages are bundled into the
 * Capacitor static export.
 *
 * Two layers: in the Capacitor export (APP_SHELL_BUILD) the children are
 * dropped at build time, so they are not even in the bundled HTML or the RSC
 * payload. In the website build the text is present in the static HTML (so
 * browsers and reviewers of the website see it) and is removed after mount
 * when the page is opened inside a native shell.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  if (APP_SHELL_BUILD) return null
  return <WebOnlyClient>{children}</WebOnlyClient>
}
