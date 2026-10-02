import type { Metadata, Viewport } from 'next'
import { preload } from 'react-dom'
import './globals.css'
import './art-theme.css'
import { SITE_ORIGIN } from '@/lib/site'
// Self-hosted fonts (Geist, Geist Mono, Noto Sans TC 400–700). Committed under
// app/fonts/ so production builds never fetch from Google — see
// scripts/fonts/vendor-fonts.mjs for how the files were produced.
import './fonts/app-fonts.css'
import geistLatin from './fonts/files/caa3a2e1cccd8315.woff2'
import geistMonoLatin from './fonts/files/797e433ab948586e.woff2'
import notoSansTCLatin from './fonts/files/fb4edce8a3cbfef3.woff2'
import barlowLatin from './fonts/files/89232e6535d3b87e.woff2'
import { AuthProvider } from '@/components/auth/auth-provider'
import { NativeShell } from '@/components/native/native-shell'
import { SentryInit } from '@/components/monitoring/sentry-init'
import { PwaSetup } from '@/components/pwa/pwa-setup'
import { ThemeProvider } from '@/components/theme-provider'
import { FocusTimerProvider } from '@/components/timer/focus-timer-provider'
import { OperationsNotices } from '@/components/operations/announcements'
import { EnrollmentBridge } from '@/components/operations/enrollment-bridge'
import { ImageCleanupBridge } from '@/components/storage/image-cleanup-bridge'
import { FloatingHub } from '@/components/floating/floating-hub'
import { StickyNotesProvider } from '@/components/sticky-notes/sticky-notes-provider'
import { BRAND_TITLE } from '@/lib/brand'
import { Toaster } from 'sonner'
import { DocumentLanguage } from '@/components/i18n/document-language'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: BRAND_TITLE,
  description:
    '把任務、行程、專注與筆記收進同一張桌面。Huddle 是一個溫柔、不催促的個人工作空間。',
  applicationName: 'Huddle',
  openGraph: {
    title: BRAND_TITLE,
    description: '把任務、行程、專注與筆記收進同一張桌面。',
    type: 'website',
    locale: 'zh_TW',
    images: [{ url: '/app-icon-512.png', width: 512, height: 512, alt: 'Huddle' }],
  },
  twitter: {
    card: 'summary',
    title: BRAND_TITLE,
    description: '把任務、行程、專注與筆記收進同一張桌面。',
    images: ['/app-icon-512.png'],
  },
  appleWebApp: {
    capable: true,
    title: 'Huddle',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        type: 'image/png',
        sizes: '32x32',
        media: '(prefers-color-scheme: dark)',
      },
      { url: '/app-icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/app-icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4d977' },
    { media: '(prefers-color-scheme: dark)', color: '#2a2a2a' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Same latin slices next/font used to preload, so first paint is unchanged.
  // Barlow (marketing headline) is preloaded here because the marketing page
  // renders client-side only — a preload from inside it would come too late.
  for (const href of [geistLatin, geistMonoLatin, notoSansTCLatin, barlowLatin]) {
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })
  }
  // data-art="paper": the app's paper look (app/art-theme.css), on by default.
  // Public marketing opts out via [data-surface='marketing'].
  return (
    <html lang="zh-TW" className="bg-background" data-art="paper" suppressHydrationWarning>
      <head>
        {/* Set viewport class before hydration so CSS / hooks see the right
            value on first paint and avoid the desktop-flash on mobile.
            Also parks Chrome's install prompt (beforeinstallprompt) for the
            user-menu 「安裝到手機」 row — it can fire before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.huddleDesktop&&window.huddleDesktop.isDesktop&&window.huddleDesktop.platform==='darwin'&&!window.opener)document.documentElement.dataset.desktopTitlebar='mac';var p=location.pathname;if(p==='/en'||p.indexOf('/en/')===0)document.documentElement.lang='en';var m=window.matchMedia('(max-width:767px)').matches;document.documentElement.dataset.viewport=m?'mobile':'desktop';if(m)document.documentElement.classList.add('is-mobile');var f=localStorage.getItem('waddle-font-size-v1');var map={sm:'87.5%',lg:'112.5%',xl:'125%'};if(f&&map[f])document.documentElement.style.fontSize=map[f];}catch(e){}try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__huddleInstallPrompt=e})}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="huddle-app-fonts font-sans antialiased"
      >
        <template dangerouslySetInnerHTML={{ __html: `<!--
THESIS: Huddle makes a personal working day tangible as a hand-printed desk poster.
OWN-WORLD: Mustard paper, cream margins, ink-black heavy type, hand-drawn desk objects and real product captures. Applies only to public marketing.
STORY: Recognize scattered tasks, see them organized beside a calendar, try the workspace or download Mac beta.
FIRST VIEWPORT: Cream navigation, large centered black headline on yellow, actions below, actual calendar in a central dark monitor framed by plant and lamp.
FORM: User-approved independent exhibition poster; challenger brand identity; seed 58f78b58. The user's supplied composition is final authority.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->` }} />
        {/* Opt-in dark mode: defaults to light (the product's light-first
            stance) and only switches when the user explicitly toggles it, so
            no dark-OS surprise. `attribute="class"` writes `.dark` on <html>,
            which the dark tokens in globals.css and NativeShell's status-bar
            observer both key off. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <NativeShell />
          <SentryInit />
          <PwaSetup />
          <AuthProvider>
            <EnrollmentBridge />
            <ImageCleanupBridge />
            <OperationsNotices />
            {/* Cross-route focus timer state — mounted above the router
                outlet so a running session (and its BGM) survives
                navigating to any route, not just while MainLayout happens
                to be mounted. See focus-timer-provider.tsx. */}
            <FocusTimerProvider>
              {/* 懸浮工作站：唯一那顆永遠置頂的視窗（計時器/記事本/白板
                  三分頁共用）。掛在 FocusTimerProvider 裡面，計時器分頁
                  才吃得到同一份計時狀態。 */}
              <FloatingHub />
              {/* 便條紙玻璃層：跟懸浮工作站一樣掛在 router outlet 之上，
                  換頁／切分頁都不卸載，所有頁面共用同一組便條。開關與
                  「新增便條紙」動作在 UserMenu 裡（頂部使用者選單）。 */}
              <StickyNotesProvider>{children}</StickyNotesProvider>
            </FocusTimerProvider>
          </AuthProvider>
          {/* The one toast outlet for every route (it used to live only on
              the home page, so toasts on /org, /assignments, invites and
              /notebook vanished). */}
          <Toaster position="bottom-right" richColors closeButton />
          <DocumentLanguage />
        </ThemeProvider>
      </body>
    </html>
  )
}
