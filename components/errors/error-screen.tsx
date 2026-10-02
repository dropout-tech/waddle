'use client'

import { useI18n } from '@/lib/i18n/react'

/**
 * Bilingual full-page message used by app/error.tsx, app/global-error.tsx and
 * app/not-found.tsx.
 *
 * It deliberately styles itself with inline styles + a tiny <style> block
 * instead of Tailwind classes, and uses its own fixed palette from DESIGN.md
 * (light: paper #f6f3e9 / ink #292b24 / terracotta #b8482a; dark, when the app
 * root carries the `dark` class like next-themes sets it: charcoal #22231e /
 * cream / mustard). app/global-error.tsx replaces the root layout, so
 * globals.css variables and the theme provider cannot be relied on there.
 *
 * Must stay a client component with no server-only APIs — the Capacitor build
 * statically exports this code into the iOS app.
 */
export type ErrorScreenProps = {
  title: string
  message: string
  /** Opaque error digest from Next.js, shown small so support can look it up. */
  digest?: string
  /** When set, a primary 「重試」 button is shown. */
  onRetry?: () => void
}

const CSS = `
.hd-err{--e-bg:#f6f3e9;--e-fg:#292b24;--e-mute:#6b6a5c;--e-pri:#b8482a;--e-pri-fg:#fbf9f2}
html.dark .hd-err{--e-bg:#22231e;--e-fg:#f3eedd;--e-mute:#b9b3a0;--e-pri:#edc747;--e-pri-fg:#292b24}
.hd-err{box-sizing:border-box;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));background:var(--e-bg);color:var(--e-fg);font-family:var(--font-sans,"Noto Sans TC",system-ui,-apple-system,"Segoe UI",sans-serif)}
.hd-err *{box-sizing:border-box}
.hd-err-card{width:100%;max-width:420px;text-align:center}
.hd-err-img{display:block;width:150px;max-width:50vw;height:auto;margin:0 auto 12px}
.hd-err h1{margin:0 0 8px;font-size:22px;line-height:1.35;font-weight:700;letter-spacing:-0.01em}
.hd-err p{margin:0;font-size:15px;line-height:1.6;color:var(--e-mute)}
.hd-err-code{margin-top:14px!important;font-size:12px!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.8}
.hd-err-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:24px}
.hd-err-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 22px;border-radius:12px;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;border:1.5px solid var(--e-fg);background:transparent;color:var(--e-fg)}
.hd-err-btn.is-primary{background:var(--e-pri);border-color:var(--e-pri);color:var(--e-pri-fg)}
.hd-err-btn:focus-visible{outline:2px solid var(--e-pri);outline-offset:2px}
.hd-err-btn:hover{opacity:.9}
`

export function ErrorScreen({ title, message, digest, onRetry }: ErrorScreenProps) {
  const { t } = useI18n()
  return (
    <main className="hd-err" role={onRetry ? 'alert' : undefined}>
      <style>{CSS}</style>
      <div className="hd-err-card">
        {/* Hand-drawn penguin mascot (public/art/penguin/splat.webp); decorative. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hd-err-img" src="/art/penguin/splat.webp" alt="" aria-hidden="true" width={150} height={150} />
        <h1>{t(title)}</h1>
        <p>{t(message)}</p>
        {digest ? <p className="hd-err-code">{t('錯誤代碼：{code}', { code: digest })}</p> : null}
        <div className="hd-err-actions">
          {onRetry ? (
            <button type="button" className="hd-err-btn is-primary" onClick={onRetry}>
              {t('重試')}
            </button>
          ) : null}
          {/* Plain <a>, not next/link: a full navigation clears whatever broke client-side state,
              and next/link needs a router that global-error may not have. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={onRetry ? 'hd-err-btn' : 'hd-err-btn is-primary'}>
            {t('回首頁')}
          </a>
        </div>
      </div>
    </main>
  )
}
