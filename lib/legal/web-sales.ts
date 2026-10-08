import { APP_SHELL_BUILD } from '@/lib/legal/in-app-purchase'

/**
 * Website "on sale" wording (price, plan contents, trial, refund, operator name
 * and e-mail) for the public pages: marketing, terms, privacy, refunds, help.
 *
 * Same switch as the website card checkout (NEXT_PUBLIC_WEB_BILLING_ENABLED, set
 * at build time), so copy and checkout can never disagree. next.config.mjs blanks
 * that variable AND sets HUDDLE_APP_SHELL_BUILD for the Capacitor export, so in
 * the iOS bundle this is the constant `false` and every live-only string is
 * dead-code-eliminated (Apple 3.1.1(a)). Off by default: the website then keeps
 * the "not yet available" wording it has today.
 */
export const WEB_SALES_LIVE = !APP_SHELL_BUILD && process.env.NEXT_PUBLIC_WEB_BILLING_ENABLED === 'true'
