import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Noto_Sans_TC } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { NativeShell } from '@/components/native/native-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { FocusTimerProvider } from '@/components/timer/focus-timer-provider'
import { OperationsNotices } from '@/components/operations/announcements'
import { EnrollmentBridge } from '@/components/operations/enrollment-bridge'
import { FloatingHub } from '@/components/floating/floating-hub'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-tc',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://waddle.zeabur.app'),
  title: 'Huddle｜慢慢搖擺，把事情做完',
  description:
    '把任務、行程、專注與筆記收進同一張桌面。Huddle 是一個溫柔、不催促的個人工作空間。',
  applicationName: 'Huddle',
  openGraph: {
    title: 'Huddle｜慢慢搖擺，把事情做完',
    description: '把任務、行程、專注與筆記收進同一張桌面。',
    type: 'website',
    locale: 'zh_TW',
    images: [{ url: '/app-icon-512.png', width: 512, height: 512, alt: 'Huddle' }],
  },
  twitter: {
    card: 'summary',
    title: 'Huddle｜慢慢搖擺，把事情做完',
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
  return (
    <html lang="zh-TW" className="bg-background" suppressHydrationWarning>
      <head>
        {/* Set viewport class before hydration so CSS / hooks see the right
            value on first paint and avoid the desktop-flash on mobile. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.huddleDesktop&&window.huddleDesktop.isDesktop&&window.huddleDesktop.platform==='darwin'&&!window.opener)document.documentElement.dataset.desktopTitlebar='mac';var m=window.matchMedia('(max-width:767px)').matches;document.documentElement.dataset.viewport=m?'mobile':'desktop';if(m)document.documentElement.classList.add('is-mobile');var f=localStorage.getItem('waddle-font-size-v1');var map={sm:'87.5%',lg:'112.5%',xl:'125%'};if(f&&map[f])document.documentElement.style.fontSize=map[f];}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geist.variable} ${geistMono.variable} ${notoSansTC.variable} font-sans antialiased`}
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
          <AuthProvider>
            <EnrollmentBridge />
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
              {children}
            </FocusTimerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
