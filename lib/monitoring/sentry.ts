import { getPlatform, isDesktop } from '@/lib/platform'
import { scrubBreadcrumb, scrubEvent } from '@/lib/monitoring/sentry-scrub'
import { buildSentryUser } from '@/lib/monitoring/sentry-user'

/**
 * Browser-side error reporting (Sentry), shared by the web build, the iOS
 * Capacitor shell (same static bundle) and the Electron desktop app (loads the
 * web build).
 *
 * Hard rules:
 *  - NEXT_PUBLIC_SENTRY_DSN unset → nothing is imported, initialised or sent.
 *  - Errors only: no tracing, no session replay, no release-health sessions,
 *    no console/UI breadcrumbs, no PII (see sentry-scrub.ts for the scrubbing).
 *  - @sentry/browser is loaded with a dynamic import so it never sits in the
 *    initial JS bundle, and not at all when the DSN is unset.
 *
 * Why @sentry/browser and not @sentry/nextjs: the iOS build is a pure static
 * export (no server), and @sentry/nextjs wraps next.config / adds server +
 * edge runtimes and a source-map upload step. We only need client errors.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || ''

type SentryModule = typeof import('@sentry/browser')
let sentryReady: Promise<SentryModule> | null = null
let sdk: SentryModule | null = null
let initFailed = false
// Errors reported before the SDK finished loading (it is a lazy chunk).
const MAX_QUEUED_ERRORS = 10
const queue: unknown[] = []
let currentUser: { id: string } | null = null

export function isMonitoringEnabled(): boolean {
  return DSN.length > 0
}

function currentPlatform(): 'web' | 'ios' | 'android' | 'desktop' {
  if (isDesktop()) return 'desktop'
  const p = getPlatform()
  return p === 'ios' || p === 'android' ? p : 'web'
}

/** Idempotent. Call once from a client component after mount. */
export function initMonitoring(): void {
  // Read the env var inline (not via DSN) so the bundler inlines '' and
  // dead-code-eliminates the import() below: with no DSN the Sentry chunk is
  // not even emitted into the build.
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  if (!DSN || sentryReady || typeof window === 'undefined') return

  sentryReady = import('@sentry/browser').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      release: `huddle@${process.env.NEXT_PUBLIC_APP_VERSION || 'unknown'}${
        process.env.NEXT_PUBLIC_COMMIT_SHA ? `+${process.env.NEXT_PUBLIC_COMMIT_SHA}` : ''
      }`,

      // v11 replaced `sendDefaultPii` with `dataCollection`; everything off.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        genAI: { inputs: false, outputs: false },
        graphQL: { document: false, variables: false },
      },

      // No tracesSampleRate/tracesSampler → tracing stays off (errors only).
      // Replay is a separate integration we never add.
      integrations: (defaults) => [
        ...defaults.filter((i) => !['Console', 'BrowserSession', 'Breadcrumbs'].includes(i.name)),
        // Navigation + network crumbs only (URLs are stripped in scrubBreadcrumb).
        Sentry.breadcrumbsIntegration({ dom: false, fetch: true, xhr: true, history: true, sentry: false }),
      ],
      maxBreadcrumbs: 20,
      maxValueLength: 250,
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      beforeSend: (event) => scrubEvent(event),

      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications.',
      ],
      denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:\/\//i],
    })

    Sentry.setTag('app_platform', currentPlatform())
    Sentry.setUser(currentUser)
    sdk = Sentry
    for (const err of queue.splice(0)) Sentry.captureException(err)
    return Sentry
  })
  sentryReady.catch(() => {
    initFailed = true // chunk blocked / offline: drop the queue, never retry-loop
    queue.length = 0
  })
}

/**
 * Called by AuthProvider on every sign-in / sign-out. Only the uuid is kept
 * (see sentry-user.ts). No-op when monitoring is disabled.
 */
export function setMonitoringUser(userId: string | null): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return // inlined: dead-code-eliminated without a DSN
  currentUser = buildSentryUser(userId)
  try {
    sdk?.setUser(currentUser)
  } catch {
    /* never let reporting throw */
  }
}

/**
 * Report a caught error. No-op when monitoring is disabled. Safe to call
 * before the SDK is ready (up to 10 errors are queued and sent once it loads)
 * and before initMonitoring() ever ran (e.g. app/global-error.tsx when the
 * root layout crashed): it starts the initialisation itself.
 */
export function captureClientError(error: unknown): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return // inlined: dead-code-eliminated without a DSN
  if (!DSN || initFailed || typeof window === 'undefined') return
  if (sdk) {
    try {
      sdk.captureException(error)
    } catch {
      /* never let reporting throw */
    }
    return
  }
  if (queue.length < MAX_QUEUED_ERRORS) queue.push(error)
  initMonitoring()
}
